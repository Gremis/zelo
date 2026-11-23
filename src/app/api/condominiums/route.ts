import { handleCondominiums } from "@/server/condominiums/http";
export async function GET() {
  return handleCondominiums();
}
export async function POST(request: Request) {
  return handleCondominiums(request);
}
