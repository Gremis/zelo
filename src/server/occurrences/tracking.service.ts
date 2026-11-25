import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { TRACKING_CODE_PATTERN } from "@/lib/occurrences/tracking-link";
import {
  parseOccurrenceTracking,
  type OccurrenceTracking,
} from "./tracking.contract";

export class TrackingLookupError extends Error {
  constructor() {
    super("Occurrence tracking could not be loaded.");
    this.name = "TrackingLookupError";
  }
}

export async function loadOccurrenceTracking(
  code: string,
): Promise<OccurrenceTracking | null> {
  if (!TRACKING_CODE_PATTERN.test(code)) return null;
  try {
    const { url, anonKey } = getSupabaseConfig();
    const client = createClient(url, anonKey, {
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
            signal: AbortSignal.timeout(15000),
          }),
      },
    });
    const { data, error } = await client.rpc("occurrence_tracking", {
      p_code: code,
    });
    if (error) throw new TrackingLookupError();
    if (data === null) return null;
    return parseOccurrenceTracking(data);
  } catch (error) {
    if (error instanceof TrackingLookupError) throw error;
    throw new TrackingLookupError();
  }
}
