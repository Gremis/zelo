import { createClient as createIsolatedClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { confirmationGuard } from "./confirmation-guard";
import { createClient } from "@/lib/supabase/server";
import { createAuthRepository } from "./auth.repository";
import { type AuthService, createAuthService } from "./auth.service";

export async function getAuthService(
  responseHeaders?: Headers,
  persistence?: boolean,
): Promise<AuthService> {
  const supabase = await createClient(responseHeaders, persistence);
  const { url, anonKey } = getSupabaseConfig();
  const recovery = createIsolatedClient(url, anonKey, {
    global: {
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          cache: "no-store",
          signal: AbortSignal.timeout(15_000),
        }),
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  return createAuthService(
    createAuthRepository(supabase),
    confirmationGuard,
    createAuthRepository(recovery),
  );
}
