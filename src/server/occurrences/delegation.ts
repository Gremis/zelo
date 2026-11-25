import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { publicTaskOrigin } from "./task-origin";

export async function delegateOccurrence(
  client: SupabaseClient<Database>,
  id: string,
  body: { key: string; version: number; payload: Json },
) {
  const { data, error } = await client.auth.getClaims();
  const actor = data?.claims.sub;
  const session = data?.claims.session_id;
  if (error || typeof actor !== "string" || typeof session !== "string")
    throw new Error("Verified session required.");
  const { url } = getSupabaseConfig();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Server configuration unavailable.");
  const server = createClient<Database>(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          cache: "no-store",
          signal: AbortSignal.timeout(60_000),
        }),
    },
  });
  return server.rpc("delegate_occurrence", {
    target_occurrence: id,
    command_key: body.key,
    expected_version: body.version,
    payload: body.payload,
    public_origin: publicTaskOrigin() ?? undefined,
    actor_profile: actor,
    actor_session: session,
  });
}
