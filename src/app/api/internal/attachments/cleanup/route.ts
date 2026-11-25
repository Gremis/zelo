import { cleanupUploads } from "@/server/occurrences/uploads";

export const maxDuration = 60;

export async function GET(request: Request) {
  return cleanupUploads(request);
}
