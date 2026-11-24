import { afterEach, expect, test, vi } from "vitest";
import { POST } from "@/app/api/demo/prepare/route";
import { confirmedIdentity } from "@/server/auth/identity";
import { prepareAccountDemo } from "@/server/demo/prepare";

vi.mock("@/server/auth/identity", () => ({ confirmedIdentity: vi.fn() }));
vi.mock("@/server/demo/prepare", () => ({ prepareAccountDemo: vi.fn() }));
afterEach(() => vi.resetAllMocks());
const request = () =>
  new Request("http://localhost/api/demo/prepare", {
    method: "POST",
    body: JSON.stringify({ target_manager: "untrusted" }),
  });
function identity(manager = true) {
  vi.mocked(confirmedIdentity).mockResolvedValue({
    user: { id: "trusted-manager" },
    supabase: {
      from: () => ({
        select: () => ({
          eq: () => ({
            single: async () => ({
              data: { is_sindico: manager },
              error: null,
            }),
          }),
        }),
      }),
    },
  } as never);
}

test("uses only the confirmed identity, ignores caller account parameters and returns no receipt", async () => {
  identity();
  vi.mocked(prepareAccountDemo).mockResolvedValue({ status: "ready" });
  const response = await POST(request());
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ status: "ready" });
  expect(prepareAccountDemo).toHaveBeenCalledWith("trusted-manager");
  expect(response.headers.get("cache-control")).toContain("no-store");
});

test("rejects missing sessions and nonmanager profiles before preparation", async () => {
  vi.mocked(confirmedIdentity).mockResolvedValue(null);
  expect((await POST(request())).status).toBe(401);
  identity(false);
  expect((await POST(request())).status).toBe(403);
  expect(prepareAccountDemo).not.toHaveBeenCalled();
});

test("preparation failure is sanitized and retryable", async () => {
  identity();
  vi.mocked(prepareAccountDemo).mockRejectedValue(
    new Error("Private provider details"),
  );
  const response = await POST(request());
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("Private provider");
});

test("cross-origin POST is rejected before accessing identity or database", async () => {
  expect(
    (
      await POST(
        new Request("http://localhost/api/demo/prepare", {
          method: "POST",
          headers: { origin: "https://untrusted.invalid" },
        }),
      )
    ).status,
  ).toBe(403);
  expect(confirmedIdentity).not.toHaveBeenCalled();
  expect(prepareAccountDemo).not.toHaveBeenCalled();
});
