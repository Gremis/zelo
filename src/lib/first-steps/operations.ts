import { loadPanel } from "@/lib/panel/request";
import type { FirstStepsOperations } from "./contract";

export function isFirstStepsMockEnabled() {
  return (
    (process.env.NEXT_PUBLIC_APP_ENV === "local" ||
      process.env.NEXT_PUBLIC_APP_ENV === "development") &&
    process.env.NEXT_PUBLIC_FIRST_STEPS_MOCK === "enabled"
  );
}

export function createFirstStepsOperations(): FirstStepsOperations {
  return {
    load: async () => {
      const result = await loadPanel();
      return result.ok ? { ok: true, data: result.data.firstSteps } : result;
    },
    dismiss: async () => {
      try {
        const response = await fetch("/api/panel/first-steps/dismiss", {
          method: "POST",
          credentials: "same-origin",
          cache: "no-store",
        });
        const result: unknown = await response.json();
        if (
          !response.ok ||
          !result ||
          typeof result !== "object" ||
          !("dismissed" in result) ||
          result.dismissed !== true
        )
          return { ok: false, error: "unavailable" };
        return { ok: true, data: { dismissed: true } };
      } catch {
        return { ok: false, error: "network" };
      }
    },
  };
}
