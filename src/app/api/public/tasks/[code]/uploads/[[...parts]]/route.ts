import { TASK_CODE_PATTERN } from "@/lib/occurrences/task-link";
import {
  manageUploads,
  prepareUploads,
  processUploadFile,
} from "@/server/occurrences/uploads";
import { taskHeaders } from "@/server/occurrences/task-actions";

type Context = { params: Promise<{ code: string; parts?: string[] }> };
async function handle(request: Request, context: Context) {
  const { code, parts = [] } = await context.params;
  if (!TASK_CODE_PATTERN.test(code))
    return Response.json(
      {
        error: "Não encontramos esta tarefa. Confira o link que você recebeu.",
      },
      { status: 404, headers: taskHeaders },
    );
  const scope = { taskCode: code };
  let response: Response;
  if (!parts.length && request.method === "POST")
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
    response = Response.json({ error: "Operação inválida." }, { status: 400 });
  for (const [key, value] of Object.entries(taskHeaders))
    response.headers.set(key, value);
  return response;
}
export const GET = handle;
export const POST = handle;
export const DELETE = handle;
