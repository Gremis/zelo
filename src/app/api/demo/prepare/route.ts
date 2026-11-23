import { NextResponse } from "next/server";
import { confirmedIdentity } from "@/server/auth/identity";
import { prepareAccountDemo } from "@/server/demo/prepare";

export async function POST(request: Request) {
  const headers = new Headers({ "Cache-Control": "private, no-store" });
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    return NextResponse.json(
      { error: "Origem não autorizada." },
      { status: 403, headers },
    );
  if (new URL(request.url).search)
    return NextResponse.json(
      { error: "Parâmetros não permitidos." },
      { status: 400, headers },
    );
  try {
    const identity = await confirmedIdentity(headers);
    if (!identity)
      return NextResponse.json(
        { error: "Entre com uma conta confirmada." },
        { status: 401, headers },
      );
    const { data: profile, error } = await identity.supabase
      .from("profiles")
      .select("is_sindico")
      .eq("id", identity.user.id)
      .single();
    if (error) throw new Error("Profile unavailable.");
    if (!profile?.is_sindico)
      return NextResponse.json(
        { error: "Acesso não autorizado." },
        { status: 403, headers },
      );
    return NextResponse.json(await prepareAccountDemo(identity.user.id), {
      headers,
    });
  } catch {
    return NextResponse.json(
      { error: "Não foi possível preparar os exemplos. Tente novamente." },
      { status: 503, headers },
    );
  }
}
