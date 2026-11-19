import { authRequest } from "@/server/auth/auth.http";

export async function POST(request: Request) {
  return authRequest(request, (service) => service.logout(), 200, false);
}
