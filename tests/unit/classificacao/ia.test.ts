import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { classificarComIa, validarResposta } from "@/server/classificacao/ia";

describe("validarResposta", () => {
  it("aceita um JSON válido e apara o motivo", () => {
    const r = validarResposta(
      '{"prioridade":"Urgente","categoria":"Gás","motivo":"  Cheiro de gás.  "}',
    );
    expect(r).toEqual({
      ok: true,
      sugestao: {
        prioridade: "Urgente",
        categoria: "Gás",
        motivo: "Cheiro de gás.",
      },
    });
  });

  it("aceita objeto já parseado", () => {
    const r = validarResposta({
      prioridade: "Normal",
      categoria: "Iluminação",
      motivo: "Lâmpada queimada.",
    });
    expect(r.ok).toBe(true);
  });

  it("recusa prioridade fora das três", () => {
    const r = validarResposta({
      prioridade: "Alta",
      categoria: "Gás",
      motivo: "x",
    });
    expect(r).toEqual({ ok: false, falha: "formato" });
  });

  it("recusa categoria fora da lista", () => {
    const r = validarResposta({
      prioridade: "Normal",
      categoria: "Encanamento",
      motivo: "x",
    });
    expect(r).toEqual({ ok: false, falha: "formato" });
  });

  it("recusa JSON inválido", () => {
    expect(validarResposta("{nope")).toEqual({ ok: false, falha: "formato" });
  });

  it("recusa motivo vazio", () => {
    const r = validarResposta({
      prioridade: "Baixa",
      categoria: "Outros",
      motivo: "   ",
    });
    expect(r.ok).toBe(false);
  });
});

describe("classificarComIa", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    process.env.GEMINI_API_KEY = "test-key";
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.GEMINI_API_KEY;
  });

  function respostaGroq(conteudo: string) {
    return {
      ok: true,
      json: async () => ({ choices: [{ message: { content: conteudo } }] }),
    };
  }

  it("devolve a sugestão quando a IA responde certo", async () => {
    fetchMock.mockResolvedValue(
      respostaGroq(
        '{"prioridade":"Urgente","categoria":"Elétrica","motivo":"Fio exposto."}',
      ),
    );

    const r = await classificarComIa("Garagem", "Fio exposto no teto");

    expect(r).toEqual({
      ok: true,
      sugestao: {
        prioridade: "Urgente",
        categoria: "Elétrica",
        motivo: "Fio exposto.",
      },
    });
  });

  it("falha 'formato' quando a IA devolve categoria fora da lista", async () => {
    fetchMock.mockResolvedValue(
      respostaGroq('{"prioridade":"Normal","categoria":"Xyz","motivo":"ok"}'),
    );

    const r = await classificarComIa("Hall", "algo");

    expect(r).toEqual({ ok: false, falha: "formato" });
  });

  it("falha 'erro' quando o HTTP não é ok", async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({}) });

    const r = await classificarComIa("Hall", "algo");

    expect(r).toEqual({ ok: false, falha: "erro" });
  });

  it("falha 'timeout' quando a chamada é abortada", async () => {
    const abort = new Error("aborted");
    abort.name = "AbortError";
    fetchMock.mockRejectedValue(abort);

    const r = await classificarComIa("Hall", "algo");

    expect(r).toEqual({ ok: false, falha: "timeout" });
  });

  it("falha 'erro' quando falta a chave", async () => {
    delete process.env.GEMINI_API_KEY;

    const r = await classificarComIa("Hall", "algo");

    expect(r).toEqual({ ok: false, falha: "erro" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
