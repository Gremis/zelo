// Cliente da IA (card: Chamar a IA, validar o JSON e cair nas regras se falhar).
//
// Chama a IA (API compatível com OpenAI), pede resposta em JSON, com tempo
// limite. Valida o formato antes de confiar: prioridade entre as três e
// categoria dentro da lista. Qualquer falha é devolvida como `ok: false` —
// quem chama (o orquestrador) cai nas regras.

import "server-only";
import { type IaConfig, getIaConfig } from "./ia.config";
import { montarPrompt } from "./prompt";
import {
  CATEGORIAS,
  type Categoria,
  PRIORIDADES,
  type Prioridade,
} from "./tipos";

export type SugestaoIa = {
  prioridade: Prioridade;
  categoria: Categoria;
  motivo: string;
};

// Motivo da falha, gravado em occurrences.ai_failure_reason para a métrica.
export type FalhaIa = "erro" | "timeout" | "formato";

export type ResultadoIa =
  { ok: true; sugestao: SugestaoIa } | { ok: false; falha: FalhaIa };

const MOTIVO_MAX = 300;

// Confere o JSON da IA. Aceita string (JSON cru) ou objeto já parseado.
export function validarResposta(conteudo: unknown): ResultadoIa {
  let dado: unknown = conteudo;
  if (typeof conteudo === "string") {
    try {
      dado = JSON.parse(conteudo);
    } catch {
      return { ok: false, falha: "formato" };
    }
  }

  if (typeof dado !== "object" || dado === null) {
    return { ok: false, falha: "formato" };
  }

  const { prioridade, categoria, motivo } = dado as Record<string, unknown>;
  const prioridadeOk =
    typeof prioridade === "string" &&
    (PRIORIDADES as readonly string[]).includes(prioridade);
  const categoriaOk =
    typeof categoria === "string" &&
    (CATEGORIAS as readonly string[]).includes(categoria);
  const motivoOk =
    typeof motivo === "string" &&
    motivo.trim() !== "" &&
    motivo.length <= MOTIVO_MAX;

  if (!prioridadeOk || !categoriaOk || !motivoOk) {
    return { ok: false, falha: "formato" };
  }

  return {
    ok: true,
    sugestao: {
      prioridade: prioridade as Prioridade,
      categoria: categoria as Categoria,
      motivo: (motivo as string).trim(),
    },
  };
}

export async function classificarComIa(
  onde: string,
  relato: string,
): Promise<ResultadoIa> {
  let config: IaConfig;
  try {
    config = getIaConfig();
  } catch {
    return { ok: false, falha: "erro" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const res = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [{ role: "user", content: montarPrompt(onde, relato) }],
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      return { ok: false, falha: "erro" };
    }

    const payload = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const conteudo = payload.choices?.[0]?.message?.content;
    if (typeof conteudo !== "string") {
      return { ok: false, falha: "formato" };
    }

    return validarResposta(conteudo);
  } catch (erro) {
    const nome = erro instanceof Error ? erro.name : "";
    return { ok: false, falha: nome === "AbortError" ? "timeout" : "erro" };
  } finally {
    clearTimeout(timer);
  }
}
