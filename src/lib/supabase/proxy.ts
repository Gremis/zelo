import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { PERSISTENCE_COOKIE, sessionCookieOptions } from "./persistence";
import { getSupabaseConfig } from "./config";

function readConfig() {
  try {
    return getSupabaseConfig();
  } catch {
    return null;
  }
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });
  const authHeaders = new Headers();
  if (
    request.nextUrl.pathname === "/fila" ||
    request.nextUrl.pathname === "/condominios" ||
    request.nextUrl.pathname === "/funcionarios" ||
    request.nextUrl.pathname.startsWith("/api/")
  ) {
    authHeaders.set("Cache-Control", "private, no-store, max-age=0");
    authHeaders.set("Pragma", "no-cache");
    authHeaders.set("Expires", "0");
    authHeaders.forEach((value, key) =>
      supabaseResponse.headers.set(key, value),
    );
  }
  if (
    request.nextUrl.pathname.startsWith("/api/public/") ||
    request.nextUrl.pathname === "/api/internal/attachments/cleanup"
  )
    return supabaseResponse;

  const persistent =
    request.cookies.get(PERSISTENCE_COOKIE)?.value !== "session";

  const config = readConfig();
  if (!config) {
    return supabaseResponse;
  }

  const supabase = createServerClient(config.url, config.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, cacheHeaders) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        Object.entries(cacheHeaders).forEach(([key, value]) =>
          authHeaders.set(key, value),
        );
        const previousCookies = supabaseResponse.cookies.getAll();
        supabaseResponse = NextResponse.next({ request });
        authHeaders.forEach((value, key) =>
          supabaseResponse.headers.set(key, value),
        );
        previousCookies.forEach((cookie) =>
          supabaseResponse.cookies.set(cookie),
        );
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(
            name,
            value,
            sessionCookieOptions(name, options, persistent),
          ),
        );
      },
    },
  });

  await supabase.auth.getUser();

  return supabaseResponse;
}
