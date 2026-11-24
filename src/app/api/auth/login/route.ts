import { authRequest } from "@/server/auth/auth.http";

export async function POST(request: Request) {
  return authRequest(request, (service, body) => service.login(body), 200);
}
