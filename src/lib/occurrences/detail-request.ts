import { integer, record } from "@/server/occurrences/contract-utils";
import {
  parseOccurrenceDetail,
  type OccurrenceDetail,
  type PriorityChangeReason,
} from "@/server/occurrences/detail.contract";
import {
  parsePriorityDecision,
  type PriorityDecision,
} from "@/server/occurrences/priority.contract";
import type { QueuePriority } from "@/server/occurrences/queue.contract";

export class OccurrenceRequestError extends Error {
  constructor(public readonly status: 400 | 401 | 403 | 404 | 409 | 503) {
    super("Occurrence request could not be completed.");
    this.name = "OccurrenceRequestError";
  }
}

function failure(status: number): never {
  if (
    status === 400 ||
    status === 401 ||
    status === 403 ||
    status === 404 ||
    status === 409
  )
    throw new OccurrenceRequestError(status);
  throw new OccurrenceRequestError(503);
}

async function send(path: string, init: RequestInit, signal?: AbortSignal) {
  const timeout = AbortSignal.timeout(15_000);
  return fetch(path, {
    credentials: "same-origin",
    cache: "no-store",
    ...init,
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
}

export async function loadOccurrenceDetail(
  occurrenceId: string,
  signal?: AbortSignal,
): Promise<OccurrenceDetail> {
  try {
    const response = await send(
      `/api/occurrences/${encodeURIComponent(occurrenceId)}`,
      { method: "GET" },
      signal,
    );
    if (!response.ok) failure(response.status);
    return parseOccurrenceDetail(await response.json());
  } catch (error) {
    if (error instanceof OccurrenceRequestError) throw error;
    throw new OccurrenceRequestError(503);
  }
}

export async function saveOccurrencePriority(
  occurrenceId: string,
  priority: QueuePriority,
  reason: PriorityChangeReason | null,
  signal?: AbortSignal,
): Promise<PriorityDecision> {
  try {
    const response = await send(
      `/api/occurrences/${encodeURIComponent(occurrenceId)}/priority`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priority, reason }),
      },
      signal,
    );
    if (!response.ok) failure(response.status);
    return parsePriorityDecision(await response.json());
  } catch (error) {
    if (error instanceof OccurrenceRequestError) throw error;
    throw new OccurrenceRequestError(503);
  }
}

export async function addOccurrenceUpdate(
  occurrenceId: string,
  text: string,
  signal?: AbortSignal,
): Promise<{ eventId: number }> {
  try {
    const response = await send(
      `/api/occurrences/${encodeURIComponent(occurrenceId)}/updates`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      },
      signal,
    );
    if (!response.ok) failure(response.status);
    const eventId = integer(record(await response.json()).eventId);
    if (eventId < 1) throw new OccurrenceRequestError(503);
    return { eventId };
  } catch (error) {
    if (error instanceof OccurrenceRequestError) throw error;
    throw new OccurrenceRequestError(503);
  }
}
