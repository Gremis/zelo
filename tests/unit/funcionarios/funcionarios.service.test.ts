import { describe, expect, it } from "vitest";
import type {
  Funcao,
  FuncionarioListItem,
  FuncionariosRepository,
} from "@/server/funcionarios/funcionarios.repository";
import { createFuncionariosService } from "@/server/funcionarios/funcionarios.service";

const ITEM: FuncionarioListItem = {
  id: "11111111-1111-4111-8111-111111111111",
  nome: "Antônio Pereira",
  celular: "(31) 99300-1180",
  ativo: true,
  horarioTrabalho: null,
  funcao: "Zelador",
  condominio: "Edifício Demo",
};

const FUNCAO: Funcao = {
  id: "22222222-2222-4222-8222-222222222222",
  nome: "Zelador",
};

const VALID_BODY = {
  nome: "Antônio Pereira",
  condominioId: "33333333-3333-4333-8333-333333333333",
  funcaoNome: "Zelador",
  celular: "(31) 99300-1180",
};

function createRepository(
  overrides: Partial<FuncionariosRepository> = {},
): FuncionariosRepository {
  return {
    createFuncionario: async () => ({ status: "ok", funcionario: ITEM }),
    listFuncionarios: async () => ({ status: "ok", data: [ITEM] }),
    setAtivo: async () => ({ status: "ok", funcionario: ITEM }),
    createFuncao: async () => ({ status: "ok", funcao: FUNCAO }),
    listFuncoes: async () => ({ status: "ok", data: [FUNCAO] }),
    ...overrides,
  };
}

describe("FuncionariosService.createFuncionario", () => {
  it("returns the created funcionario", async () => {
    const service = createFuncionariosService(createRepository());

    const result = await service.createFuncionario(VALID_BODY);

    expect(result).toEqual({ ok: true, data: { funcionario: ITEM } });
  });

  it("does not reach the repository when input is invalid", async () => {
    let called = false;
    const service = createFuncionariosService(
      createRepository({
        createFuncionario: async () => {
          called = true;
          return { status: "ok", funcionario: ITEM };
        },
      }),
    );

    const result = await service.createFuncionario({});

    expect(called).toBe(false);
    if (result.ok) {
      throw new Error("expected a validation failure");
    }
    expect(result.error.code).toBe("invalid_input");
  });

  it("maps a duplicate celular to its message", async () => {
    const service = createFuncionariosService(
      createRepository({
        createFuncionario: async () => ({
          status: "error",
          reason: "celular_already_registered",
        }),
      }),
    );

    const result = await service.createFuncionario(VALID_BODY);

    if (result.ok) {
      throw new Error("expected a failure");
    }
    expect(result.error.code).toBe("celular_already_registered");
    expect(result.error.message).toBe(
      "Esse celular já está cadastrado para outro funcionário.",
    );
  });

  it("maps a forbidden carteira link to a 403 error", async () => {
    const service = createFuncionariosService(
      createRepository({
        createFuncionario: async () => ({
          status: "error",
          reason: "forbidden",
        }),
      }),
    );

    const result = await service.createFuncionario(VALID_BODY);

    if (result.ok) {
      throw new Error("expected a failure");
    }
    expect(result.error.code).toBe("forbidden");
  });
});

describe("FuncionariosService.listFuncionarios", () => {
  it("returns the list", async () => {
    const service = createFuncionariosService(createRepository());

    const result = await service.listFuncionarios();

    expect(result).toEqual({ ok: true, data: { funcionarios: [ITEM] } });
  });
});

describe("FuncionariosService deactivate/reactivate", () => {
  it("rejects an invalid id without reaching the repository", async () => {
    let called = false;
    const service = createFuncionariosService(
      createRepository({
        setAtivo: async () => {
          called = true;
          return { status: "ok", funcionario: ITEM };
        },
      }),
    );

    const result = await service.deactivate("not-a-uuid");

    expect(called).toBe(false);
    if (result.ok) {
      throw new Error("expected a failure");
    }
    expect(result.error.code).toBe("invalid_input");
  });

  it("maps a missing funcionario to not_found", async () => {
    const service = createFuncionariosService(
      createRepository({ setAtivo: async () => ({ status: "not_found" }) }),
    );

    const result = await service.deactivate(ITEM.id);

    if (result.ok) {
      throw new Error("expected a failure");
    }
    expect(result.error.code).toBe("funcionario_not_found");
  });

  it("reactivates by setting ativo true", async () => {
    let received: boolean | null = null;
    const service = createFuncionariosService(
      createRepository({
        setAtivo: async (_id, ativo) => {
          received = ativo;
          return { status: "ok", funcionario: ITEM };
        },
      }),
    );

    const result = await service.reactivate(ITEM.id);

    expect(received).toBe(true);
    expect(result.ok).toBe(true);
  });
});

describe("FuncionariosService funcoes", () => {
  it("creates a funcao", async () => {
    const service = createFuncionariosService(createRepository());

    const result = await service.createFuncao({ nome: "Jardineira" });

    expect(result).toEqual({ ok: true, data: { funcao: FUNCAO } });
  });

  it("rejects an empty funcao name", async () => {
    const service = createFuncionariosService(createRepository());

    const result = await service.createFuncao({ nome: "  " });

    if (result.ok) {
      throw new Error("expected a failure");
    }
    expect(result.error.code).toBe("invalid_input");
  });

  it("lists funcoes", async () => {
    const service = createFuncionariosService(createRepository());

    const result = await service.listFuncoes();

    expect(result).toEqual({ ok: true, data: { funcoes: [FUNCAO] } });
  });
});
