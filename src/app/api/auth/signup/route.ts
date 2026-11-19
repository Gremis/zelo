import { getAuthService } from "@/server/auth/auth.factory";
import { handleJson } from "@/server/auth/auth.http";

const CREATED = 201;

export async function POST(request: Request) {
  const service = await getAuthService();
  return handleJson(request, (body) => service.signUp(body), CREATED);
}
