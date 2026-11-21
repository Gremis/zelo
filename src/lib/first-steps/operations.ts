import type { FirstStepsOperations } from "./contract";
import { createFirstStepsMock } from "./mock";

export function isFirstStepsMockEnabled() {
  return (
    (process.env.NEXT_PUBLIC_APP_ENV === "local" ||
      process.env.NEXT_PUBLIC_APP_ENV === "development") &&
    process.env.NEXT_PUBLIC_FIRST_STEPS_MOCK === "enabled"
  );
}

export function createFirstStepsOperations(): FirstStepsOperations {
  if (isFirstStepsMockEnabled()) return createFirstStepsMock();
  return {
    load: async () => ({ ok: false, error: "unavailable" }),
    dismiss: async () => ({ ok: false, error: "unavailable" }),
  };
}
