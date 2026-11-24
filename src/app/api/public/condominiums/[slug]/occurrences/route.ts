import { registerPublicRequest } from "@/server/occurrences/public.http";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  return registerPublicRequest(request, (await params).slug);
}
