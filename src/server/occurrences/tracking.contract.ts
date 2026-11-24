import {
  date,
  integer,
  nullableString,
  record,
  string,
} from "./contract-utils";

export const TRACKING_STEPS = ["received", "in_progress", "completed"] as const;
export const TRACKING_STEP_LABELS = {
  received: "Recebida pelo síndico",
  in_progress: "Em andamento",
  completed: "Concluída",
} as const;

export const TRACKING_UPDATE_TEXTS = [
  "Ocorrência registrada. O síndico já recebeu.",
  "O síndico está cuidando da ocorrência.",
  "A previsão de atendimento foi retirada.",
  "Ocorrência concluída.",
  "A ocorrência foi reaberta.",
] as const;
const deadlineText = /^Atendimento previsto para \d{2}\/\d{2}\.$/;

export type TrackingStep = (typeof TRACKING_STEPS)[number];

export type TrackingUpdate = {
  occurredAt: string;
  text: string;
};

export type OccurrenceTracking = {
  condominiumName: string;
  number: number;
  registeredAt: string;
  description: string;
  unit: string | null;
  location: string | null;
  situation: { step: TrackingStep; label: string };
  updates: TrackingUpdate[];
};

function step(value: unknown): TrackingStep {
  if (!TRACKING_STEPS.includes(value as TrackingStep))
    throw new Error("Invalid tracking step.");
  return value as TrackingStep;
}

function update(value: unknown): TrackingUpdate {
  const row = record(value);
  const text = string(row.text);
  if (
    !TRACKING_UPDATE_TEXTS.includes(
      text as (typeof TRACKING_UPDATE_TEXTS)[number],
    ) &&
    !deadlineText.test(text)
  )
    throw new Error("Invalid tracking update.");
  return { occurredAt: date(row.occurredAt), text };
}

export function parseOccurrenceTracking(value: unknown): OccurrenceTracking {
  const row = record(value);
  const situation = record(row.situation);
  if (!Array.isArray(row.updates)) throw new Error("Invalid tracking updates.");
  const current = step(situation.step);
  const result: OccurrenceTracking = {
    condominiumName: string(row.condominiumName),
    number: integer(row.number),
    registeredAt: date(row.registeredAt),
    description: string(row.description),
    unit: nullableString(row.unit),
    location: nullableString(row.location),
    situation: { step: current, label: string(situation.label) },
    updates: row.updates.map(update),
  };
  if (
    !result.condominiumName.trim() ||
    !result.description.trim() ||
    result.number < 1 ||
    result.situation.label !== TRACKING_STEP_LABELS[current]
  )
    throw new Error("Inconsistent occurrence tracking.");
  return result;
}
