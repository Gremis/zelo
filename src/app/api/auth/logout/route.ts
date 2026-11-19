import { getAuthService } from "@/server/auth/auth.factory";
import { toResponse } from "@/server/auth/auth.http";

export async function POST() {
  const service = await getAuthService();
  return toResponse(await service.logout());
}
