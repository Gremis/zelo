import { describe, expect, test } from "vitest";
import { detectRisk } from "@/lib/occurrences/risk-rules";
import { RISK_TERMS } from "@/lib/occurrences/risk-terms";
import answerKey from "./fixtures/risk-answer-key.json";
import phrases from "./fixtures/risk-phrases.json";

const expectedMatches = {
  G01: "gás",
  G05: "fumaça",
  G08: "alagando",
  G09: "dando choque",
  G15: "faísca",
  G17: "fio desencapado",
  G36: "gás",
} as const;

describe("ORI-83 official phrases", () => {
  test.each(phrases)("$report", ({ report, hasRisk }) => {
    expect(detectRisk("", report).hasRisk).toBe(hasRisk);
  });
});

describe("ORI-83 complete answer key", () => {
  test.each(answerKey)("$id", ({ id, onde, relato }) => {
    const term = expectedMatches[id as keyof typeof expectedMatches];
    expect(detectRisk(onde, relato)).toEqual(
      term ? { hasRisk: true, term } : { hasRisk: false, term: null },
    );
  });

  test("retains all 50 examples, six detected urgent cases and the accepted false positive", () => {
    expect(answerKey).toHaveLength(50);
    expect(new Set(answerKey.map(({ id }) => id)).size).toBe(50);
    expect(
      answerKey.filter(({ prioridade }) => prioridade === "Urgente"),
    ).toHaveLength(20);
    const matches = answerKey.filter(
      ({ onde, relato }) => detectRisk(onde, relato).hasRisk,
    );
    expect(
      matches
        .filter(({ prioridade }) => prioridade === "Urgente")
        .map(({ id }) => id),
    ).toEqual(["G01", "G05", "G08", "G09", "G15", "G17"]);
    expect(
      matches
        .filter(({ prioridade }) => prioridade !== "Urgente")
        .map(({ id }) => id),
    ).toEqual(["G36"]);
  });
});

describe("risk matching contract", () => {
  test.each(RISK_TERMS)(
    "recognizes official term %s in either field",
    (term) => {
      expect(detectRisk(term, "").hasRisk).toBe(true);
      expect(detectRisk("", term).hasRisk).toBe(true);
      expect(detectRisk("", term.toUpperCase().normalize("NFD")).hasRisk).toBe(
        true,
      );
    },
  );

  test("preserves the 37 official expressions", () => {
    expect(RISK_TERMS).toHaveLength(37);
    expect(new Set(RISK_TERMS).size).toBe(37);
  });

  test.each([
    ["", "", null],
    ["  ", "\n\t", null],
    ["", "GAS!", "gás"],
    ["", "(FOGO).", "fogo"],
    ["", "faíscas", "faíscas"],
    ["", "gasto fogão fogos choque curto rachadura", null],
    ["", "agas gasz 1gas gas2 xFOGO FOGO9", null],
    ["", "_gás_", "gás"],
    ["", "cheiro   de\tqueimado", "cheiro de queimado"],
    ["", "curto\ncircuito", "curto circuito"],
    ["", "curto-circuito", "curto-circuito"],
    ["", "curto.circuito", null],
    ["cheiro de", "queimado", "cheiro de queimado"],
    ["", "fogo e gás", "gás"],
    ["fogo", "gás", "gás"],
    ["vazamento de gás", "", "gás"],
    ["", "não tem gás", "gás"],
    ["", "sheiro de gaz", null],
    ["", "Garagem alagada", null],
  ])("matches %j and %j as %j", (where, report, term) => {
    expect(detectRisk(where, report)).toEqual(
      term === null ? { hasRisk: false, term: null } : { hasRisk: true, term },
    );
  });

  test("returns canonical accented terms and remains deterministic across repeated calls", () => {
    for (let index = 0; index < 3; index += 1) {
      expect(detectRisk("", "EXPLOSA\u0303O")).toEqual({
        hasRisk: true,
        term: "explosão",
      });
      expect(detectRisk("", "sem problema")).toEqual({
        hasRisk: false,
        term: null,
      });
    }
  });
});
