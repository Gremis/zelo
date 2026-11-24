import { getFuncionariosService } from "@/server/funcionarios/funcionarios.factory";
import {
  handleJson,
  toResponse,
} from "@/server/funcionarios/funcionarios.http";

const CREATED = 201;

export async function POST(request: Request) {
  const resolved = await getFuncionariosService();
  if (!resolved.ok) {
    return toResponse({ ok: false, error: resolved.error });
  }
  return handleJson(
    request,
    (body) => resolved.service.createFuncionario(body),
    CREATED,
  );
}

export async function GET() {
  const resolved = await getFuncionariosService();
  if (!resolved.ok) {
    return toResponse({ ok: false, error: resolved.error });
  }
  return toResponse(await resolved.service.listFuncionarios());
}
