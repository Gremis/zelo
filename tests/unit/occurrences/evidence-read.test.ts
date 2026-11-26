import { beforeEach, expect, test, vi } from "vitest";
import { GET } from "@/app/api/occurrences/[id]/attachments/[attachmentId]/route";
import { occurrenceDetailFixture } from "../../fixtures/occurrence-detail";
vi.mock("server-only", () => ({}));
const { identity, signed } = vi.hoisted(() => ({
  identity: vi.fn(),
  signed: vi.fn(),
}));
vi.mock("@/server/auth/identity", () => ({ confirmedIdentity: identity }));
vi.mock("@/server/occurrences/uploads", () => ({ signedEvidence: signed }));
const rpc = vi.fn(),
  single = vi.fn();
const query = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  maybeSingle: single,
};
const from = vi.fn(() => query);
const context = {
  params: Promise.resolve({
    id: occurrenceDetailFixture().id,
    attachmentId: "synthetic-attachment",
  }),
};
beforeEach(() => {
  vi.clearAllMocks();
  identity.mockResolvedValue({
    supabase: { rpc, from },
    user: { id: "synthetic-manager" },
  });
  rpc.mockResolvedValue({ data: occurrenceDetailFixture(), error: null });
  single.mockResolvedValue({
    data: { storage_path: "evidence/synthetic", content_type: "image/png" },
    error: null,
  });
  signed.mockResolvedValue("https://storage.example.invalid/signed-image");
});
test("preview retains portfolio authorization and does not force downloading", async () => {
  const response = await GET(
    new Request("http://localhost/attachment?preview=1"),
    context,
  );
  expect(response.status).toBe(302);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(signed).toHaveBeenCalledWith("evidence/synthetic", false);
});
test("the original route still forces an explicit download", async () => {
  expect(
    (await GET(new Request("http://localhost/attachment"), context)).status,
  ).toBe(302);
  expect(signed).toHaveBeenCalledWith("evidence/synthetic", true);
});
test.each(["application/pdf", "video/mp4", "image/svg+xml", "text/html"])(
  "preview refuses non-approved inline content %s",
  async (contentType) => {
    single.mockResolvedValue({
      data: { storage_path: "evidence/synthetic", content_type: contentType },
      error: null,
    });
    expect(
      (await GET(new Request("http://localhost/attachment?preview=1"), context))
        .status,
    ).toBe(400);
    expect(signed).not.toHaveBeenCalled();
  },
);
test("anonymous viewers cannot get a preview URL", async () => {
  identity.mockResolvedValue(null);
  expect(
    (await GET(new Request("http://localhost/attachment?preview=1"), context))
      .status,
  ).toBe(401);
  expect(signed).not.toHaveBeenCalled();
});
test("another portfolio is rejected before reading or signing the file", async () => {
  rpc.mockResolvedValue({ data: null, error: null });
  expect(
    (await GET(new Request("http://localhost/attachment?preview=1"), context))
      .status,
  ).toBe(404);
  expect(from).not.toHaveBeenCalled();
  expect(signed).not.toHaveBeenCalled();
});
