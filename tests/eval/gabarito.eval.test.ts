import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { classificar } from "@/server/classificacao/classificar";
import { classificarComIa } from "@/server/classificacao/ia";
import { PRIORIDADE_DB, type Prioridade } from "@/server/classificacao/tipos";

// Carrega GROQ_API_KEY do .env.local (vitest não lê sozinho).
function carregarEnvLocal() {
  try {
    const txt = readFileSync(
      new URL("../../.env.local", import.meta.url),
      "utf8",
    );
    for (const linha of txt.split("\n")) {
      const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    // sem .env.local: segue com o que já estiver no ambiente
  }
}
carregarEnvLocal();

type Caso = {
  id: string;
  onde: string;
  relato: string;
  prioridade: Prioridade;
  categoria: string;
};

const GABARITO: Caso[] = JSON.parse(
  readFileSync(new URL("./gabarito.json", import.meta.url), "utf8"),
);

const RUNS = Number(process.env.EVAL_RUNS) || 1;
// Ritmo entre chamadas para respeitar o limite de 8000 tokens/min do plano
// grátis (cada chamada ~1.1k tokens). Não afeta produção (1 ocorrência = 1 chamada).
const DELAY_MS = Number(process.env.EVAL_DELAY_MS) || 10_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Tenta de novo em falha transitória (rate limit), esperando o bucket refazer.
async function iaComRetry(onde: string, relato: string) {
  for (let t = 0; t < 2; t += 1) {
    const ia = await classificarComIa(onde, relato);
    if (ia.ok) return ia;
    await sleep(12_000);
  }
  return classificarComIa(onde, relato);
}

type Metricas = {
  urgentesPegos: number;
  prioridadeCerta: number;
  categoriaCerta: number;
  jsonValido: number;
  total: number;
  urgentesTotal: number;
  erros: string[];
};

async function rodada(): Promise<Metricas> {
  const m: Metricas = {
    urgentesPegos: 0,
    prioridadeCerta: 0,
    categoriaCerta: 0,
    jsonValido: 0,
    total: GABARITO.length,
    urgentesTotal: 0,
    erros: [],
  };

  for (const caso of GABARITO) {
    const ia = await iaComRetry(caso.onde, caso.relato);
    const final = await classificar(caso.onde, caso.relato, {
      ia: () => Promise.resolve(ia),
    });
    await sleep(DELAY_MS);

    const esperada = PRIORIDADE_DB[caso.prioridade];
    if (ia.ok) m.jsonValido += 1;
    if (final.prioridade === esperada) m.prioridadeCerta += 1;
    else
      m.erros.push(`${caso.id} prioridade: ${final.prioridade} ≠ ${esperada}`);
    if (final.categoria === caso.categoria) m.categoriaCerta += 1;

    if (caso.prioridade === "Urgente") {
      m.urgentesTotal += 1;
      if (final.prioridade === "urgent") m.urgentesPegos += 1;
      else m.erros.push(`${caso.id} URGENTE escapou!`);
    }
  }

  return m;
}

const pct = (n: number, total: number) => Math.round((n / total) * 100);

describe("eval do gabarito (ORI-85)", () => {
  const temChave = Boolean(
    process.env.GROQ_API_KEY || process.env.GEMINI_API_KEY,
  );

  it.runIf(temChave)(
    "classifica os 50 relatos dentro dos critérios da PM",
    async () => {
      let pior: Metricas | null = null;

      for (let i = 0; i < RUNS; i += 1) {
        const m = await rodada();
        const urg = pct(m.urgentesPegos, m.urgentesTotal);
        const pri = pct(m.prioridadeCerta, m.total);
        const cat = pct(m.categoriaCerta, m.total);
        const json = pct(m.jsonValido, m.total);
        console.log(
          `rodada ${i + 1}: urgentes ${urg}% | prioridade ${pri}% | categoria ${cat}% | JSON ${json}%` +
            (m.erros.length ? `\n  ${m.erros.join("\n  ")}` : ""),
        );
        if (
          !pior ||
          pct(m.prioridadeCerta, m.total) <
            pct(pior.prioridadeCerta, pior.total)
        ) {
          pior = m;
        }
      }

      // Grava o resumo num arquivo (à prova do vitest, que esconde console.log
      // quando a saída vai para arquivo). Antes dos expects, para registrar
      // mesmo se reprovar.
      if (process.env.EVAL_OUT) {
        writeFileSync(
          process.env.EVAL_OUT,
          JSON.stringify(
            {
              provider: process.env.IA_PROVIDER ?? "groq",
              urgentes: pct(pior!.urgentesPegos, pior!.urgentesTotal),
              prioridade: pct(pior!.prioridadeCerta, pior!.total),
              categoria: pct(pior!.categoriaCerta, pior!.total),
              json: pct(pior!.jsonValido, pior!.total),
              erros: pior!.erros,
            },
            null,
            2,
          ),
        );
      }

      // Critérios de aceite da PM (vale a pior rodada):
      // urgentes pegos ≥95%, prioridade certa ≥80%, JSON válido 100%.
      expect(
        pct(pior!.urgentesPegos, pior!.urgentesTotal),
      ).toBeGreaterThanOrEqual(95);
      expect(pct(pior!.prioridadeCerta, pior!.total)).toBeGreaterThanOrEqual(
        80,
      );
      expect(pct(pior!.jsonValido, pior!.total)).toBe(100);
    },
  );

  it.skipIf(temChave)("pulado: defina GROQ_API_KEY para rodar o eval", () => {
    expect(true).toBe(true);
  });
});
