import type { SetAllCookies } from "@supabase/ssr";
import { NextRequest } from "next/server";
import { afterEach, expect, it, vi } from "vitest";
import { updateSession } from "@/lib/supabase/proxy";

const state = vi.hoisted(() => ({ write: null as SetAllCookies | null }));
vi.mock("@supabase/ssr", () => ({
  createServerClient: (
    _url: string,
    _key: string,
    options: { cookies: { setAll: SetAllCookies } },
  ) => {
    state.write = options.cookies.setAll;
    return {
      auth: {
        getUser: async () => {
          await state.write?.(
            [
              { name: "test-session", value: "first", options: { path: "/" } },
              {
                name: "sb-local-auth-token",
                value: "renewed",
                options: { path: "/", maxAge: 4000 },
              },
            ],
            {
              "Cache-Control": "private, no-store",
              Pragma: "no-cache",
              Expires: "0",
            },
          );
          await state.write?.(
            [{ name: "test-session", value: "second", options: { path: "/" } }],
            {},
          );
          return { data: { user: null }, error: null };
        },
      },
    };
  },
}));
afterEach(() => vi.unstubAllEnvs());

it("preserves cache headers on subsequent writes while forwarding the newest request cookie", async () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-public-key");
  const request = new NextRequest("http://localhost:3000/api/auth/session");
  const response = await updateSession(request);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("pragma")).toBe("no-cache");
  expect(response.headers.get("expires")).toBe("0");
  expect(response.cookies.get("test-session")?.value).toBe("second");
  expect(request.cookies.get("test-session")?.value).toBe("second");
  expect(response.headers.get("x-middleware-request-cookie")).toContain(
    "test-session=second",
  );
});

it("retains session cookie semantics during SSR renewal", async () => {
  const { sessionCookieOptions, PERSISTENCE_COOKIE } =
    await import("@/lib/supabase/persistence");
  const options = {
    path: "/",
    maxAge: 4000,
    expires: new Date(),
    sameSite: "lax" as const,
  };
  expect(sessionCookieOptions("sb-local-auth-token.0", options, false)).toEqual(
    { path: "/", sameSite: "lax" },
  );
  expect(sessionCookieOptions("sb-local-auth-token", options, true)).toEqual(
    options,
  );
  expect(
    sessionCookieOptions("sb-local-auth-token", { maxAge: 0 }, false),
  ).toEqual({ maxAge: 0 });
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-public-key");
  const request = new NextRequest("http://localhost:3000/api/auth/session", {
    headers: { cookie: `${PERSISTENCE_COOKIE}=session` },
  });
  const response = await updateSession(request);
  expect(response.cookies.get("test-session")?.value).toBe("second");
  expect(response.cookies.get("sb-local-auth-token")?.maxAge).toBeUndefined();
  expect(response.cookies.get("sb-local-auth-token")?.expires).toBeUndefined();
});
