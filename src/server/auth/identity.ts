import "server-only";

import { createClient } from "@/lib/supabase/server";

export async function confirmedIdentity(responseHeaders?: Headers) {
  const supabase = await createClient(responseHeaders);
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user?.email_confirmed_at) return null;
  return { supabase, user: data.user };
}
