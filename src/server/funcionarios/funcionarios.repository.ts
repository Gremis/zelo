import type { SupabaseClient } from "@supabase/supabase-js";
import type { CreateFuncionarioInput } from "./funcionarios.validation";

export type FuncionarioListItem = {
  id: string;
  nome: string;
  celular: string;
  ativo: boolean;
  horarioTrabalho: string | null;
  funcao: string | null;
  condominio: string | null;
};

export type Funcao = { id: string; nome: string };

export type WriteErrorReason =
  | "celular_already_registered"
  | "forbidden"
  | "invalid"
  | "not_authenticated"
  | "unknown";

export type CreateFuncionarioOutcome =
  | { status: "ok"; funcionario: FuncionarioListItem }
  | { status: "error"; reason: WriteErrorReason };

export type CreateFuncaoOutcome =
  | { status: "ok"; funcao: Funcao }
  | { status: "error"; reason: WriteErrorReason };

export type ToggleOutcome =
  | { status: "ok"; funcionario: FuncionarioListItem }
  | { status: "not_found" }
  | { status: "error"; reason: WriteErrorReason };

export type ListOutcome<T> =
  { status: "ok"; data: T } | { status: "error"; reason: WriteErrorReason };

export type FuncionariosRepository = {
  createFuncionario(
    input: CreateFuncionarioInput,
  ): Promise<CreateFuncionarioOutcome>;
  listFuncionarios(): Promise<ListOutcome<FuncionarioListItem[]>>;
  setAtivo(id: string, ativo: boolean): Promise<ToggleOutcome>;
  createFuncao(nome: string): Promise<CreateFuncaoOutcome>;
  listFuncoes(): Promise<ListOutcome<Funcao[]>>;
};

export type PostgresError = { code?: string | null };

export type RawFuncionario = {
  id: string;
  nome: string;
  celular: string;
  ativo: boolean;
  horario_trabalho: string | null;
  funcao: { nome: string } | null;
  condominio: { name: string } | null;
};

const ITEM_SELECT =
  "id, nome, celular, ativo, horario_trabalho, funcao:funcoes(nome), condominio:condominiums(name)";

export function classify(error: PostgresError): WriteErrorReason {
  switch (error.code) {
    case "23505":
      return "celular_already_registered";
    case "42501":
    case "23503":
      return "forbidden";
    case "28000":
      return "not_authenticated";
    case "22023":
    case "23514":
      return "invalid";
    default:
      return "unknown";
  }
}

export function toItem(row: RawFuncionario): FuncionarioListItem {
  return {
    id: row.id,
    nome: row.nome,
    celular: row.celular,
    ativo: row.ativo,
    horarioTrabalho: row.horario_trabalho,
    funcao: row.funcao?.nome ?? null,
    condominio: row.condominio?.name ?? null,
  };
}

export function createFuncionariosRepository(
  supabase: SupabaseClient,
): FuncionariosRepository {
  async function fetchItem(id: string): Promise<RawFuncionario | null> {
    const { data } = await supabase
      .from("funcionarios")
      .select(ITEM_SELECT)
      .eq("id", id)
      .maybeSingle();
    return (data as unknown as RawFuncionario | null) ?? null;
  }

  return {
    async createFuncionario(input) {
      const { data, error } = await supabase.rpc("create_funcionario", {
        p_condominio_id: input.condominioId,
        p_funcao_nome: input.funcaoNome,
        p_nome: input.nome,
        p_celular: input.celular,
        p_horario_trabalho: input.horarioTrabalho,
      });

      if (error) {
        return { status: "error", reason: classify(error) };
      }

      const row = data as {
        id: string;
        nome: string;
        celular: string;
        ativo: boolean;
        horario_trabalho: string | null;
      } | null;
      if (row === null) {
        return { status: "error", reason: "unknown" };
      }

      const created = await fetchItem(row.id);
      if (created !== null) {
        return { status: "ok", funcionario: toItem(created) };
      }

      // O cadastro já foi efetivado pelo RPC. Se a busca dos nomes falhar,
      // não reportamos erro (evitaria um 500 e o retry viraria 409).
      return {
        status: "ok",
        funcionario: {
          id: row.id,
          nome: row.nome,
          celular: row.celular,
          ativo: row.ativo,
          horarioTrabalho: row.horario_trabalho,
          funcao: input.funcaoNome,
          condominio: null,
        },
      };
    },

    async listFuncionarios() {
      const { data, error } = await supabase
        .from("funcionarios")
        .select(ITEM_SELECT)
        .order("ativo", { ascending: false })
        .order("nome", { ascending: true });

      if (error) {
        return { status: "error", reason: classify(error) };
      }

      return {
        status: "ok",
        data: ((data as unknown as RawFuncionario[] | null) ?? []).map(toItem),
      };
    },

    async setAtivo(id, ativo) {
      const { data, error } = await supabase
        .from("funcionarios")
        .update({ ativo })
        .eq("id", id)
        .select(ITEM_SELECT)
        .maybeSingle();

      if (error) {
        return { status: "error", reason: classify(error) };
      }
      if (data === null) {
        return { status: "not_found" };
      }

      return {
        status: "ok",
        funcionario: toItem(data as unknown as RawFuncionario),
      };
    },

    async createFuncao(nome) {
      const { data, error } = await supabase.rpc("create_funcao", {
        p_nome: nome,
      });

      if (error) {
        return { status: "error", reason: classify(error) };
      }

      const funcao = data as Funcao;
      return { status: "ok", funcao: { id: funcao.id, nome: funcao.nome } };
    },

    async listFuncoes() {
      const { data, error } = await supabase
        .from("funcoes")
        .select("id, nome")
        .order("nome", { ascending: true });

      if (error) {
        return { status: "error", reason: classify(error) };
      }

      return { status: "ok", data: (data as Funcao[] | null) ?? [] };
    },
  };
}
