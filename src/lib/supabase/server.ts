import "server-only";
import { PERSISTENCE_COOKIE, sessionCookieOptions } from "./persistence";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseConfig } from "./config";

export async function createClient(
  responseHeaders?: Headers,
  persistence?: boolean,
) {
  const { url, anonKey } = getSupabaseConfig();
  const cookieStore = await cookies();
  const persistent =
    persistence ?? cookieStore.get(PERSISTENCE_COOKIE)?.value !== "session";

  return createServerClient(url, anonKey, {
    global: {
      fetch(input, init) {
        const timeout = AbortSignal.timeout(15_000);
        return fetch(input, {
          ...init,
          cache: "no-store",
          signal: init?.signal
            ? AbortSignal.any([init.signal, timeout])
            : timeout,
        });
      },
    },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet, cacheHeaders) {
        Object.entries(cacheHeaders).forEach(([key, value]) =>
          responseHeaders?.set(key, value),
        );
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(
              name,
              value,
              sessionCookieOptions(name, options, persistent),
            ),
          );
          if (
            cookiesToSet.some(
              ({ name, options }) =>
                /^sb-.*-auth-token(?:\.\d+)?$/.test(name) &&
                options.maxAge === 0,
            ) &&
            !cookiesToSet.some(
              ({ value, options }) => value && options.maxAge !== 0,
            )
          )
            cookieStore.delete(PERSISTENCE_COOKIE);
          if (persistence !== undefined)
            cookieStore.set(
              PERSISTENCE_COOKIE,
              persistent ? "persistent" : "session",
              {
                path: "/",
                httpOnly: true,
                sameSite: "lax",
                secure: url.startsWith("https:"),
                ...(persistent
                  ? {
                      maxAge: cookiesToSet.find(
                        ({ options }) => options.maxAge && options.maxAge > 0,
                      )?.options.maxAge,
                    }
                  : {}),
              },
            );
        } catch {
          return;
        }
      },
    },
  });
}
