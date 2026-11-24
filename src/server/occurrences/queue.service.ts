import "server-only";
import { parsePortfolioQueue } from "./queue.contract";

export class QueueReadError extends Error {
  constructor(public readonly status: 401 | 403 | 503) {
    super("Portfolio queue unavailable.");
    this.name = "QueueReadError";
  }
}

type QueueReader = {
  rpc(name: "portfolio_occurrence_queue"): PromiseLike<{
    data: unknown;
    error: { code?: string } | null;
  }>;
};

export async function loadPortfolioQueue(client: QueueReader) {
  try {
    const { data, error } = await client.rpc("portfolio_occurrence_queue");
    if (error)
      throw new QueueReadError(
        error.code === "28000" ? 401 : error.code === "42501" ? 403 : 503,
      );
    return parsePortfolioQueue(data);
  } catch (error) {
    if (error instanceof QueueReadError) throw error;
    throw new QueueReadError(503);
  }
}
