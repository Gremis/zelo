import { NextResponse } from "next/server";
import { confirmedIdentity } from "@/server/auth/identity";

export async function POST(request: Request) {
  const headers = new Headers({
    "Cache-Control": "private, no-store, max-age=0",
    Pragma: "no-cache",
    Expires: "0",
  });
  const reply = (body: unknown, status = 200) =>
    NextResponse.json(body, { status, headers });
  const url = new URL(request.url);
  const origin = request.headers.get("origin");
  const expectedOrigin = `${url.protocol}//${request.headers.get("host") ?? url.host}`;
  if (origin && origin !== expectedOrigin)
    return reply({ error: "Origem não autorizada." }, 403);
  try {
    const identity = await confirmedIdentity(headers);
    if (!identity)
      return reply({ error: "Entre com uma conta confirmada." }, 401);
    if (url.search || (await request.text()).length !== 0)
      return reply({ error: "Esta operação não aceita parâmetros." }, 400);
    const { data, error } = await identity.supabase.rpc("dismiss_first_steps");
    if (error)
      return reply(
        {
          error:
            error.code === "42501"
              ? "Acesso não autorizado."
              : "Não foi possível dispensar o quadro. Tente novamente.",
        },
        error.code === "42501" ? 403 : 503,
      );
    if (typeof data !== "string" || !Number.isFinite(Date.parse(data)))
      throw new Error("Invalid dismissal confirmation.");
    return reply({ dismissed: true });
  } catch {
    return reply(
      { error: "Não foi possível dispensar o quadro. Tente novamente." },
      503,
    );
  }
}
