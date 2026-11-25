import { loadEmployeeTask } from "@/server/occurrences/task.service";

export async function GET(
  _request: Request,
  context: { params: Promise<{ code: string }> },
) {
  const headers = {
    "Cache-Control": "private, no-store, max-age=0",
    "Referrer-Policy": "no-referrer",
    "X-Robots-Tag": "noindex, nofollow",
  };
  try {
    const { code } = await context.params;
    const task = await loadEmployeeTask(code);
    if (!task)
      return Response.json(
        {
          error:
            "Não encontramos esta tarefa. Confira o link que você recebeu.",
        },
        { status: 404, headers },
      );
    return Response.json(task, { headers });
  } catch {
    return Response.json(
      { error: "Não foi possível carregar a tarefa. Tente novamente." },
      { status: 503, headers },
    );
  }
}
