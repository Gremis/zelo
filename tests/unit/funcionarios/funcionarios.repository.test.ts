import { describe, expect, it } from "vitest";
import {
  type WriteErrorReason,
  classify,
  toItem,
} from "@/server/funcionarios/funcionarios.repository";

describe("classify (SQLSTATE -> reason)", () => {
  const cases: [string | undefined, WriteErrorReason][] = [
    ["23505", "celular_already_registered"],
    ["42501", "forbidden"],
    ["23503", "forbidden"],
    ["28000", "not_authenticated"],
    ["22023", "invalid"],
    ["23514", "invalid"],
    ["99999", "unknown"],
    [undefined, "unknown"],
  ];

  it.each(cases)("maps %s to %s", (code, reason) => {
    expect(classify({ code })).toBe(reason);
  });
});

describe("toItem", () => {
  it("flattens the joined funcao and condominio names", () => {
    const item = toItem({
      id: "1",
      nome: "Antônio Pereira",
      celular: "(31) 99300-1180",
      ativo: true,
      horario_trabalho: "Seg a sex",
      funcao: { nome: "Zelador" },
      condominio: { name: "Edifício Demo" },
    });

    expect(item).toEqual({
      id: "1",
      nome: "Antônio Pereira",
      celular: "(31) 99300-1180",
      ativo: true,
      horarioTrabalho: "Seg a sex",
      funcao: "Zelador",
      condominio: "Edifício Demo",
    });
  });

  it("uses null when joins or schedule are missing", () => {
    const item = toItem({
      id: "1",
      nome: "Antônio Pereira",
      celular: "(31) 99300-1180",
      ativo: false,
      horario_trabalho: null,
      funcao: null,
      condominio: null,
    });

    expect(item.funcao).toBeNull();
    expect(item.condominio).toBeNull();
    expect(item.horarioTrabalho).toBeNull();
  });
});
