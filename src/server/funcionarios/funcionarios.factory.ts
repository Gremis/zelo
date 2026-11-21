import { createClient } from "@/lib/supabase/server";
import { createFuncionariosRepository } from "./funcionarios.repository";
import type { FuncionarioError } from "./funcionarios.result";
import {
  type FuncionariosService,
  createFuncionariosService,
} from "./funcionarios.service";

export type ServiceResult =
  | { ok: true; service: FuncionariosService }
  | { ok: false; error: FuncionarioError };

export async function getFuncionariosService(): Promise<ServiceResult> {
  const supabase = await createClient();

  // Distingue "sem sessão" (401) de "sem permissão" (403): sem este getUser,
  // uma chamada anônima cairia em 42501 -> forbidden (403) com mensagem errada.
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return {
      ok: false,
      error: {
        code: "not_authenticated",
        message: "Entre na sua conta para continuar.",
      },
    };
  }

  return {
    ok: true,
    service: createFuncionariosService(createFuncionariosRepository(supabase)),
  };
}
