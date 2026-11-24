import "server-only";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import {
  OccurrenceWriteError,
  type OccurrenceEventRepository,
} from "./contracts";

function databaseFailure(code: unknown): never {
  throw new OccurrenceWriteError(
    code === "22023"
      ? "invalid_input"
      : code === "42501"
        ? "access_denied"
        : "unavailable",
  );
}

export function createOccurrenceEventRepository(
  responseHeaders?: Headers,
): OccurrenceEventRepository {
  return {
    async registerPublic(input) {
      try {
        const { url } = getSupabaseConfig();
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!key) throw new OccurrenceWriteError("unavailable");
        const body: Database["public"]["Functions"]["register_public_occurrence"]["Args"] =
          {
            condominium_slug: input.condominiumSlug,
            reporter_name: input.reporterName,
            reporter_phone: input.reporterPhone,
            reporter_unit_or_role: input.reporterUnitOrRole,
            description: input.description,
          };
        const response = await fetch(
          new URL("/rest/v1/rpc/register_public_occurrence", url),
          {
            method: "POST",
            headers: {
              apikey: key,
              Authorization: `Bearer ${key}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
            cache: "no-store",
            signal: AbortSignal.timeout(15_000),
          },
        );
        const result: unknown = await response.json();
        if (!response.ok) {
          databaseFailure(
            result && typeof result === "object" && "code" in result
              ? result.code
              : undefined,
          );
        }
        const row =
          Array.isArray(result) && result.length === 1 ? result[0] : null;
        if (
          !row ||
          typeof row.occurrence_id !== "string" ||
          !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(
            row.occurrence_id,
          ) ||
          !Number.isSafeInteger(row.number) ||
          row.number <= 0 ||
          typeof row.tracking_code !== "string" ||
          !/^[0-9a-f]{64}$/.test(row.tracking_code)
        )
          throw new OccurrenceWriteError("unavailable");
        return {
          occurrenceId: row.occurrence_id,
          number: row.number,
          trackingCode: row.tracking_code,
        };
      } catch (error) {
        if (error instanceof OccurrenceWriteError) throw error;
        throw new OccurrenceWriteError("unavailable");
      }
    },
    async appendInternalNote(input) {
      try {
        const supabase = await createClient(responseHeaders);
        const args: Database["public"]["Functions"]["append_occurrence_note"]["Args"] =
          {
            target_occurrence: input.occurrenceId,
            note: input.note,
          };
        const { data, error } = await supabase.rpc(
          "append_occurrence_note",
          args,
        );
        if (error) databaseFailure(error.code);
        if (!Number.isSafeInteger(data) || data <= 0)
          throw new OccurrenceWriteError("unavailable");
        return { eventId: data as number };
      } catch (error) {
        if (error instanceof OccurrenceWriteError) throw error;
        throw new OccurrenceWriteError("unavailable");
      }
    },
  };
}
