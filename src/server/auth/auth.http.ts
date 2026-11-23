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
  invalid_confirmation_code: 400,
  confirmation_expired: 400,
  confirmation_blocked: 429,
  unauthorized: 401,
};

export function toResponse<T>(
  result: Result<T>,
  successStatus = OK,
): NextResponse {
  if (result.ok) {
    return NextResponse.json(result.data, { status: successStatus });
  }

  return NextResponse.json(
    {
      error: result.error.message,
      details: result.error.details,
      code: result.error.code,
    },
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

export async function authRequest(
  request: Request,
  handler: (
    service: import("./auth.service").AuthService,
    body: unknown,
  ) => Promise<Result<unknown>>,
  successStatus = OK,
  readBody = true,
) {
  const headers = new Headers({
    "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0",
    Expires: "0",
    Pragma: "no-cache",
  });
  const origin = request.headers.get("origin");
  const url = new URL(request.url);
  const expectedOrigin = `${url.protocol}//${request.headers.get("host") ?? url.host}`;
  if (origin && origin !== expectedOrigin)
    return NextResponse.json(
      { error: "Origem não autorizada." },
      { status: 403, headers },
    );
  const execute = async (body: unknown) => {
    const { getAuthService } = await import("./auth.factory");
    const persistence =
      url.pathname === "/api/auth/login" &&
      typeof body === "object" &&
      body !== null
        ? (body as { keepSignedIn?: unknown }).keepSignedIn !== false
        : undefined;
    return handler(await getAuthService(headers, persistence), body);
  };
  let response: NextResponse;
  try {
    response = readBody
      ? await handleJson(request, execute, successStatus)
      : toResponse(await execute(undefined), successStatus);
  } catch {
    response = toResponse(
      failure({
        code: "unknown",
        message: "Serviço temporariamente indisponível. Tente novamente.",
      }),
    );
  }
  headers.forEach((value, key) => response.headers.set(key, value));
  return response;
}
