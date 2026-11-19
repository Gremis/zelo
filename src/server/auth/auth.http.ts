import { NextResponse } from "next/server";
import { type AuthErrorCode, type Result, failure } from "./auth.result";

const OK = 200;

const STATUS_BY_CODE: Record<AuthErrorCode, number> = {
  invalid_body: 400,
  invalid_input: 400,
  invalid_credentials: 401,
  rate_limited: 429,
  email_already_registered: 409,
  invalid_recovery_code: 401,
  update_failed: 400,
  unknown: 500,
};

export function toResponse<T>(
  result: Result<T>,
  successStatus = OK,
): NextResponse {
  if (result.ok) {
    return NextResponse.json(result.data, { status: successStatus });
  }

  return NextResponse.json(
    { error: result.error.message, details: result.error.details },
    { status: STATUS_BY_CODE[result.error.code] },
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

  return toResponse(await handler(parsed.data), successStatus);
}
