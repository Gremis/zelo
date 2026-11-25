import "server-only";
import {
  PRIORITY_CHANGE_REASONS,
  type PriorityChangeReason,
} from "./detail.contract";
import { parsePriorityDecision } from "./priority.contract";
import { QUEUE_PRIORITIES, type QueuePriority } from "./queue.contract";

const uuid = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export class PriorityWriteError extends Error {
  constructor(public readonly status: 400 | 401 | 404 | 409 | 503) {
    super("Occurrence priority could not be updated.");
    this.name = "PriorityWriteError";
  }
}

type PriorityWriter = {
  rpc(
    name: "decide_occurrence_priority",
    args: {
      target_occurrence: string;
      decided_priority: string;
      change_reason: string | null;
    },
  ): PromiseLike<{ data: unknown; error: { code?: string } | null }>;
};

function decisionBody(value: unknown): {
  priority: QueuePriority;
  reason: PriorityChangeReason | null;
} {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new PriorityWriteError(400);
  const keys = Object.keys(value);
  if (
    !keys.includes("priority") ||
    keys.some((key) => !["priority", "reason"].includes(key))
  )
    throw new PriorityWriteError(400);
  const { priority, reason } = value as Record<string, unknown>;
  if (!QUEUE_PRIORITIES.includes(priority as QueuePriority))
    throw new PriorityWriteError(400);
  if (
    reason !== undefined &&
    reason !== null &&
    !PRIORITY_CHANGE_REASONS.includes(reason as PriorityChangeReason)
  )
    throw new PriorityWriteError(400);
  return {
    priority: priority as QueuePriority,
    reason: (reason ?? null) as PriorityChangeReason | null,
  };
}

export async function decideOccurrencePriority(
  client: PriorityWriter,
  occurrenceId: string,
  body: unknown,
) {
  if (!uuid.test(occurrenceId)) throw new PriorityWriteError(404);
  const decision = decisionBody(body);
  try {
    const { data, error } = await client.rpc("decide_occurrence_priority", {
      target_occurrence: occurrenceId,
      decided_priority: decision.priority,
      change_reason: decision.reason,
    });
    if (error)
      throw new PriorityWriteError(
        error.code === "28000"
          ? 401
          : error.code === "42501"
            ? 404
            : error.code === "55000"
              ? 409
              : error.code === "22023"
                ? 400
                : 503,
      );
    return parsePriorityDecision(data);
  } catch (error) {
    if (error instanceof PriorityWriteError) throw error;
    throw new PriorityWriteError(503);
  }
}
