import { confirmedIdentity } from "@/server/auth/identity";
import {
  loadOccurrenceDetail,
  OccurrenceReadError,
} from "@/server/occurrences/detail.service";
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const headers = new Headers({ "Cache-Control": "private, no-store" });
  try {
    const identity = await confirmedIdentity(headers);
    if (!identity)
      return Response.json(
        { error: "Entre na sua conta." },
        { status: 401, headers },
      );
    const { id } = await context.params;
    const detail = await loadOccurrenceDetail(identity.supabase, id);
    const { data, error } = await identity.supabase
      .from("funcionarios")
      .select("id,nome,celular,funcao:funcoes(nome)")
      .eq("condominio_id", detail.condominium.id)
      .eq("ativo", true)
      .order("nome");
    if (error) throw error;
    return Response.json({ employees: data }, { headers });
  } catch (error) {
    return Response.json(
      { error: "Não foi possível carregar os funcionários." },
      {
        status: error instanceof OccurrenceReadError ? error.status : 503,
        headers,
      },
    );
  }
}
