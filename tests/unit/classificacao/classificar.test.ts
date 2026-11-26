import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  MOTIVO_SEM_RISCO,
  classificar,
} from "@/server/classificacao/classificar";
import type { ResultadoIa } from "@/server/classificacao/ia";

const iaResponde = (r: ResultadoIa) => () => Promise.resolve(r);

describe("classificar — decisão da sugestão (ORI-83)", () => {
  it("palavra de risco prevalece sobre a IA (BDD: cheiro de gás)", async () => {
    const ia = iaResponde({
      ok: true,
      sugestao: { prioridade: "Normal", categoria: "Gás", motivo: "leve" },
    });

    const s = await classificar(
      "Churrasqueira",
      "Cheiro leve de gás perto da churrasqueira",
      { ia },
    );

    expect(s.prioridade).toBe("urgent");
    expect(s.motivo).toBe("Menciona gás: risco à segurança.");
    expect(s.origem).toBe("rules");
    // mantém a categoria que a IA leu
    expect(s.categoria).toBe("Gás");
  });

  it("sem palavra de risco, usa a sugestão da IA (origem ai)", async () => {
    const ia = iaResponde({
      ok: true,
      sugestao: {
        prioridade: "Baixa",
        categoria: "Barulho e convivência",
        motivo: "Som alto, sem risco.",
      },
    });

    const s = await classificar("Apto 303", "Vizinho com som alto", { ia });

    expect(s).toEqual({
      prioridade: "low",
      categoria: "Barulho e convivência",
      motivo: "Som alto, sem risco.",
      origem: "ai",
      falhaIa: null,
    });
  });

  it("IA fora do ar e sem risco: cai nas regras (Normal)", async () => {
    const ia = iaResponde({ ok: false, falha: "timeout" });

    const s = await classificar("Hall", "Interfone não toca", { ia });

    expect(s).toEqual({
      prioridade: "normal",
      categoria: null,
      motivo: MOTIVO_SEM_RISCO,
      origem: "rules",
      falhaIa: "timeout",
    });
  });

  it("palavra de risco com IA fora do ar: Urgente pela regra, sem categoria", async () => {
    const ia = iaResponde({ ok: false, falha: "erro" });

    const s = await classificar("Garagem", "Cano estourou e está alagando", {
      ia,
    });

    expect(s.prioridade).toBe("urgent");
    expect(s.origem).toBe("rules");
    expect(s.categoria).toBeNull();
    expect(s.falhaIa).toBe("erro");
  });
});
