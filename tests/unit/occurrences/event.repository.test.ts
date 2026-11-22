import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createOccurrenceEventRepository } from "@/server/occurrences/event.repository";
import type { PublicRegistration } from "@/server/occurrences/contracts";

const state = vi.hoisted(() => ({ rpc: vi.fn(), createClient: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: state.createClient }));
const request = vi.fn();
const input: PublicRegistration = {
  type: "registered",
  condominiumSlug: "synthetic-abcd",
  reporterName: "Synthetic reporter",
  reporterPhone: "11900000000",
  reporterUnitOrRole: "Synthetic unit",
  description: "Synthetic report",
};
const occurrenceId = "64000000-0000-4000-8000-000000000001";
const receipt = {
  occurrence_id: occurrenceId,
  number: 1,
  tracking_code: "a".repeat(64),
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "synthetic-test-value");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "synthetic-test-value");
  vi.stubGlobal("fetch", request);
  state.createClient.mockResolvedValue({ rpc: state.rpc });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

test("registration uses one restricted RPC and returns a minimal receipt", async () => {
  request.mockResolvedValue(
    Response.json([{ ...receipt, private_field: "not returned" }]),
  );
  expect(await createOccurrenceEventRepository().registerPublic(input)).toEqual(
    { occurrenceId, number: 1, trackingCode: receipt.tracking_code },
  );
  expect(request).toHaveBeenCalledTimes(1);
  const [url, options] = request.mock.calls[0];
  expect(String(url)).toBe(
    "http://127.0.0.1:54321/rest/v1/rpc/register_public_occurrence",
  );
  expect(options.cache).toBe("no-store");
  expect(JSON.parse(options.body)).toEqual({
    condominium_slug: input.condominiumSlug,
    reporter_name: input.reporterName,
    reporter_phone: input.reporterPhone,
    reporter_unit_or_role: input.reporterUnitOrRole,
    description: input.description,
  });
  expect(state.createClient).not.toHaveBeenCalled();
});

test.each([
  ["22023", "invalid_input"],
  ["42501", "access_denied"],
  ["P0001", "unavailable"],
])("maps %s without exposing provider details", async (code, expected) => {
  request.mockResolvedValue(
    Response.json(
      { code, message: "Sensitive synthetic payload" },
      { status: 400 },
    ),
  );
  const error = await createOccurrenceEventRepository()
    .registerPublic(input)
    .catch((value) => value);
  expect(error.code).toBe(expected);
  expect(error.message).not.toContain("Sensitive");
  expect(error.cause).toBeUndefined();
  expect(request).toHaveBeenCalledTimes(1);
});

test("network failures do not echo request data or credentials", async () => {
  request.mockRejectedValue(new Error("Sensitive synthetic network error"));
  await expect(
    createOccurrenceEventRepository().registerPublic(input),
  ).rejects.toMatchObject({
    code: "unavailable",
    message: "Occurrence operation could not be completed.",
  });
  expect(request).toHaveBeenCalledTimes(1);
});

test.each([
  { data: [] },
  { data: [receipt, receipt] },
  { data: [{ ...receipt, tracking_code: "invalid" }] },
  { data: [{ ...receipt, number: Number.MAX_SAFE_INTEGER + 1 }] },
])("rejects malformed or unsafe receipts %#", async ({ data }) => {
  request.mockResolvedValue(Response.json(data));
  await expect(
    createOccurrenceEventRepository().registerPublic(input),
  ).rejects.toMatchObject({ code: "unavailable" });
});

test("configuration is validated at call time without making a request on failure", async () => {
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
  const repository = createOccurrenceEventRepository();
  await expect(repository.registerPublic(input)).rejects.toMatchObject({
    code: "unavailable",
  });
  expect(request).not.toHaveBeenCalled();
});

test("notes use the existing session client and do not need a server credential", async () => {
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
  state.rpc.mockResolvedValue({ data: 2, error: null });
  const headers = new Headers();
  expect(
    await createOccurrenceEventRepository(headers).appendInternalNote({
      type: "manager_update",
      occurrenceId,
      note: "Internal note",
    }),
  ).toEqual({ eventId: 2 });
  expect(state.createClient).toHaveBeenCalledExactlyOnceWith(headers);
  expect(state.rpc).toHaveBeenCalledExactlyOnceWith("append_occurrence_note", {
    target_occurrence: occurrenceId,
    note: "Internal note",
  });
  expect(request).not.toHaveBeenCalled();
});

test("session/portfolio denial stays sanitized", async () => {
  state.rpc.mockResolvedValue({
    data: null,
    error: { code: "42501", message: "Provider payload" },
  });
  await expect(
    createOccurrenceEventRepository().appendInternalNote({
      type: "manager_update",
      occurrenceId,
      note: "Internal note",
    }),
  ).rejects.toMatchObject({
    code: "access_denied",
    message: "Occurrence operation could not be completed.",
  });
});
