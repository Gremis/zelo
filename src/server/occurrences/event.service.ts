import "server-only";
import { detectRisk } from "@/lib/occurrences/risk-rules";
import {
  OccurrenceWriteError,
  type InternalNote,
  type OccurrenceEventRepository,
  type OccurrenceEventService,
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
): OccurrenceEventService {
  return {
    async registerPublic(input: PublicRegistration) {
      exactFields(input, [
        ...(input?.attemptKey !== undefined ? ["attemptKey"] : []),
        "type",
        "condominiumSlug",
        "reporterName",
        "reporterPhone",
        "reporterUnitOrRole",
        "location",
        "description",
      ]);
      if (
        (input.attemptKey !== undefined &&
          (typeof input.attemptKey !== "string" ||
            !uuid.test(input.attemptKey))) ||
        input.type !== "registered" ||
        typeof input.condominiumSlug !== "string" ||
        input.condominiumSlug.length > 200 ||
        !slug.test(input.condominiumSlug) ||
        typeof input.reporterPhone !== "string" ||
        !/^[1-9][0-9]{9,10}$/.test(input.reporterPhone)
      )
        throw new OccurrenceWriteError("invalid_input");
      const location = text(input.location, 200);
      const description = text(input.description, 10000);
      const risk = detectRisk(location, description);
      return repository.registerPublic({
        type: "registered",
        ...(input.attemptKey !== undefined
          ? { attemptKey: input.attemptKey }
          : {}),
        condominiumSlug: input.condominiumSlug,
        reporterName: text(input.reporterName, 200),
        reporterPhone: input.reporterPhone,
        reporterUnitOrRole: text(input.reporterUnitOrRole, 200),
        location,
        description,
        suggestedPriority: risk.hasRisk ? "urgent" : "normal",
        suggestionReason: risk.hasRisk
          ? `Menciona ${risk.term}: risco à segurança.`
          : "Sem sinal de risco no relato.",
        suggestionSource: "rules",
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
