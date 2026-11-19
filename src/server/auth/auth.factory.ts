import { confirmationGuard } from "./confirmation-guard";
import { createClient } from "@/lib/supabase/server";
import { createAuthRepository } from "./auth.repository";
import { type AuthService, createAuthService } from "./auth.service";

export async function getAuthService(
  responseHeaders?: Headers,
): Promise<AuthService> {
  const supabase = await createClient(responseHeaders);
  return createAuthService(createAuthRepository(supabase), confirmationGuard);
}
