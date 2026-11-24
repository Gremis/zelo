import { afterEach, expect, test, vi } from "vitest";
import { createPublicOccurrenceOperations } from "@/lib/public-occurrences/operations";
import {
  publicCondominiumFixture,
  publicRegistrationFixture,
} from "../fixtures/public-occurrence";

const api = createPublicOccurrenceOperations();
const attempt = {
  key: "60000000-0000-4000-8000-000000000001",
  fields: publicRegistrationFixture,
};
afterEach(() => vi.unstubAllGlobals());

test("lookup uses the public route without credentials and projects only presentation data", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(
      Response.json({ ...publicCondominiumFixture, unexpected: "ignored" }),
    );
  vi.stubGlobal("fetch", fetcher);
  expect(await api.load("review-abcd")).toEqual({
    ok: true,
    data: publicCondominiumFixture,
  });
  expect(fetcher).toHaveBeenCalledWith(
    "/api/public/condominiums/review-abcd",
    expect.objectContaining({ credentials: "omit", cache: "no-store" }),
  );
});

test.each([404, 503])("lookup distinguishes HTTP %i", async (status) => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(Response.json({}, { status })),
  );
  expect(await api.load("review-abcd")).toEqual({
    ok: false,
    error: status === 404 ? "not_found" : "unavailable",
  });
});

test("POST sends exactly the attempt payload and key and accepts only a number receipt", async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json({ number: 123 }));
  vi.stubGlobal("fetch", fetcher);
  expect(await api.register("review-abcd", attempt)).toEqual({
    ok: true,
    number: 123,
  });
  expect(fetcher).toHaveBeenCalledWith(
    "/api/public/condominiums/review-abcd/occurrences",
    expect.objectContaining({
      method: "POST",
      credentials: "omit",
      body: JSON.stringify(attempt.fields),
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": attempt.key,
      },
    }),
  );
});

test.each([
  { number: 0 },
  { number: "123" },
  { number: 1, trackingCode: "private" },
  {},
  { number: Number.MAX_SAFE_INTEGER + 1 },
])("malformed successful responses remain uncertain: %j", async (body) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(body)));
  expect(await api.register("review-abcd", attempt)).toEqual({
    ok: false,
    error: "uncertain",
  });
});

test.each([409, 404, 503])(
  "submission maps HTTP %i without automatic retry",
  async (status) => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({}, { status }));
    vi.stubGlobal("fetch", fetcher);
    expect(await api.register("review-abcd", attempt)).toEqual({
      ok: false,
      error:
        status === 409
          ? "conflict"
          : status === 404
            ? "not_found"
            : "uncertain",
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  },
);

test("maps only known server field errors", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        Response.json(
          { fields: { reporterName: "Confira seu nome.", private: "ignored" } },
          { status: 400 },
        ),
      ),
  );
  expect(await api.register("review-abcd", attempt)).toEqual({
    ok: false,
    error: "invalid_input",
    fields: { reporterName: "Confira seu nome." },
  });
});

test("a network failure preserves an uncertain outcome", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("network")));
  expect(await api.register("review-abcd", attempt)).toEqual({
    ok: false,
    error: "uncertain",
  });
});
