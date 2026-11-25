import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { TASK_CODE_PATTERN } from "@/lib/occurrences/task-link";
import { uploadJson } from "./uploads";

export const taskHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
};

export async function taskCommand(request: Request, code: string) {
  const reply = (body: unknown, status: number) =>
    Response.json(body, { status, headers: taskHeaders });
  if (!TASK_CODE_PATTERN.test(code))
    return reply(
      {
        error: "Não encontramos esta tarefa. Confira o link que você recebeu.",
      },
      404,
    );
  try {
    const body = (await uploadJson(request)) as Record<string, unknown>;
    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body) ||
      Object.keys(body).sort().join() !== "key,payload,type" ||
      typeof body.key !== "string" ||
      !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(body.key) ||
      !["start", "complete"].includes(String(body.type))
    )
      return reply({ error: "Dados inválidos." }, 400);
    const { url } = getSupabaseConfig();
    const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!secret) throw new Error("Server configuration unavailable.");
    const client = createClient<Database>(url, secret, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        fetch: (input, init) =>
          fetch(input, {
            ...init,
            cache: "no-store",
            signal: AbortSignal.timeout(60_000),
          }),
      },
    });
    const { data, error } = await client.rpc("employee_task_command", {
      p_code: code,
      command_key: body.key,
      command_type: String(body.type),
      payload: body.payload as Json,
    });
    if (error) {
      const status =
        error.code === "P0002"
          ? 404
          : ["P0003", "42501"].includes(error.code)
            ? 409
            : ["22023", "22P02"].includes(error.code)
              ? 400
              : 503;
      return reply(
        {
          error:
            status === 409
              ? "Esta tarefa não permite mais alterações. Atualize a página para consultar o estado atual."
              : status === 404
                ? "Não encontramos esta tarefa. Confira o link que você recebeu."
                : "Não foi possível salvar. Tente recuperar a operação.",
        },
        status,
      );
    }
    return reply(data, 200);
  } catch {
    return reply(
      { error: "Não foi possível salvar. Tente recuperar a operação." },
      503,
    );
  }
}
