import { getFuncionariosService } from "@/server/funcionarios/funcionarios.factory";
import {
  handleJson,
  toResponse,
} from "@/server/funcionarios/funcionarios.http";
import { failure } from "@/server/funcionarios/funcionarios.result";

type Context = { params: Promise<{ id: string }> };

function readAtivo(body: unknown): boolean | undefined {
  if (typeof body === "object" && body !== null) {
    const value = (body as { ativo?: unknown }).ativo;
    if (typeof value === "boolean") {
      return value;
    }
  }
  return undefined;
}

export async function PATCH(request: Request, context: Context) {
  const resolved = await getFuncionariosService();
  if (!resolved.ok) {
    return toResponse({ ok: false, error: resolved.error });
  }

  const { id } = await context.params;

  return handleJson(request, (body) => {
    const ativo = readAtivo(body);
    if (ativo === true) {
      return resolved.service.reactivate(id);
    }
    if (ativo === false) {
      return resolved.service.deactivate(id);
    }
    return Promise.resolve(
      failure({
        code: "invalid_input",
        message: "Informe 'ativo' como true ou false.",
      }),
    );
  });
}
