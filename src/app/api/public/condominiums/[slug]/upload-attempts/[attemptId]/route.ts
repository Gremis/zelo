import { manageUploads } from "@/server/occurrences/uploads";

export async function GET(
  request: Request,
  context: { params: Promise<{ slug: string; attemptId: string }> },
) {
  const { slug, attemptId } = await context.params;
  return manageUploads(request, slug, attemptId);
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ slug: string; attemptId: string }> },
) {
  const { slug, attemptId } = await context.params;
  return manageUploads(request, slug, attemptId);
}
