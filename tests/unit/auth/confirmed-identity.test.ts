import { afterEach, expect, test, vi } from "vitest";
import { confirmedIdentity } from "@/server/auth/identity";

const state = vi.hoisted(() => ({ getUser: vi.fn(), rpc: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: state.getUser },
    rpc: state.rpc,
  }),
}));
afterEach(() => vi.resetAllMocks());

test.each([null, { id: "pending", email_confirmed_at: null }])(
  "rejects an absent or pending account: %s",
  async (user) => {
    state.getUser.mockResolvedValue({ data: { user }, error: null });
    expect(await confirmedIdentity()).toBeNull();
  },
);

test("requires server-verified identity even if a user payload is present", async () => {
  state.getUser.mockResolvedValue({
    data: { user: { id: "synthetic", email_confirmed_at: "2026-01-01" } },
    error: new Error("invalid"),
  });
  expect(await confirmedIdentity()).toBeNull();
});

test.each([false, null])(
  "rejects a revoked or missing session: %s",
  async (active) => {
    state.getUser.mockResolvedValue({
      data: { user: { id: "synthetic", email_confirmed_at: "2026-01-01" } },
      error: null,
    });
    state.rpc.mockResolvedValue({ data: active, error: null });
    expect(await confirmedIdentity()).toBeNull();
  },
);

test("fails closed when session verification is unavailable", async () => {
  state.getUser.mockResolvedValue({
    data: { user: { id: "synthetic", email_confirmed_at: "2026-01-01" } },
    error: null,
  });
  state.rpc.mockResolvedValue({
    data: null,
    error: { message: "unavailable" },
  });
  await expect(confirmedIdentity()).rejects.toThrow(
    "Session verification unavailable.",
  );
});
