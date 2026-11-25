import { confirmedIdentity } from "@/server/auth/identity";
import { uploadJson } from "@/server/occurrences/uploads";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const headers = new Headers({
    "Cache-Control": "private, no-store, max-age=0",
  });
  const reply = (body: unknown, status = 200) =>
    Response.json(body, { status, headers });
  try {
    const identity = await confirmedIdentity(headers);
    if (!identity)
      return reply({ error: "Entre com uma conta confirmada." }, 401);
    const { id } = await context.params;
    const body = (await uploadJson(request).catch(() => null)) as {
      throughEventId?: unknown;
    } | null;
    if (
      !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id) ||
      new URL(request.url).search ||
      !body ||
      Object.keys(body).join() !== "throughEventId" ||
      typeof body.throughEventId !== "number" ||
      !Number.isSafeInteger(body.throughEventId) ||
      body.throughEventId < 1
    )
      return reply({ error: "Leitura inválida." }, 400);
    const { data, error } = await identity.supabase.rpc(
      "read_occurrence_employee_messages",
      { target_occurrence: id, through_event: body.throughEventId },
    );
    if (error)
      return reply(
        { error: "Não foi possível registrar a leitura dos recados." },
        error.code === "28000"
          ? 401
          : error.code === "42501"
            ? 403
            : error.code === "22023"
              ? 400
              : 503,
      );
    return reply({ throughEventId: data });
  } catch {
    return reply(
      { error: "Não foi possível registrar a leitura dos recados." },
      503,
    );
  }
}
