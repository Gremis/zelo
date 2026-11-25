import {
  type FuncionarioError,
  type Result,
  failure,
  success,
} from "./funcionarios.result";
import type {
  Funcao,
  FuncionarioListItem,
  FuncionariosRepository,
  WriteErrorReason,
} from "./funcionarios.repository";
import {
  isUuid,
  validateCreateFuncao,
  validateCreateFuncionario,
} from "./funcionarios.validation";

const WRITE_ERRORS: Record<WriteErrorReason, FuncionarioError> = {
  celular_already_registered: {
    code: "celular_already_registered",
    message: "Esse celular já está cadastrado para outro funcionário.",
  },
  forbidden: {
    code: "forbidden",
    message: "Você não tem permissão para esta operação.",
  },
  invalid: {
    code: "invalid_input",
    message: "Dados inválidos.",
  },
  not_authenticated: {
    code: "not_authenticated",
    message: "Sua sessão expirou. Entre novamente.",
  },
  unknown: {
    code: "unknown",
    message: "Não foi possível concluir a operação. Tente novamente.",
  },
};

export type FuncionariosService = {
  createFuncionario(
    body: unknown,
  ): Promise<Result<{ funcionario: FuncionarioListItem }>>;
  listFuncionarios(): Promise<Result<{ funcionarios: FuncionarioListItem[] }>>;
  deactivate(id: string): Promise<Result<{ funcionario: FuncionarioListItem }>>;
  reactivate(id: string): Promise<Result<{ funcionario: FuncionarioListItem }>>;
  createFuncao(body: unknown): Promise<Result<{ funcao: Funcao }>>;
  listFuncoes(): Promise<Result<{ funcoes: Funcao[] }>>;
};

export function createFuncionariosService(
  repository: FuncionariosRepository,
): FuncionariosService {
  async function setAtivo(
    id: string,
    ativo: boolean,
  ): Promise<Result<{ funcionario: FuncionarioListItem }>> {
    if (!isUuid(id)) {
      return failure({
        code: "invalid_input",
        message: "Funcionário inválido.",
      });
    }

    const outcome = await repository.setAtivo(id, ativo);
    if (outcome.status === "not_found") {
      return failure({
        code: "funcionario_not_found",
        message: "Funcionário não encontrado.",
      });
    }
    if (outcome.status === "error") {
      return failure(WRITE_ERRORS[outcome.reason]);
    }

    return success({ funcionario: outcome.funcionario });
  }

  return {
    async createFuncionario(body) {
      let input = body;
      if (typeof body === "object" && body !== null && "funcaoId" in body) {
        const id = (body as Record<string, unknown>).funcaoId;
        if (typeof id !== "string" || !isUuid(id)) {
          return failure({
            code: "invalid_input",
            message: "Dados inválidos.",
            details: { funcaoId: "Selecione a função." },
          });
        }
        const available = await repository.listFuncoes();
        if (available.status === "error")
          return failure(WRITE_ERRORS[available.reason]);
        const role = available.data.find((item) => item.id === id);
        if (!role) return failure(WRITE_ERRORS.forbidden);
        input = { ...body, funcaoNome: role.nome };
      }
      const validation = validateCreateFuncionario(input);
      if (!validation.ok) {
        return validation;
      }

      const outcome = await repository.createFuncionario(validation.data);
      if (outcome.status === "error") {
        return failure(WRITE_ERRORS[outcome.reason]);
      }

      return success({ funcionario: outcome.funcionario });
    },

    async listFuncionarios() {
      const outcome = await repository.listFuncionarios();
      if (outcome.status === "error") {
        return failure(WRITE_ERRORS[outcome.reason]);
      }

      return success({ funcionarios: outcome.data });
    },

    deactivate(id) {
      return setAtivo(id, false);
    },

    reactivate(id) {
      return setAtivo(id, true);
    },

    async createFuncao(body) {
      const validation = validateCreateFuncao(body);
      if (!validation.ok) {
        return validation;
      }

      const outcome = await repository.createFuncao(validation.data.nome);
      if (outcome.status === "error") {
        return failure(WRITE_ERRORS[outcome.reason]);
      }

      return success({ funcao: outcome.funcao });
    },

    async listFuncoes() {
      const outcome = await repository.listFuncoes();
      if (outcome.status === "error") {
        return failure(WRITE_ERRORS[outcome.reason]);
      }

      return success({ funcoes: outcome.data });
    },
  };
}
