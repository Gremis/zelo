import { confirmedIdentity } from "@/server/auth/identity";
import {
  loadOccurrenceDetail,
  OccurrenceReadError,
} from "@/server/occurrences/detail.service";
import {
  prepareUploads,
  manageUploads,
  processUploadFile,
} from "@/server/occurrences/uploads";
export const maxDuration = 60;
async function handle(
  request: Request,
  context: { params: Promise<{ id: string; parts?: string[] }> },
) {
  const headers = new Headers({ "Cache-Control": "private, no-store" });
  try {
    const identity = await confirmedIdentity(headers);
    if (!identity)
      return Response.json(
        { error: "Entre na sua conta." },
        { status: 401, headers },
      );
    if (
      new URL(request.url).search ||
      (request.headers.get("origin") &&
        request.headers.get("origin") !==
          `${new URL(request.url).protocol}//${request.headers.get("host") ?? new URL(request.url).host}`)
    )
      return Response.json(
        { error: "Requisição inválida." },
        { status: 400, headers },
      );
    const { id, parts = [] } = await context.params;
    await loadOccurrenceDetail(identity.supabase, id);
    const scope = { occurrenceId: id, actorId: identity.user.id };
    let response: Response;
    if (parts.length === 0 && request.method === "POST")
      response = await prepareUploads(request, "", scope);
    else if (parts.length === 1 && ["GET", "DELETE"].includes(request.method))
      response = await manageUploads(request, "", parts[0], scope);
    else if (parts.length === 3 && request.method === "POST")
      response = await processUploadFile(
        request,
        "",
        parts[0],
        parts[1],
        parts[2],
        scope,
      );
    else
      return Response.json(
        { error: "Operação inválida." },
        { status: 404, headers },
      );
    headers.forEach((value, key) => response.headers.set(key, value));
    return response;
  } catch (error) {
    return Response.json(
      { error: "Não foi possível acessar o envio." },
      {
        status: error instanceof OccurrenceReadError ? error.status : 503,
        headers,
      },
    );
  }
}
export { handle as POST, handle as GET, handle as DELETE };
