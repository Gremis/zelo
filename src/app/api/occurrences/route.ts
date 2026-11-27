import { NextResponse } from "next/server";
import { confirmedIdentity } from "@/server/auth/identity";
import {
  type ManagerRegistration,
  OccurrenceWriteError,
} from "@/server/occurrences/contracts";
import { createOccurrenceEventRepository } from "@/server/occurrences/event.repository";
import { createOccurrenceEventService } from "@/server/occurrences/event.service";

// ORI-89: registro de ocorrência pelo síndico (painel).
// Entra na mesma fila das do formulário, com o síndico como autor do histórico.
// A validação profunda (canal, campos, celular) fica no service; aqui só
// garantimos sessão confirmada e a lista de campos permitidos.
const ALLOWED = [
  "condominiumId",
  "channel",
  "location",
  "description",
  "reporterName",
  "reporterPhone",
  "reporterUnitOrRole",
];

export async function POST(request: Request) {
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
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return reply({ error: "Registro inválido." }, 400);
    }
    if (!body || typeof body !== "object" || Array.isArray(body))
      return reply({ error: "Registro inválido." }, 400);
    if (Object.keys(body).some((key) => !ALLOWED.includes(key)))
      return reply({ error: "Registro inválido." }, 400);
    const input = {
      type: "registered",
      ...(body as Record<string, unknown>),
    } as ManagerRegistration;
    const service = createOccurrenceEventService(
      createOccurrenceEventRepository(headers),
    );
    const result = await service.registerByManager(input);
    return reply(
      { number: result.number, trackingCode: result.trackingCode },
      201,
    );
  } catch (error) {
    const code =
      error instanceof OccurrenceWriteError ? error.code : "unavailable";
    const status =
      code === "invalid_input"
        ? 400
        : code === "access_denied" || code === "not_found"
          ? 404
          : 503;
    return reply(
      {
        error:
          status === 404
            ? "Condomínio não encontrado."
            : status === 400
              ? "Confira os dados informados."
              : "Não foi possível registrar a ocorrência.",
      },
      status,
    );
  }
}
