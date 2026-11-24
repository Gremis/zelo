import "server-only";
import data from "@/lib/demo/data.json";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { createOccurrenceEventService } from "@/server/occurrences/event.service";

export function accountDemoEnabled() {
  return process.env.ACCOUNT_DEMO_ENABLED === "true";
}

async function demoRpc(
  name: "prepare_account_demo" | "register_account_demo",
  body: unknown,
): Promise<unknown> {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Demo preparation unavailable.");
  const response = await fetch(
    new URL(`/rest/v1/rpc/${name}`, getSupabaseConfig().url),
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
  if (!response.ok) throw new Error("Demo preparation unavailable.");
  return response.json();
}

export async function prepareAccountDemo(managerId: string) {
  if (!accountDemoEnabled()) return { status: "disabled" as const };
  const result = (await demoRpc("prepare_account_demo", {
    target_manager: managerId,
    fixtures: data.DEMO_CONDOMINIUMS,
  })) as { eligible?: boolean; condominiums?: { key: string; slug: string }[] };
  if (result?.eligible !== true || !Array.isArray(result.condominiums))
    throw new Error("Demo preparation unavailable.");
  for (const fixture of data.DEMO_OCCURRENCES) {
    const condominium = result.condominiums.find(
      (item) => item.key === fixture.condominium,
    );
    if (!condominium) throw new Error("Demo preparation unavailable.");
    const service = createOccurrenceEventService({
      async registerPublic(input) {
        const rows = (await demoRpc("register_account_demo", {
          target_manager: managerId,
          fixture_key: fixture.key,
          registration: input,
        })) as {
          occurrence_id: string;
          number: number;
          tracking_code: string;
        }[];
        if (
          !Array.isArray(rows) ||
          rows.length !== 1 ||
          typeof rows[0].occurrence_id !== "string" ||
          !Number.isSafeInteger(rows[0].number) ||
          typeof rows[0].tracking_code !== "string"
        )
          throw new Error("Demo preparation unavailable.");
        return {
          occurrenceId: rows[0].occurrence_id,
          number: rows[0].number,
          trackingCode: rows[0].tracking_code,
        };
      },
      async appendInternalNote() {
        throw new Error("Unsupported demo operation.");
      },
    });
    await service.registerPublic({
      type: "registered",
      condominiumSlug: condominium.slug,
      reporterName: fixture.reporterName,
      reporterPhone: fixture.reporterPhone,
      reporterUnitOrRole: fixture.reporterUnitOrRole,
      location: fixture.location,
      description: fixture.description,
    });
  }
  return { status: "ready" as const };
}
