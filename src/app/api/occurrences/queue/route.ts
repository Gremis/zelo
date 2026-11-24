import { NextResponse } from "next/server";
import { confirmedIdentity } from "@/server/auth/identity";
import {
  loadPortfolioQueue,
  QueueReadError,
} from "@/server/occurrences/queue.service";

export async function GET(request: Request) {
  const headers = new Headers({
    "Cache-Control": "private, no-store, max-age=0",
    Pragma: "no-cache",
    Expires: "0",
  });
  const reply = (body: unknown, status = 200) =>
    NextResponse.json(body, { status, headers });
  try {
    const identity = await confirmedIdentity(headers);
    if (!identity)
      return reply({ error: "Entre com uma conta confirmada." }, 401);
    if (new URL(request.url).search)
      return reply({ error: "Esta consulta não aceita parâmetros." }, 400);
    return reply(await loadPortfolioQueue(identity.supabase));
  } catch (error) {
    const status = error instanceof QueueReadError ? error.status : 503;
    return reply(
      {
        error:
          status === 401
            ? "Entre com uma conta confirmada."
            : status === 403
              ? "Acesso não autorizado."
              : "Fila temporariamente indisponível.",
      },
      status,
    );
  }
}
