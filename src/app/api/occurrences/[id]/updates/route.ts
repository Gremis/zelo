import { NextResponse } from "next/server";
import { confirmedIdentity } from "@/server/auth/identity";
import { OccurrenceWriteError } from "@/server/occurrences/contracts";
import { createOccurrenceEventRepository } from "@/server/occurrences/event.repository";
import { createOccurrenceEventService } from "@/server/occurrences/event.service";

function updateText(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const keys = Object.keys(body);
  if (keys.length !== 1 || keys[0] !== "text") return null;
  const text = (body as Record<string, unknown>).text;
  return typeof text === "string" ? text : null;
}

export async function POST(
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
      return reply({ error: "Atualização inválida." }, 400);
    }
    const note = updateText(body);
    if (note === null) return reply({ error: "Atualização inválida." }, 400);
    const service = createOccurrenceEventService(
      createOccurrenceEventRepository(headers),
    );
    const result = await service.appendInternalNote({
      type: "manager_update",
      occurrenceId: id,
      note,
    });
    return reply({ eventId: result.eventId }, 201);
  } catch (error) {
    const code =
      error instanceof OccurrenceWriteError ? error.code : "unavailable";
    const status =
      code === "conflict"
        ? 409
        : code === "invalid_input"
          ? 400
          : code === "access_denied"
            ? 404
            : 503;
    return reply(
      {
        error:
          status === 404
            ? "Ocorrência não encontrada."
            : status === 400
              ? "Escreva a atualização."
              : "Não foi possível adicionar a atualização.",
      },
      status,
    );
  }
}
