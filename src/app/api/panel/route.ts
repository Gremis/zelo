import { NextResponse } from "next/server";
import { confirmedIdentity } from "@/server/auth/identity";

export async function GET() {
  const headers = new Headers({
    "Cache-Control": "private, no-store, max-age=0",
    Pragma: "no-cache",
    Expires: "0",
  });
  try {
    const identity = await confirmedIdentity(headers);
    if (!identity)
      return NextResponse.json(
        { error: "Entre com uma conta confirmada." },
        { status: 401, headers },
      );
    const { supabase, user } = identity;
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("full_name, is_sindico")
      .eq("id", user.id)
      .single();
    if (profileError) throw new Error("Profile unavailable.");
    if (!profile.is_sindico)
      return NextResponse.json(
        { error: "Acesso não autorizado." },
        { status: 403, headers },
      );
    const { count, error } = await supabase
      .from("condominiums")
      .select("id", { count: "exact", head: true })
      .eq("manager_id", user.id);
    if (error) throw new Error("Panel unavailable.");
    const name = profile.full_name || "Sua conta";
    return NextResponse.json(
      {
        user: {
          name,
          initials: name
            .split(/\s+/u)
            .filter(Boolean)
            .slice(0, 2)
            .map((part: string) => Array.from(part)[0])
            .join("")
            .toUpperCase(),
          condominiumCount: count ?? 0,
        },
        firstSteps: {
          completed: count ? ["condominium"] : [],
          dismissed: false,
        },
      },
      { headers },
    );
  } catch {
    return NextResponse.json(
      { error: "Painel temporariamente indisponível." },
      { status: 503, headers },
    );
  }
}
