import { NextResponse } from "next/server";
import { getAuthService } from "@/server/auth/auth.factory";
import { toResponse } from "@/server/auth/auth.http";

export async function GET() {
  const headers = new Headers({
    "Cache-Control": "private, no-store",
    Pragma: "no-cache",
    Expires: "0",
  });
  try {
    const service = await getAuthService(headers);
    const response = toResponse(await service.confirmedIdentity());
    headers.forEach((value, key) => response.headers.set(key, value));
    return response;
  } catch {
    return NextResponse.json(
      { error: "Não foi possível validar a sessão." },
      { status: 503, headers },
    );
  }
}
