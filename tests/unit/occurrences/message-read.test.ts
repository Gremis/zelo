import { beforeEach, expect, test, vi } from "vitest";
import { POST } from "@/app/api/occurrences/[id]/message-read/route";
const identity = vi.hoisted(() => vi.fn());
vi.mock("server-only", () => ({}));
vi.mock("@/server/auth/identity", () => ({ confirmedIdentity: identity }));
const rpc = vi.fn();
const id = "77000000-0000-4000-8000-000000007704";
beforeEach(() => {
  vi.resetAllMocks();
  identity.mockResolvedValue({ supabase: { rpc } });
  rpc.mockResolvedValue({ data: 107, error: null });
});
function send(body: unknown) {
  return POST(
    new Request("http://localhost/api/occurrences/" + id + "/message-read", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    }),
    { params: Promise.resolve({ id }) },
  );
}
test("uses the authenticated client and validates the exact displayed marker", async () => {
  const result = await send({ throughEventId: 107 });
  expect(result.status).toBe(200);
  expect(await result.json()).toEqual({ throughEventId: 107 });
  expect(result.headers.get("cache-control")).toContain("no-store");
  expect(rpc).toHaveBeenCalledExactlyOnceWith(
    "read_occurrence_employee_messages",
    { target_occurrence: id, through_event: 107 },
  );
});
test.each([
  {},
  { throughEventId: -1 },
  { throughEventId: "107" },
  { throughEventId: 107, viewerId: "arbitrary" },
])("rejects invalid or injected markers %#", async (body) => {
  expect((await send(body)).status).toBe(400);
  expect(rpc).not.toHaveBeenCalled();
});
test("requires an active authenticated identity", async () => {
  identity.mockResolvedValue(null);
  expect((await send({ throughEventId: 107 })).status).toBe(401);
  expect(rpc).not.toHaveBeenCalled();
});
test.each([
  ["42501", 403],
  ["28000", 401],
  ["22023", 400],
  ["XX000", 503],
])(
  "propagates sanitized authorization or persistence failure %s",
  async (code, status) => {
    rpc.mockResolvedValue({
      data: null,
      error: { code, message: "Sensitive provider diagnostic" },
    });
    const response = await send({ throughEventId: 107 });
    expect(response.status).toBe(status);
    expect(await response.text()).not.toContain("Sensitive");
  },
);
