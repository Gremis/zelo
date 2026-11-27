// Orquestrador da sugestão (ORI-83). Decide a prioridade juntando regras + IA:
//
//   1. Tem palavra de risco  -> Urgente, motivo da regra. Vale por cima da IA.
//   2. Sem palavra, IA ok     -> vale a sugestão da IA.
//   3. Sem palavra, IA falhou -> Normal, "Sem sinal de risco no relato." (regra).
//
// Nunca lança: se a IA falha, cai nas regras. A ocorrência sempre tem sugestão.
// A saída já usa os enums do banco (occurrences.suggested_priority/source).

import "server-only";
import { detectRisk } from "@/lib/occurrences/risk-rules";
import { type FalhaIa, type ResultadoIa, classificarComIa } from "./ia";
import {
  type Categoria,
  type Origem,
  PRIORIDADE_DB,
  type PrioridadeDb,
} from "./tipos";

// Motivo fixo da regra quando não há sinal de risco (contrato do banco).
export const MOTIVO_SEM_RISCO = "Sem sinal de risco no relato.";

export type Sugestao = {
  prioridade: PrioridadeDb;
  categoria: Categoria | null;
  motivo: string;
  origem: Origem;
  // Preenchido só quando a IA falhou (occurrences.ai_failure_reason).
  falhaIa: FalhaIa | null;
};

type Deps = {
  ia: (onde: string, relato: string) => Promise<ResultadoIa>;
};

export async function classificar(
  onde: string,
  relato: string,
  deps: Deps = { ia: classificarComIa },
): Promise<Sugestao> {
  // Usa o motor de regras da ORI-94 (fonte única dos termos de risco).
  const risco = detectRisk(onde, relato);
  const ia = await deps.ia(onde, relato);

  // Regra 1: palavra de risco vale por cima da IA -> sempre Urgente.
  if (risco.hasRisk) {
    return {
      prioridade: "urgent",
      categoria: ia.ok ? ia.sugestao.categoria : null,
      motivo: `Menciona ${risco.term}: risco à segurança.`,
      origem: "rules",
      falhaIa: ia.ok ? null : ia.falha,
    };
  }

  // Regra 2: sem palavra de risco e IA ok -> vale a IA.
  if (ia.ok) {
    return {
      prioridade: PRIORIDADE_DB[ia.sugestao.prioridade],
      categoria: ia.sugestao.categoria,
      motivo: ia.sugestao.motivo,
      origem: "ai",
      falhaIa: null,
    };
  }

  // Regra 3: sem palavra de risco e IA falhou -> cai nas regras (Normal).
  return {
    prioridade: "normal",
    categoria: null,
    motivo: MOTIVO_SEM_RISCO,
    origem: "rules",
    falhaIa: ia.falha,
  };
}
