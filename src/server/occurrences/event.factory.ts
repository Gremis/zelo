import "server-only";
import { createOccurrenceEventRepository } from "./event.repository";
import { createOccurrenceEventService } from "./event.service";

export function occurrenceEvents(responseHeaders?: Headers) {
  return createOccurrenceEventService(
    createOccurrenceEventRepository(responseHeaders),
  );
}
