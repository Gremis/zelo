import { processUploadFile } from "@/server/occurrences/uploads";

export const maxDuration = 60;

export async function POST(
  request: Request,
  context: {
    params: Promise<{
      slug: string;
      attemptId: string;
      fileId: string;
      action: string;
    }>;
  },
) {
  const { slug, attemptId, fileId, action } = await context.params;
  return processUploadFile(request, slug, attemptId, fileId, action);
}
