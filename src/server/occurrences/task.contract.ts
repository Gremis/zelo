import {
  date,
  integer,
  nullableString,
  record,
  string,
} from "./contract-utils";

export type EmployeeTask = {
  canAct?: boolean;
  condominiumName: string;
  number: number;
  description: string;
  location: string | null;
  reporterName: string | null;
  reporterUnitOrRole: string | null;
  registeredAt: string;
  startedAt: string | null;
  completedAt: string | null;
  status: "pending" | "started" | "completed";
};

export function parseEmployeeTask(value: unknown): EmployeeTask {
  const row = record(value);
  const startedAt = row.startedAt === null ? null : date(row.startedAt);
  const completedAt = row.completedAt === null ? null : date(row.completedAt);
  const status = completedAt ? "completed" : startedAt ? "started" : "pending";
  if (row.canAct !== undefined && typeof row.canAct !== "boolean")
    throw new Error("Invalid task authorization.");
  const result: EmployeeTask = {
    ...(row.canAct === undefined ? {} : { canAct: row.canAct as boolean }),
    condominiumName: string(row.condominiumName),
    number: integer(row.number),
    description: string(row.description),
    location: nullableString(row.location),
    reporterName: nullableString(row.reporterName),
    reporterUnitOrRole: nullableString(row.reporterUnitOrRole),
    registeredAt: date(row.registeredAt),
    startedAt,
    completedAt,
    status,
  };
  if (
    row.status !== status ||
    result.number < 1 ||
    !result.condominiumName.trim() ||
    !result.description.trim()
  )
    throw new Error("Inconsistent employee task.");
  return result;
}
