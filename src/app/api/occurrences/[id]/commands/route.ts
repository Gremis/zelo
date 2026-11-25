import { confirmedIdentity } from "@/server/auth/identity";
import {
  CommandError,
  runOccurrenceCommand,
} from "@/server/occurrences/commands";
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const headers = new Headers({ "Cache-Control": "private, no-store" });
  try {
    const identity = await confirmedIdentity(headers);
    if (!identity)
      return Response.json(
        { error: "Entre com uma conta confirmada." },
        { status: 401, headers },
      );
    if (
      new URL(request.url).search ||
      (request.headers.get("origin") &&
        request.headers.get("origin") !==
          `${new URL(request.url).protocol}//${request.headers.get("host") ?? new URL(request.url).host}`)
    )
      throw new CommandError(400);
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new CommandError(400);
    }
    const { id } = await context.params;
    return Response.json(
      await runOccurrenceCommand(identity.supabase, id, body),
      { headers },
    );
  } catch (error) {
    const status = error instanceof CommandError ? error.status : 503;
    return Response.json(
      {
        error:
          status === 409
            ? "A ocorrência mudou. Atualize os dados antes de tentar novamente."
            : status === 400
              ? "Confira os dados informados."
              : status === 404
                ? "Ocorrência não encontrada."
                : "Não foi possível salvar. Tente novamente com a mesma operação.",
      },
      { status, headers },
    );
  }
}
