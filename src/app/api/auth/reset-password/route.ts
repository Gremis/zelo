import { getAuthService } from "@/server/auth/auth.factory";
import { handleJson } from "@/server/auth/auth.http";

export async function POST(request: Request) {
  const service = await getAuthService();
  return handleJson(request, (body) => service.resetPassword(body));
}
