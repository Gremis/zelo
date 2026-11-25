import {
  date,
  integer,
  nullableString,
  record,
  string,
} from "./contract-utils";

export const QUEUE_STATUSES = [
  "new",
  "in_progress",
  "delegated",
  "completed",
] as const;
export const QUEUE_PRIORITIES = ["urgent", "normal", "low"] as const;
export type QueueStatus = (typeof QUEUE_STATUSES)[number];
export type QueuePriority = (typeof QUEUE_PRIORITIES)[number];

export type QueueCard = {
  id: string;
  number: number;
  isDemo?: boolean;
  status: QueueStatus;
  condominium: { id: string; name: string };
  reporterUnitOrRole: string | null;
  description: string;
  location: string | null;
  suggestedPriority: QueuePriority | null;
  finalPriority: QueuePriority | null;
  effectivePriority: QueuePriority | null;
  suggestionReason: string | null;
  suggestionSource: "rules" | "ai" | null;
  suggestionPending: boolean;
  reporterName: string | null;
  registeredAt: string;
  completedAt: string | null;
  responsibleName?: string | null;
  dueDate?: string | null;
  taskStarted?: boolean;
  completedByEmployee?: string | null;
};

export type PortfolioQueue = {
  columns: Record<QueueStatus, { count: number; items: QueueCard[] }>;
  openByPriority: Record<QueuePriority | "unclassified", number>;
};

function priority(value: unknown): QueuePriority | null {
  if (value === null) return null;
  if (!QUEUE_PRIORITIES.includes(value as QueuePriority))
    throw new Error("Invalid queue priority.");
  return value as QueuePriority;
}

function card(value: unknown, status: QueueStatus): QueueCard {
  const row = record(value);
  const condominium = record(row.condominium);
  if (
    (row.isDemo !== undefined && typeof row.isDemo !== "boolean") ||
    row.status !== status ||
    typeof row.suggestionPending !== "boolean" ||
    ![null, "rules", "ai"].includes(row.suggestionSource as string | null)
  )
    throw new Error("Invalid queue card.");
  const result: QueueCard = {
    id: string(row.id),
    number: integer(row.number),
    ...(row.isDemo === undefined ? {} : { isDemo: row.isDemo as boolean }),
    status,
    condominium: { id: string(condominium.id), name: string(condominium.name) },
    reporterUnitOrRole: nullableString(row.reporterUnitOrRole),
    description: string(row.description),
    location: nullableString(row.location),
    suggestedPriority: priority(row.suggestedPriority),
    finalPriority: priority(row.finalPriority),
    effectivePriority: priority(row.effectivePriority),
    suggestionReason: nullableString(row.suggestionReason),
    suggestionSource: row.suggestionSource as QueueCard["suggestionSource"],
    suggestionPending: row.suggestionPending,
    reporterName: nullableString(row.reporterName),
    registeredAt: date(row.registeredAt),
    completedAt: row.completedAt === null ? null : date(row.completedAt),
    responsibleName: nullableString(row.responsibleName ?? null),
    dueDate: nullableString(row.dueDate ?? null),
    ...(row.taskStarted === undefined
      ? {}
      : { taskStarted: row.taskStarted === true }),
    ...(row.completedByEmployee === undefined
      ? {}
      : { completedByEmployee: nullableString(row.completedByEmployee) }),
  };
  if (
    result.number < 1 ||
    result.effectivePriority !==
      (result.finalPriority ?? result.suggestedPriority)
  )
    throw new Error("Invalid queue priority decision.");
  return result;
}

export function parsePortfolioQueue(value: unknown): PortfolioQueue {
  const row = record(value);
  const columns = record(row.columns);
  const totals = record(row.openByPriority);
  const result = { columns: {}, openByPriority: {} } as PortfolioQueue;
  const expected = { urgent: 0, normal: 0, low: 0, unclassified: 0 };
  for (const status of QUEUE_STATUSES) {
    const column = record(columns[status]);
    if (!Array.isArray(column.items)) throw new Error("Invalid queue column.");
    const items = column.items.map((item) => card(item, status));
    const total = integer(column.count);
    if (total !== items.length) throw new Error("Incomplete queue column.");
    result.columns[status] = { count: total, items };
    if (status !== "completed")
      for (const item of items)
        expected[item.effectivePriority ?? "unclassified"] += 1;
  }
  for (const key of [...QUEUE_PRIORITIES, "unclassified"] as const) {
    result.openByPriority[key] = integer(totals[key]);
    if (result.openByPriority[key] !== expected[key])
      throw new Error("Inconsistent queue counts.");
  }
  return result;
}
