import { taskCommand } from "@/server/occurrences/task-actions";

export async function POST(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  const { code } = await context.params;
  return taskCommand(request, code);
}
