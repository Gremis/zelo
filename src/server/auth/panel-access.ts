import "server-only";

import { cache } from "react";
import { confirmedIdentity } from "./identity";

export const panelAccess = cache(async () => {
  const identity = await confirmedIdentity();
  if (!identity) return null;
  const { data: profile, error } = await identity.supabase
    .from("profiles")
    .select("is_sindico")
    .eq("id", identity.user.id)
    .single();
  return {
    identity,
    permitted: !error && profile?.is_sindico === true,
    sessionKey: `${identity.user.id}:${identity.user.last_sign_in_at ?? ""}`,
  };
});
