import { expect, test } from "vitest";
import { parseOccurrenceDetail } from "@/server/occurrences/detail.contract";
import { occurrenceDetailFixture } from "../../fixtures/occurrence-detail";

function value() {
  return structuredClone(occurrenceDetailFixture()) as unknown as Record<
    string,
    unknown
  >;
}

test("accepts the complete backend detail payload", () => {
  const detail = occurrenceDetailFixture();
  expect(parseOccurrenceDetail(structuredClone(detail))).toEqual(detail);
});

test.each([null, undefined, {}, []])(
  "rejects a non-detail payload %#",
  (payload) => {
    expect(() => parseOccurrenceDetail(payload)).toThrow();
  },
);

test.each([
  ["negative number", (row: Record<string, unknown>) => (row.number = 0)],
  [
    "invalid tracking code",
    (row: Record<string, unknown>) => (row.trackingCode = "private"),
  ],
  ["unknown status", (row: Record<string, unknown>) => (row.status = "late")],
  [
    "unknown suggested priority",
    (row: Record<string, unknown>) => (row.suggestedPriority = "high"),
  ],
  [
    "effective priority mismatch",
    (row: Record<string, unknown>) => (row.effectivePriority = "normal"),
  ],
  [
    "pending suggestion with final priority",
    (row: Record<string, unknown>) => (row.finalPriority = "normal"),
  ],
  [
    "pending flag inconsistent with decision time",
    (row: Record<string, unknown>) =>
      (row.priorityDecidedAt = "2026-11-22T12:00:00Z"),
  ],
  [
    "open occurrence marked as locked",
    (row: Record<string, unknown>) => (row.canDecidePriority = false),
  ],
  [
    "completed occurrence marked as open",
    (row: Record<string, unknown>) => (row.status = "completed"),
  ],
  [
    "change reason without a different final priority",
    (row: Record<string, unknown>) => {
      row.finalPriority = "urgent";
      row.effectivePriority = "urgent";
      row.priorityDecidedAt = "2026-11-22T12:00:00Z";
      row.suggestionPending = false;
      row.priorityChangeReason = "greater_risk";
    },
  ],
  [
    "invalid suggestion source",
    (row: Record<string, unknown>) => (row.suggestionSource = "model"),
  ],
  [
    "history is not a list",
    (row: Record<string, unknown>) => (row.events = {}),
  ],
  [
    "unknown event type",
    (row: Record<string, unknown>) =>
      ((row.events as Record<string, unknown>[])[0].type = "priority_changed"),
  ],
  [
    "system author in history",
    (row: Record<string, unknown>) =>
      ((row.events as Record<string, unknown>[])[0].authorType = "system"),
  ],
  [
    "missing viewer flag",
    (row: Record<string, unknown>) =>
      delete (row.events as Record<string, unknown>[])[0].authorIsViewer,
  ],
  [
    "invalid event date",
    (row: Record<string, unknown>) =>
      ((row.events as Record<string, unknown>[])[0].occurredAt = "not a date"),
  ],
])("rejects %s", (_label, mutation) => {
  const detail = value();
  mutation(detail);
  expect(() => parseOccurrenceDetail(detail)).toThrow();
});
