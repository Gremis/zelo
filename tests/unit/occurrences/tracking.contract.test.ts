import { expect, test } from "vitest";
import { parseOccurrenceTracking } from "@/server/occurrences/tracking.contract";
import { occurrenceTrackingFixture } from "../../fixtures/tracking";

function value() {
  return structuredClone(occurrenceTrackingFixture()) as unknown as Record<
    string,
    unknown
  >;
}

test("accepts the restricted resident payload", () => {
  const tracking = occurrenceTrackingFixture();
  expect(parseOccurrenceTracking(structuredClone(tracking))).toEqual(tracking);
});

test.each([null, undefined, {}, []])(
  "rejects a non-tracking payload %#",
  (payload) => {
    expect(() => parseOccurrenceTracking(payload)).toThrow();
  },
);

test.each([
  [
    "unknown step",
    (row: Record<string, unknown>) => {
      (row.situation as Record<string, unknown>).step = "reopened";
    },
  ],
  [
    "label that does not match the step",
    (row: Record<string, unknown>) => {
      (row.situation as Record<string, unknown>).label = "Concluída";
    },
  ],
  [
    "missing condominium name",
    (row: Record<string, unknown>) => {
      row.condominiumName = " ";
    },
  ],
  [
    "negative number",
    (row: Record<string, unknown>) => {
      row.number = 0;
    },
  ],
  [
    "invalid registration date",
    (row: Record<string, unknown>) => {
      row.registeredAt = "not a date";
    },
  ],
  [
    "missing description",
    (row: Record<string, unknown>) => {
      row.description = "";
    },
  ],
  [
    "updates that are not a list",
    (row: Record<string, unknown>) => {
      row.updates = {};
    },
  ],
  [
    "internal update text",
    (row: Record<string, unknown>) => {
      (row.updates as Record<string, unknown>[])[0].text =
        "Nota interna do síndico";
    },
  ],
  [
    "deadline with a full date",
    (row: Record<string, unknown>) => {
      (row.updates as Record<string, unknown>[])[0].text =
        "Atendimento previsto para 20/12/2026.";
    },
  ],
  [
    "invalid update date",
    (row: Record<string, unknown>) => {
      (row.updates as Record<string, unknown>[])[0].occurredAt = "not a date";
    },
  ],
])("rejects %s", (_label, mutation) => {
  const tracking = value();
  mutation(tracking);
  expect(() => parseOccurrenceTracking(tracking)).toThrow();
});
