// Configuração do provedor de IA (card: Integração com a IA — provedor).
//
// Trocável por IA_PROVIDER (groq | gemini). Todos os provedores usam API
// compatível com OpenAI, então o cliente (ia.ts) não muda — só a URL, a chave
// e o modelo default. Para comparar/trocar, basta a variável + a chave.
//
// Segurança (RNF): as chaves ficam SÓ no backend (sem prefixo NEXT_PUBLIC_),
// então o Next nunca as envia para o navegador.

import "server-only";

export type Provider = "groq" | "gemini";

export type IaConfig = {
  provider: Provider;
  apiKey: string;
  model: string;
  baseUrl: string;
  timeoutMs: number;
};

type Preset = { baseUrl: string; apiKeyEnv: string; defaultModel: string };

const PRESETS: Record<Provider, Preset> = {
  groq: {
    baseUrl: "https://api.groq.com/openai/v1",
    apiKeyEnv: "GROQ_API_KEY",
    defaultModel: "openai/gpt-oss-120b",
  },
  gemini: {
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    apiKeyEnv: "GEMINI_API_KEY",
    defaultModel: "gemini-flash-lite-latest",
  },
};

const DEFAULT_TIMEOUT_MS = 8000;

function lerProvider(): Provider {
  const raw = (process.env.IA_PROVIDER ?? "gemini").toLowerCase();
  if (raw === "groq" || raw === "gemini") {
    return raw;
  }
  throw new Error(`IA_PROVIDER inválido: ${raw}. Use "groq" ou "gemini".`);
}

export function getIaConfig(): IaConfig {
  const provider = lerProvider();
  const preset = PRESETS[provider];
  const apiKey = process.env[preset.apiKeyEnv];

  if (!apiKey) {
    throw new Error(
      `Defina ${preset.apiKeyEnv} no .env.local para habilitar a sugestão por IA (provedor ${provider}).`,
    );
  }

  const baseUrl = process.env.IA_BASE_URL ?? preset.baseUrl;
  const parsed = new URL(baseUrl);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("IA_BASE_URL precisa ser uma URL HTTP ou HTTPS.");
  }

  const timeout = Number(process.env.IA_TIMEOUT_MS);

  return {
    provider,
    apiKey,
    model: process.env.IA_MODEL ?? preset.defaultModel,
    baseUrl,
    timeoutMs:
      Number.isFinite(timeout) && timeout > 0 ? timeout : DEFAULT_TIMEOUT_MS,
  };
}
