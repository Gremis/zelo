import { afterEach, expect, test, vi } from "vitest";
import { confirmedIdentity } from "@/server/auth/identity";
import { GET } from "@/app/api/panel/route";
import { POST } from "@/app/api/panel/first-steps/dismiss/route";

vi.mock("server-only", () => ({}));
vi.mock("@/server/auth/identity", () => ({ confirmedIdentity: vi.fn() }));
afterEach(() => vi.resetAllMocks());

function identity(dismissed: string | null = null, count = 0) {
  const rpc = vi
    .fn()
    .mockResolvedValue({ data: "2026-11-24T12:00:00Z", error: null });
  const profile = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: {
        full_name: "Synthetic manager",
        is_sindico: true,
        first_steps_dismissed_at: dismissed,
      },
      error: null,
    }),
  };
  const condos = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockResolvedValue({ count, error: null }),
  };
  vi.mocked(confirmedIdentity).mockResolvedValue({
    user: { id: "synthetic" },
    supabase: {
      from: (table: string) => (table === "profiles" ? profile : condos),
      rpc,
    },
  } as unknown as NonNullable<Awaited<ReturnType<typeof confirmedIdentity>>>);
  return { rpc };
}
const request = () =>
  new Request("http://localhost:3000/api/panel/first-steps/dismiss", {
    method: "POST",
  });

test.each([null, "2026-11-24T12:00:00Z"])(
  "panel reads the saved preference without inventing completed steps: %s",
  async (dismissed) => {
    identity(dismissed);
    const response = await GET();
    expect(response.status).toBe(200);
    expect((await response.json()).firstSteps).toEqual({
      completed: [],
      dismissed: dismissed !== null,
    });
  },
);

test("dismissal does not change the progress computed from real condominiums", async () => {
  identity("2026-11-24T12:00:00Z", 1);
  expect((await (await GET()).json()).firstSteps).toEqual({
    completed: ["condominium"],
    dismissed: true,
  });
});

test("protected dismissal calls the account-scoped RPC without accepting an identity", async () => {
  const { rpc } = identity();
  const response = await POST(request());
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(await response.json()).toEqual({ dismissed: true });
  expect(rpc).toHaveBeenCalledWith("dismiss_first_steps");
});

test("unsigned requests do not write", async () => {
  vi.mocked(confirmedIdentity).mockResolvedValue(null);
  expect((await POST(request())).status).toBe(401);
});

test("caller-selected identity/body and query parameters are rejected", async () => {
  const { rpc } = identity();
  expect(
    (
      await POST(
        new Request(`${request().url}?account=forged`, { method: "POST" }),
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await POST(
        new Request(request().url, {
          method: "POST",
          body: JSON.stringify({ id: "forged" }),
        }),
      )
    ).status,
  ).toBe(400);
  expect(rpc).not.toHaveBeenCalled();
});

test("cross-origin writes are rejected before resolving identity", async () => {
  expect(
    (
      await POST(
        new Request(request().url, {
          method: "POST",
          headers: { Origin: "https://untrusted.example.invalid" },
        }),
      )
    ).status,
  ).toBe(403);
  expect(confirmedIdentity).not.toHaveBeenCalled();
});

test.each(["42501", "P0001"])(
  "RPC failure %s is not reported as successful dismissal",
  async (code) => {
    const { rpc } = identity();
    rpc.mockResolvedValue({
      data: null,
      error: { code, message: "Private database diagnostics" },
    });
    const response = await POST(request());
    expect(response.status).toBe(code === "42501" ? 403 : 503);
    expect(await response.text()).not.toContain("Private database diagnostics");
  },
);
