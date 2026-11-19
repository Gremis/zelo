import { createClient } from "@/lib/supabase/server";
import { createAuthRepository } from "./auth.repository";
import { type AuthService, createAuthService } from "./auth.service";

export async function getAuthService(): Promise<AuthService> {
  const supabase = await createClient();
  return createAuthService(createAuthRepository(supabase));
}
