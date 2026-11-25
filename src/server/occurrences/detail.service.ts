import "server-only";
import { parseOccurrenceDetail } from "./detail.contract";

const uuid = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export class OccurrenceReadError extends Error {
  constructor(public readonly status: 401 | 403 | 404 | 503) {
    super("Occurrence detail could not be loaded.");
    this.name = "OccurrenceReadError";
  }
}

type DetailReader = {
  rpc(
    name: "occurrence_detail",
    args: { target_occurrence: string },
  ): PromiseLike<{ data: unknown; error: { code?: string } | null }>;
};

export async function loadOccurrenceDetail(
  client: DetailReader,
  occurrenceId: string,
) {
  if (!uuid.test(occurrenceId)) throw new OccurrenceReadError(404);
  try {
    const { data, error } = await client.rpc("occurrence_detail", {
      target_occurrence: occurrenceId,
    });
    if (error)
      throw new OccurrenceReadError(
        error.code === "28000" ? 401 : error.code === "42501" ? 403 : 503,
      );
    if (data === null) throw new OccurrenceReadError(404);
    return parseOccurrenceDetail(data);
  } catch (error) {
    if (error instanceof OccurrenceReadError) throw error;
    throw new OccurrenceReadError(503);
  }
}
