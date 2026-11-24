import { describe, expect, it } from "vitest";
import {
  validateCreateFuncao,
  validateCreateFuncionario,
} from "@/server/funcionarios/funcionarios.validation";

const VALID = {
  nome: "Antônio Pereira",
  condominioId: "51400000-0000-4000-8000-000000000001",
  funcaoNome: "Zelador",
  celular: "(31) 99300-1180",
  horarioTrabalho: "Seg a sex, 7h às 16h",
};

describe("validateCreateFuncionario", () => {
  it("accepts a valid payload and formats the celular", () => {
    const result = validateCreateFuncionario(VALID);

    if (!result.ok) {
      throw new Error("expected success");
    }
    expect(result.data.celular).toBe("(31) 99300-1180");
    expect(result.data.horarioTrabalho).toBe("Seg a sex, 7h às 16h");
  });

  it("removes a +55 country prefix before validating", () => {
    const result = validateCreateFuncionario({
      ...VALID,
      celular: "+55 (31) 99300-1180",
    });

    if (!result.ok) {
      throw new Error("expected success");
    }
    expect(result.data.celular).toBe("(31) 99300-1180");
  });

  it("rejects a 10-digit landline", () => {
    const result = validateCreateFuncionario({
      ...VALID,
      celular: "(31) 3333-4444",
    });

    if (result.ok) {
      throw new Error("expected a failure");
    }
    expect(result.error.details?.celular).toBeDefined();
  });

  it("rejects an 11-digit number without the mobile 9", () => {
    const result = validateCreateFuncionario({
      ...VALID,
      celular: "11 83333-4444",
    });

    if (result.ok) {
      throw new Error("expected a failure");
    }
    expect(result.error.details?.celular).toBeDefined();
  });

  it("rejects a single-word name", () => {
    const result = validateCreateFuncionario({ ...VALID, nome: "Madonna" });

    if (result.ok) {
      throw new Error("expected a failure");
    }
    expect(result.error.details?.nome).toBeDefined();
  });

  it("collapses internal spaces in the name", () => {
    const result = validateCreateFuncionario({
      ...VALID,
      nome: "Ana   Lima",
    });

    if (!result.ok) {
      throw new Error("expected success");
    }
    expect(result.data.nome).toBe("Ana Lima");
  });

  it("collapses internal spaces in the funcao name", () => {
    const result = validateCreateFuncionario({
      ...VALID,
      funcaoNome: "Auxiliar de  limpeza",
    });

    if (!result.ok) {
      throw new Error("expected success");
    }
    expect(result.data.funcaoNome).toBe("Auxiliar de limpeza");
  });

  it("rejects an invalid condominio id", () => {
    const result = validateCreateFuncionario({ ...VALID, condominioId: "abc" });

    if (result.ok) {
      throw new Error("expected a failure");
    }
    expect(result.error.details?.condominioId).toBeDefined();
  });

  it("requires a funcao name", () => {
    const result = validateCreateFuncionario({ ...VALID, funcaoNome: "  " });

    if (result.ok) {
      throw new Error("expected a failure");
    }
    expect(result.error.details?.funcaoNome).toBeDefined();
  });

  it("treats a blank schedule as null", () => {
    const result = validateCreateFuncionario({
      ...VALID,
      horarioTrabalho: "   ",
    });

    if (!result.ok) {
      throw new Error("expected success");
    }
    expect(result.data.horarioTrabalho).toBeNull();
  });

  it("rejects a name longer than the limit", () => {
    const result = validateCreateFuncionario({
      ...VALID,
      nome: `Antônio ${"a".repeat(100)}`,
    });

    if (result.ok) {
      throw new Error("expected a failure");
    }
    expect(result.error.details?.nome).toBeDefined();
  });
});

describe("validateCreateFuncao", () => {
  it("accepts and collapses spaces", () => {
    const result = validateCreateFuncao({ nome: "Auxiliar de  limpeza" });

    if (!result.ok) {
      throw new Error("expected success");
    }
    expect(result.data.nome).toBe("Auxiliar de limpeza");
  });

  it("rejects an empty name", () => {
    const result = validateCreateFuncao({ nome: "   " });

    if (result.ok) {
      throw new Error("expected a failure");
    }
    expect(result.error.code).toBe("invalid_input");
  });
});
