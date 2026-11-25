import { prepareUploads } from "@/server/occurrences/uploads";

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  return prepareUploads(request, (await context.params).slug);
}
