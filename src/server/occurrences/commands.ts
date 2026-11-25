import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";
import { parseOccurrenceDetail } from "./detail.contract";
import { delegateOccurrence } from "./delegation";

export class CommandError extends Error {
  constructor(public readonly status: 400 | 401 | 404 | 409 | 503) {
    super("Occurrence command failed.");
  }
}
const uuid = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
export function commandBody(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new CommandError(400);
  const body = value as Record<string, unknown>;
  if (
    Object.keys(body).sort().join() !== "key,payload,type,version" ||
    !uuid.test(String(body.key)) ||
    !Number.isSafeInteger(body.version) ||
    Number(body.version) < 0 ||
    !["responsible", "delegate", "deadline", "complete", "reopen"].includes(
      String(body.type),
    ) ||
    !body.payload ||
    typeof body.payload !== "object" ||
    Array.isArray(body.payload)
  )
    throw new CommandError(400);
  const payload = body.payload as Record<string, unknown>;
  const allowed: Record<string, string[]> = {
    responsible: ["kind", "name"],
    delegate: ["employeeId", "message"],
    deadline: ["date"],
    complete: ["comment", "uploadKey", "uploadSecret"],
    reopen: ["reason"],
  };
  if (
    Object.keys(payload).some(
      (key) => !allowed[String(body.type)].includes(key),
    )
  )
    throw new CommandError(400);
  if (
    Object.values(payload).some(
      (value) =>
        value !== null && (typeof value !== "string" || value.includes("\0")),
    )
  )
    throw new CommandError(400);
  if (
    body.type === "complete" &&
    Boolean(payload.uploadKey) !== Boolean(payload.uploadSecret)
  )
    throw new CommandError(400);
  return {
    key: body.key as string,
    version: body.version as number,
    type: body.type as string,
    payload: payload as Json,
  };
}
export async function runOccurrenceCommand(
  client: SupabaseClient<Database>,
  id: string,
  input: unknown,
) {
  if (!uuid.test(id)) throw new CommandError(404);
  const body = commandBody(input);
  const { data, error } =
    body.type === "delegate"
      ? await delegateOccurrence(client, id, body)
      : body.type === "reopen"
        ? await client.rpc("reopen_occurrence", {
            target_occurrence: id,
            command_key: body.key,
            expected_version: body.version,
            reason:
              (body.payload as { reason?: string | null }).reason ?? undefined,
          })
        : await client.rpc("occurrence_command", {
            target_occurrence: id,
            command_key: body.key,
            expected_version: body.version,
            command_type: body.type,
            payload: body.payload,
          });
  if (error)
    throw new CommandError(
      error.code === "42501"
        ? 404
        : error.code === "P0003"
          ? 409
          : ["22023", "22007", "22008", "22P02"].includes(error.code)
            ? 400
            : 503,
    );
  return parseOccurrenceDetail(data);
}
