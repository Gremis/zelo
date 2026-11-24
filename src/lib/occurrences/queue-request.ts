import { parsePortfolioQueue } from "@/server/occurrences/queue.contract";

export class QueueLoadError extends Error {
  constructor(public readonly status: 401 | 403 | 503) {
    super("Occurrence queue could not be loaded.");
    this.name = "QueueLoadError";
  }
}

export async function loadOccurrenceQueue(signal?: AbortSignal) {
  try {
    const timeout = AbortSignal.timeout(15_000);
    const response = await fetch("/api/occurrences/queue", {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
    if (!response.ok)
      throw new QueueLoadError(
        response.status === 401 ? 401 : response.status === 403 ? 403 : 503,
      );
    return parsePortfolioQueue(await response.json());
  } catch (error) {
    if (error instanceof QueueLoadError) throw error;
    throw new QueueLoadError(503);
  }
}
