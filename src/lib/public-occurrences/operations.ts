import type {
  PublicOccurrenceOperations,
  RegistrationErrors,
  RegistrationResult,
} from "./contract";
import { TRACKING_CODE_PATTERN } from "@/lib/occurrences/tracking-link";
import { registrationFields } from "./validation";

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function createPublicOccurrenceOperations(): PublicOccurrenceOperations {
  const endpoint = (slug: string) =>
    `/api/public/condominiums/${encodeURIComponent(slug)}`;
  return {
    async load(slug, signal) {
      try {
        const response = await fetch(endpoint(slug), {
          cache: "no-store",
          credentials: "omit",
          signal: signal
            ? AbortSignal.any([signal, AbortSignal.timeout(15000)])
            : AbortSignal.timeout(15000),
        });
        if (response.status === 404) return { ok: false, error: "not_found" };
        const data: unknown = await response.json();
        if (
          !response.ok ||
          !record(data) ||
          typeof data.name !== "string" ||
          !data.name.trim() ||
          typeof data.address !== "string" ||
          !data.address.trim()
        )
          return { ok: false, error: "unavailable" };
        return { ok: true, data: { name: data.name, address: data.address } };
      } catch {
        return { ok: false, error: "unavailable" };
      }
    },
    async register(slug, attempt): Promise<RegistrationResult> {
      try {
        const response = await fetch(`${endpoint(slug)}/occurrences`, {
          method: "POST",
          credentials: "omit",
          cache: "no-store",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": attempt.key,
          },
          body: JSON.stringify(attempt.fields),
          signal: AbortSignal.timeout(20000),
        });
        if (response.status === 409) return { ok: false, error: "conflict" };
        if (response.status === 404) return { ok: false, error: "not_found" };
        const data: unknown = await response.json();
        if (response.status === 400) {
          const fields: RegistrationErrors = {};
          if (record(data) && record(data.fields)) {
            for (const field of registrationFields) {
              const message = data.fields[field.name];
              if (
                typeof message === "string" &&
                message.trim() &&
                message.length <= 300
              )
                fields[field.name] = message;
            }
          }
          return { ok: false, error: "invalid_input", fields };
        }
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
