import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Config separado para o eval do gabarito (ORI-85). Bate na rede (Groq), então
// fica fora do `npm test`. Rode com: npm run eval:classificacao
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["tests/eval/**/*.eval.test.ts"],
    testTimeout: 900_000,
  },
});
