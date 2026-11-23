import { failure } from "@/server/auth/auth.result";
import { authRequest } from "@/server/auth/auth.http";

export async function POST(request: Request) {
  return authRequest(
    request,
    async (service) => {
      const identity = await service.confirmedIdentity();
      if (!identity.ok)
        return failure({
          code: "unauthorized",
          message: "Entre com uma conta confirmada.",
        });
      return service.logout();
    },
    200,
    false,
  );
}
