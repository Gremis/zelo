import "server-only";
import { createOccurrenceEventRepository } from "./event.repository";
import { createOccurrenceEventService } from "./event.service";

export function occurrenceEvents(
  responseHeaders?: Headers,
  uploadSecret?: string,
) {
  return createOccurrenceEventService(
    createOccurrenceEventRepository(responseHeaders, uploadSecret),
  );
}
