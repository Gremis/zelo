import type {
  ManagerCondominium,
  ManagerOccurrenceOperations,
  ManagerRegistrationResult,
} from "./contract";
import { toRequestBody } from "./validation";
import { TRACKING_CODE_PATTERN } from "./tracking-link";

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function createManagerOccurrenceOperations(): ManagerOccurrenceOperations {
  return {
    async loadCondominiums(signal) {
      try {
        const response = await fetch("/api/condominiums", {
          cache: "no-store",
          credentials: "same-origin",
          signal: signal
            ? AbortSignal.any([signal, AbortSignal.timeout(15000)])
            : AbortSignal.timeout(15000),
        });
        if (response.status === 401)
          return { ok: false, error: "unauthorized" };
        const data: unknown = await response.json();
        if (!response.ok || !record(data) || !Array.isArray(data.condominiums))
          return { ok: false, error: "unavailable" };
        const list: ManagerCondominium[] = [];
        for (const item of data.condominiums) {
          if (
            record(item) &&
            typeof item.id === "string" &&
            typeof item.name === "string"
          )
            list.push({ id: item.id, name: item.name });
        }
        return { ok: true, data: list };
      } catch {
        return { ok: false, error: "unavailable" };
      }
    },
    async register(fields): Promise<ManagerRegistrationResult> {
      try {
        const response = await fetch("/api/occurrences", {
          method: "POST",
          credentials: "same-origin",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(toRequestBody(fields)),
          signal: AbortSignal.timeout(20000),
        });
        if (response.status === 401)
          return { ok: false, error: "unauthorized" };
        if (response.status === 404) return { ok: false, error: "not_found" };
        const data: unknown = await response.json();
        // A rota devolve {error} genérico no 400; o cliente já valida antes,
        // então aqui é só um fallback sem detalhe por campo.
        if (response.status === 400)
          return { ok: false, error: "invalid_input", fields: {} };
        if (
          !response.ok ||
          !record(data) ||
          Object.keys(data).length !== 2 ||
          !Number.isSafeInteger(data.number) ||
          (data.number as number) <= 0 ||
          typeof data.trackingCode !== "string" ||
          !TRACKING_CODE_PATTERN.test(data.trackingCode)
        )
          return { ok: false, error: "uncertain" };
        return {
          ok: true,
          number: data.number as number,
          trackingCode: data.trackingCode,
        };
      } catch {
        return { ok: false, error: "uncertain" };
      }
    },
  };
}
