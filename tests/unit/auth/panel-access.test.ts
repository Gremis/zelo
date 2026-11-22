import { afterEach, expect, test, vi } from "vitest";
import { GET } from "@/app/api/panel/route";
import { confirmedIdentity } from "@/server/auth/identity";

vi.mock("@/server/auth/identity", () => ({ confirmedIdentity: vi.fn() }));
afterEach(() => vi.resetAllMocks());

test("rejects missing or unconfirmed identity without querying private data", async () => {
  vi.mocked(confirmedIdentity).mockResolvedValue(null);
  const response = await GET();
  expect(response.status).toBe(401);
  expect(response.headers.get("cache-control")).toContain("no-store");
});

test("fails closed on an identity provider failure without exposing details", async () => {
  vi.mocked(confirmedIdentity).mockRejectedValue(
    new Error("private provider details"),
  );
  const response = await GET();
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("private provider details");
});
