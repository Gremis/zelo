import { confirmedIdentity } from "@/server/auth/identity";
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
  const identity = await confirmedIdentity();
  if (!identity) {
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
    service: createFuncionariosService(
      createFuncionariosRepository(identity.supabase),
    ),
  };
}
