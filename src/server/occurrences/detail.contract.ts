import {
  boolean,
  date,
  integer,
  nullableString,
  record,
  string,
} from "./contract-utils";
import {
  QUEUE_PRIORITIES,
  QUEUE_STATUSES,
  type QueuePriority,
  type QueueStatus,
} from "./queue.contract";
import { TRACKING_CODE_PATTERN } from "../../lib/occurrences/tracking-link";

export const OCCURRENCE_EVENT_TYPES = [
  "registered",
  "responsible_changed",
  "deadline_changed",
  "manager_update",
  "employee_message",
  "completed",
  "reopened",
] as const;
export const OCCURRENCE_AUTHOR_TYPES = [
  "reporter",
  "manager",
  "employee",
] as const;
export const PRIORITY_CHANGE_REASONS = [
  "greater_risk",
  "lower_risk",
  "already_handled",
  "recurring",
  "other",
] as const;

export type OccurrenceEventType = (typeof OCCURRENCE_EVENT_TYPES)[number];
export type OccurrenceAuthorType = (typeof OCCURRENCE_AUTHOR_TYPES)[number];
export type PriorityChangeReason = (typeof PRIORITY_CHANGE_REASONS)[number];

export type OccurrenceEvent = {
  id: number;
  type: OccurrenceEventType;
  occurredAt: string;
  authorType: OccurrenceAuthorType;
  authorName: string;
  authorPhone: string | null;
  authorRole: string | null;
  authorIsViewer: boolean;
  text: string;
  attachments?: Array<{
    id: string;
    name: string;
    contentType: string;
    size: number;
  }>;
};

export type OccurrenceDetail = {
  id: string;
  number: number;
  trackingCode: string;
  status: QueueStatus;
  condominium: { id: string; name: string };
  description: string;
  location: string | null;
  reporterName: string | null;
  reporterPhone: string | null;
  reporterUnitOrRole: string | null;
  registeredAt: string;
  completedAt: string | null;
  suggestedPriority: QueuePriority | null;
  finalPriority: QueuePriority | null;
  effectivePriority: QueuePriority | null;
  suggestionReason: string | null;
  suggestionSource: "rules" | "ai" | null;
  priorityDecidedAt: string | null;
  suggestionPending: boolean;
  priorityChangeReason: PriorityChangeReason | null;
  category: string | null;
  canDecidePriority: boolean;
  version?: number;
  responsibleKind?: "manager" | "provider" | "employee" | null;
  responsibleName?: string | null;
  responsibleEmployeeId?: string | null;
  firstResponsibleAt?: string | null;
  dueDate?: string | null;
  delegation?: { code: string; url: string; message: string };
  events: OccurrenceEvent[];
};

function priority(value: unknown): QueuePriority | null {
  if (value === null) return null;
  if (!QUEUE_PRIORITIES.includes(value as QueuePriority))
    throw new Error("Invalid occurrence priority.");
  return value as QueuePriority;
}

function status(value: unknown): QueueStatus {
  if (!QUEUE_STATUSES.includes(value as QueueStatus))
    throw new Error("Invalid occurrence status.");
  return value as QueueStatus;
}

function changeReason(value: unknown): PriorityChangeReason | null {
  if (value === null) return null;
  if (!PRIORITY_CHANGE_REASONS.includes(value as PriorityChangeReason))
    throw new Error("Invalid priority change reason.");
  return value as PriorityChangeReason;
}

function suggestionSource(value: unknown): "rules" | "ai" | null {
  if (value === null || value === "rules" || value === "ai") return value;
  throw new Error("Invalid suggestion source.");
}

function event(value: unknown): OccurrenceEvent {
  const row = record(value);
  if (
    !OCCURRENCE_EVENT_TYPES.includes(row.type as OccurrenceEventType) ||
    !OCCURRENCE_AUTHOR_TYPES.includes(row.authorType as OccurrenceAuthorType)
  )
    throw new Error("Invalid occurrence event.");
  return {
    id: integer(row.id),
    type: row.type as OccurrenceEventType,
    occurredAt: date(row.occurredAt),
    authorType: row.authorType as OccurrenceAuthorType,
    authorName: string(row.authorName),
    authorPhone: nullableString(row.authorPhone),
    authorRole: nullableString(row.authorRole),
    authorIsViewer: boolean(row.authorIsViewer),
    text: string(row.text),
    attachments:
      row.attachments === undefined
        ? []
        : (() => {
            if (!Array.isArray(row.attachments))
              throw new Error("Invalid attachments.");
            return row.attachments.map((value) => {
              const file = record(value);
              return {
                id: string(file.id),
                name: string(file.name),
                contentType: string(file.contentType),
                size: integer(file.size),
              };
            });
          })(),
  };
}

export function parseOccurrenceDetail(value: unknown): OccurrenceDetail {
  const row = record(value);
  const condominium = record(row.condominium);
  if (!Array.isArray(row.events))
    throw new Error("Invalid occurrence history.");
  const trackingCode = string(row.trackingCode);
  if (!TRACKING_CODE_PATTERN.test(trackingCode))
    throw new Error("Invalid tracking code.");
  const result: OccurrenceDetail = {
    id: string(row.id),
    number: integer(row.number),
    trackingCode,
    status: status(row.status),
    condominium: { id: string(condominium.id), name: string(condominium.name) },
    description: string(row.description),
    location: nullableString(row.location),
    reporterName: nullableString(row.reporterName),
    reporterPhone: nullableString(row.reporterPhone),
    reporterUnitOrRole: nullableString(row.reporterUnitOrRole),
    registeredAt: date(row.registeredAt),
    completedAt: row.completedAt === null ? null : date(row.completedAt),
    suggestedPriority: priority(row.suggestedPriority),
    finalPriority: priority(row.finalPriority),
    effectivePriority: priority(row.effectivePriority),
    suggestionReason: nullableString(row.suggestionReason),
    suggestionSource: suggestionSource(row.suggestionSource),
    priorityDecidedAt:
      row.priorityDecidedAt === null ? null : date(row.priorityDecidedAt),
    suggestionPending: boolean(row.suggestionPending),
    priorityChangeReason: changeReason(row.priorityChangeReason),
    category: nullableString(row.category),
    canDecidePriority: boolean(row.canDecidePriority),
    version: row.version === undefined ? 0 : integer(row.version),
    responsibleKind:
      row.responsibleKind === undefined || row.responsibleKind === null
        ? null
        : (() => {
            if (
              !["manager", "provider", "employee"].includes(
                string(row.responsibleKind),
              )
            )
              throw new Error("Invalid responsible kind.");
            return row.responsibleKind as "manager" | "provider" | "employee";
          })(),
    responsibleName: nullableString(row.responsibleName ?? null),
    responsibleEmployeeId: nullableString(row.responsibleEmployeeId ?? null),
    firstResponsibleAt:
      row.firstResponsibleAt == null ? null : date(row.firstResponsibleAt),
    dueDate: row.dueDate == null ? null : string(row.dueDate),
    delegation:
      row.delegation == null
        ? undefined
        : (() => {
            const delegation = record(row.delegation);
            const code = string(delegation.code);
            const message = string(delegation.message);
            const url = new URL(string(delegation.url));
            if (
              !TRACKING_CODE_PATTERN.test(code) ||
              !["http:", "https:"].includes(url.protocol) ||
              url.username ||
              url.password ||
              url.search ||
              url.hash ||
              url.pathname !== `/t/${code}` ||
              !message.endsWith(
                `\nAbra o link para mandar recado ou concluir com foto: ${url.href}`,
              )
            )
              throw new Error("Invalid delegation receipt.");
            return { code, url: url.href, message };
          })(),
    events: row.events.map(event),
  };
  if (
    result.number < 1 ||
    result.effectivePriority !==
      (result.finalPriority ?? result.suggestedPriority) ||
    result.suggestionPending !== (result.priorityDecidedAt === null) ||
    result.canDecidePriority !== (result.status !== "completed") ||
    (result.suggestionPending && result.finalPriority !== null) ||
    (result.priorityChangeReason !== null &&
      (result.finalPriority === null ||
        result.finalPriority === result.suggestedPriority))
  )
    throw new Error("Inconsistent occurrence detail.");
  return result;
}
