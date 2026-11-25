import { beforeEach, describe, expect, it, vi } from "vitest";

const getFuncionariosService = vi.fn();

vi.mock("@/server/funcionarios/funcionarios.factory", () => ({
  getFuncionariosService: () => getFuncionariosService(),
}));

import { GET, POST } from "@/app/api/funcionarios/route";
import { PATCH } from "@/app/api/funcionarios/[id]/route";
import { failure, success } from "@/server/funcionarios/funcionarios.result";

const UUID = "11111111-1111-4111-8111-111111111111";

function postJson(body: unknown): Request {
  return new Request("http://localhost/api/funcionarios", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function patchJson(body: unknown): Request {
  return new Request(`http://localhost/api/funcionarios/${UUID}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const authError = {
  ok: false,
  error: { code: "not_authenticated", message: "Entre na sua conta." },
};

beforeEach(() => {
  getFuncionariosService.mockReset();
});

describe("rotas de funcionários — autenticação", () => {
  it("GET sem sessão retorna 401", async () => {
    getFuncionariosService.mockResolvedValue(authError);

    const res = await GET();

    expect(res.status).toBe(401);
  });

  it("POST sem sessão retorna 401", async () => {
    getFuncionariosService.mockResolvedValue(authError);

    const res = await POST(postJson({}));

    expect(res.status).toBe(401);
  });
});

describe("rota POST /api/funcionarios", () => {
  it("retorna 201 no sucesso", async () => {
    getFuncionariosService.mockResolvedValue({
      ok: true,
      service: {
        createFuncionario: async () => success({ funcionario: { id: UUID } }),
      },
    });

    const res = await POST(postJson({ nome: "Antônio Pereira" }));

    expect(res.status).toBe(201);
  });

  it("propaga 409 de celular duplicado", async () => {
    getFuncionariosService.mockResolvedValue({
      ok: true,
      service: {
        createFuncionario: async () =>
          failure({ code: "celular_already_registered", message: "x" }),
      },
    });

    const res = await POST(postJson({ nome: "Antônio Pereira" }));

    expect(res.status).toBe(409);
  });
});

describe("rota PATCH /api/funcionarios/[id]", () => {
  const context = { params: Promise.resolve({ id: UUID }) };

  it("corpo null retorna 400 sem chamar o service", async () => {
    const deactivate = vi.fn();
    getFuncionariosService.mockResolvedValue({
      ok: true,
      service: { deactivate, reactivate: vi.fn() },
    });

    const res = await PATCH(patchJson(null), context);

    expect(res.status).toBe(400);
    expect(deactivate).not.toHaveBeenCalled();
  });

  it("ativo:false chama deactivate e retorna 200", async () => {
    const deactivate = vi.fn(async () =>
      success({ funcionario: { id: UUID } }),
    );
    getFuncionariosService.mockResolvedValue({
      ok: true,
      service: { deactivate, reactivate: vi.fn() },
    });

    const res = await PATCH(patchJson({ ativo: false }), context);

    expect(res.status).toBe(200);
    expect(deactivate).toHaveBeenCalledWith(UUID);
  });
});
