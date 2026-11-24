import type { CookieOptions } from "@supabase/ssr";

export const PERSISTENCE_COOKIE = "zelo-session-persistence";

export function sessionCookieOptions(
  name: string,
  options: CookieOptions,
  persistent: boolean,
): CookieOptions {
  if (
    persistent ||
    options.maxAge === 0 ||
    !/^sb-.*-auth-token(?:\.\d+)?$/.test(name)
  )
    return options;
  const sessionOptions = { ...options };
  delete sessionOptions.maxAge;
  delete sessionOptions.expires;
  return sessionOptions;
}
