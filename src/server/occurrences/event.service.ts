import "server-only";
import {
  OccurrenceWriteError,
  type InternalNote,
  type OccurrenceEventRepository,
  type PublicRegistration,
} from "./contracts";

const uuid = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const slug = /^[a-z0-9]+(-[a-z0-9]+)*-([0-9a-f]{32}|[a-z0-9]{4})$/;

function exactFields(value: unknown, keys: string[]) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).length !== keys.length ||
    Object.keys(value).some((key) => !keys.includes(key))
  )
    throw new OccurrenceWriteError("invalid_input");
}

function text(value: unknown, max: number) {
  if (
    typeof value !== "string" ||
    value.length > max ||
    !value.trim() ||
    value.includes("\0")
  )
    throw new OccurrenceWriteError("invalid_input");
  return value.trim();
}

export function createOccurrenceEventService(
  repository: OccurrenceEventRepository,
): OccurrenceEventRepository {
  return {
    async registerPublic(input: PublicRegistration) {
      exactFields(input, [
        "type",
        "condominiumSlug",
        "reporterName",
        "reporterPhone",
        "reporterUnitOrRole",
        "description",
      ]);
      if (
        input.type !== "registered" ||
        typeof input.condominiumSlug !== "string" ||
        input.condominiumSlug.length > 200 ||
        !slug.test(input.condominiumSlug) ||
        typeof input.reporterPhone !== "string" ||
        !/^[1-9][0-9]{9,10}$/.test(input.reporterPhone)
      )
        throw new OccurrenceWriteError("invalid_input");
      return repository.registerPublic({
        type: "registered",
        condominiumSlug: input.condominiumSlug,
        reporterName: text(input.reporterName, 200),
        reporterPhone: input.reporterPhone,
        reporterUnitOrRole: text(input.reporterUnitOrRole, 200),
        description: text(input.description, 10000),
      });
    },
    async appendInternalNote(input: InternalNote) {
      exactFields(input, ["type", "occurrenceId", "note"]);
      if (
        input.type !== "manager_update" ||
        typeof input.occurrenceId !== "string" ||
        !uuid.test(input.occurrenceId)
      )
        throw new OccurrenceWriteError("invalid_input");
      return repository.appendInternalNote({
        type: "manager_update",
        occurrenceId: input.occurrenceId,
        note: text(input.note, 10000),
      });
    },
  };
}
