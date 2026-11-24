import { NextResponse } from "next/server";
import { confirmedIdentity } from "@/server/auth/identity";
import {
  decideOccurrencePriority,
  PriorityWriteError,
} from "@/server/occurrences/priority.service";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
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
      return reply({ error: "Esta operação não aceita parâmetros." }, 400);
    const { id } = await context.params;
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return reply({ error: "Prioridade inválida." }, 400);
    }
    return reply(await decideOccurrencePriority(identity.supabase, id, body));
  } catch (error) {
    const status = error instanceof PriorityWriteError ? error.status : 503;
    return reply(
      {
        error:
          status === 401
            ? "Entre com uma conta confirmada."
            : status === 404
              ? "Ocorrência não encontrada."
              : status === 409
                ? "Ocorrência concluída não aceita mudança de prioridade."
                : status === 400
                  ? "Prioridade inválida."
                  : "Não foi possível salvar a prioridade.",
      },
      status,
    );
  }
}
