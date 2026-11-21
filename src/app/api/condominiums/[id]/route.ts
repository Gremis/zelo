import { handleCondominiums } from "@/server/condominiums/http";
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handleCondominiums(request, (await context.params).id);
}
