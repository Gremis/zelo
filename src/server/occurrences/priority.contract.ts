import { boolean, record } from "./contract-utils";
import {
  PRIORITY_CHANGE_REASONS,
  type PriorityChangeReason,
} from "./detail.contract";
import { QUEUE_PRIORITIES, type QueuePriority } from "./queue.contract";

export type PriorityDecision = {
  finalPriority: QueuePriority | null;
  suggestionPending: boolean;
  priorityChangeReason: PriorityChangeReason | null;
};

function priority(value: unknown): QueuePriority | null {
  if (value === null) return null;
  if (!QUEUE_PRIORITIES.includes(value as QueuePriority))
    throw new Error("Invalid occurrence priority.");
  return value as QueuePriority;
}

function reason(value: unknown): PriorityChangeReason | null {
  if (value === null) return null;
  if (!PRIORITY_CHANGE_REASONS.includes(value as PriorityChangeReason))
    throw new Error("Invalid priority change reason.");
  return value as PriorityChangeReason;
}

export function parsePriorityDecision(value: unknown): PriorityDecision {
  const row = record(value);
  const result: PriorityDecision = {
    finalPriority: priority(row.finalPriority),
    suggestionPending: boolean(row.suggestionPending),
    priorityChangeReason: reason(row.priorityChangeReason),
  };
  if (
    result.suggestionPending !== (result.finalPriority === null) ||
    (result.priorityChangeReason !== null && result.finalPriority === null)
  )
    throw new Error("Inconsistent priority decision.");
  return result;
}
