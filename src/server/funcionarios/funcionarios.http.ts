import { NextResponse } from "next/server";
import {
  type FuncionarioErrorCode,
  type Result,
  failure,
} from "./funcionarios.result";

const OK = 200;
const headers = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
  Expires: "0",
};

const STATUS_BY_CODE: Record<FuncionarioErrorCode, number> = {
  invalid_body: 400,
  invalid_input: 400,
  not_authenticated: 401,
  forbidden: 403,
  celular_already_registered: 409,
  funcionario_not_found: 404,
  unknown: 500,
};

export function toResponse<T>(
  result: Result<T>,
  successStatus = OK,
): NextResponse {
  if (result.ok) {
    return NextResponse.json(result.data, { status: successStatus, headers });
  }

  return NextResponse.json(
    { error: result.error.message, details: result.error.details },
    { status: STATUS_BY_CODE[result.error.code], headers },
  );
}

async function parseJson(request: Request): Promise<Result<unknown>> {
  try {
    return { ok: true, data: await request.json() };
  } catch {
    return failure({
      code: "invalid_body",
      message: "Envie um corpo JSON válido.",
    });
  }
}

export async function handleJson<T>(
  request: Request,
  handler: (body: unknown) => Promise<Result<T>>,
  successStatus = OK,
): Promise<NextResponse> {
  const parsed = await parseJson(request);

  if (!parsed.ok) {
    return toResponse(parsed, successStatus);
  }

  try {
    return toResponse(await handler(parsed.data), successStatus);
  } catch {
    return toResponse(
      failure({
        code: "unknown",
        message: "Erro inesperado. Tente novamente.",
      }),
      successStatus,
    );
  }
}
