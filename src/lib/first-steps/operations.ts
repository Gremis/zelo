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
      const result = await loadPanel();
      return result.ok
        ? { ok: true, data: { ...result.data.firstSteps, dismissed: true } }
        : result;
    },
  };
}
