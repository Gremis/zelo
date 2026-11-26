import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getIaConfig } from "@/server/classificacao/ia.config";

const KEYS = [
  "IA_PROVIDER",
  "IA_MODEL",
  "IA_BASE_URL",
  "IA_TIMEOUT_MS",
  "GROQ_API_KEY",
  "GEMINI_API_KEY",
];
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const key of KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = saved[key];
    }
  }
});

describe("getIaConfig", () => {
  it("usa Gemini por padrão e lança quando falta a chave", () => {
    expect(() => getIaConfig()).toThrow(/GEMINI_API_KEY/);
  });

  it("usa os defaults do Gemini quando só a chave está definida", () => {
    process.env.GEMINI_API_KEY = "gem-key";

    const config = getIaConfig();

    expect(config.provider).toBe("gemini");
    expect(config.apiKey).toBe("gem-key");
    expect(config.model).toBe("gemini-flash-lite-latest");
    expect(config.baseUrl).toContain("generativelanguage.googleapis.com");
    expect(config.timeoutMs).toBe(8000);
  });

  it("troca para o Groq com IA_PROVIDER=groq", () => {
    process.env.IA_PROVIDER = "groq";
    process.env.GROQ_API_KEY = "groq-key";

    const config = getIaConfig();

    expect(config.provider).toBe("groq");
    expect(config.model).toBe("openai/gpt-oss-120b");
    expect(config.baseUrl).toBe("https://api.groq.com/openai/v1");
  });

  it("exige a chave do provedor escolhido", () => {
    process.env.IA_PROVIDER = "groq";

    expect(() => getIaConfig()).toThrow(/GROQ_API_KEY/);
  });

  it("rejeita um provedor desconhecido", () => {
    process.env.IA_PROVIDER = "openai";
    process.env.GEMINI_API_KEY = "x";

    expect(() => getIaConfig()).toThrow(/IA_PROVIDER/);
  });

  it("respeita overrides de modelo e timeout", () => {
    process.env.GEMINI_API_KEY = "gem-key";
    process.env.IA_MODEL = "outro-modelo";
    process.env.IA_TIMEOUT_MS = "3000";

    const config = getIaConfig();

    expect(config.model).toBe("outro-modelo");
    expect(config.timeoutMs).toBe(3000);
  });

  it("rejeita base URL inválida", () => {
    process.env.GEMINI_API_KEY = "gem-key";
    process.env.IA_BASE_URL = "not-a-url";

    expect(() => getIaConfig()).toThrow();
  });
});
