import { beforeEach, expect, test, vi } from "vitest";
import {
  loadOccurrenceDetail,
  OccurrenceReadError,
} from "@/server/occurrences/detail.service";
import {
  decideOccurrencePriority,
  PriorityWriteError,
} from "@/server/occurrences/priority.service";
import { occurrenceDetailFixture } from "../../fixtures/occurrence-detail";

vi.mock("server-only", () => ({}));

const rpc = vi.fn();
const client = { rpc };
const occurrenceId = "77000000-0000-4000-8000-000000007704";

beforeEach(() => vi.resetAllMocks());

test("reads one occurrence detail through the session client", async () => {
  const detail = occurrenceDetailFixture();
  rpc.mockResolvedValue({ data: detail, error: null });
  expect(await loadOccurrenceDetail(client, occurrenceId)).toEqual(detail);
  expect(rpc).toHaveBeenCalledExactlyOnceWith("occurrence_detail", {
    target_occurrence: occurrenceId,
  });
});

test("a missing occurrence is not found without leaking a provider error", async () => {
  rpc.mockResolvedValue({ data: null, error: null });
  await expect(
    loadOccurrenceDetail(client, occurrenceId),
  ).rejects.toMatchObject({ status: 404 });
});

test.each(["not-a-uuid", "77000000-0000-4000-8000", ""])(
  "rejects an invalid occurrence id before reading %s",
  async (value) => {
    await expect(loadOccurrenceDetail(client, value)).rejects.toMatchObject({
      status: 404,
    });
    expect(rpc).not.toHaveBeenCalled();
  },
);

test.each([
  ["28000", 401],
  ["42501", 403],
  ["XX000", 503],
])("maps detail error %s to %i", async (code, status) => {
  rpc.mockResolvedValue({ data: null, error: { code } });
  await expect(
    loadOccurrenceDetail(client, occurrenceId),
  ).rejects.toMatchObject({ status });
});

test("a malformed detail payload fails closed", async () => {
  rpc.mockResolvedValue({ data: { id: occurrenceId }, error: null });
  await expect(
    loadOccurrenceDetail(client, occurrenceId),
  ).rejects.toBeInstanceOf(OccurrenceReadError);
});

test("saves the final priority and reason in one call", async () => {
  rpc.mockResolvedValue({
    data: {
      finalPriority: "normal",
      suggestionPending: false,
      priorityChangeReason: "greater_risk",
    },
    error: null,
  });
  expect(
    await decideOccurrencePriority(client, occurrenceId, {
      priority: "normal",
      reason: "greater_risk",
    }),
  ).toEqual({
    finalPriority: "normal",
    suggestionPending: false,
    priorityChangeReason: "greater_risk",
  });
  expect(rpc).toHaveBeenCalledExactlyOnceWith("decide_occurrence_priority", {
    target_occurrence: occurrenceId,
    decided_priority: "normal",
    change_reason: "greater_risk",
  });
});

test("omitting the reason sends no stored motive", async () => {
  rpc.mockResolvedValue({
    data: {
      finalPriority: "normal",
      suggestionPending: false,
      priorityChangeReason: null,
    },
    error: null,
  });
  await decideOccurrencePriority(client, occurrenceId, {
    priority: "normal",
  });
  expect(rpc.mock.calls[0][1]).toMatchObject({ change_reason: null });
});

test.each([
  null,
  [],
  {},
  { priority: "high" },
  { priority: "normal", reason: "free_text" },
  { priority: "normal", reason: null, extra: true },
])("rejects an invalid priority body %#", async (body) => {
  await expect(
    decideOccurrencePriority(client, occurrenceId, body),
  ).rejects.toBeInstanceOf(PriorityWriteError);
  expect(rpc).not.toHaveBeenCalled();
});

test("rejects an invalid occurrence id before writing priority", async () => {
  await expect(
    decideOccurrencePriority(client, "invalid", { priority: "normal" }),
  ).rejects.toMatchObject({ status: 404 });
  expect(rpc).not.toHaveBeenCalled();
});

test.each([
  ["28000", 401],
  ["42501", 404],
  ["55000", 409],
  ["22023", 400],
  ["XX000", 503],
])("maps priority error %s to %i", async (code, status) => {
  rpc.mockResolvedValue({ data: null, error: { code } });
  await expect(
    decideOccurrencePriority(client, occurrenceId, { priority: "normal" }),
  ).rejects.toMatchObject({ status });
});

test("a malformed or inconsistent decision fails closed", async () => {
  rpc.mockResolvedValue({
    data: {
      finalPriority: "normal",
      suggestionPending: true,
      priorityChangeReason: null,
    },
    error: null,
  });
  await expect(
    decideOccurrencePriority(client, occurrenceId, { priority: "normal" }),
  ).rejects.toMatchObject({ status: 503 });
});
