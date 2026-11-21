import { isFirstStepsMockEnabled } from "@/lib/first-steps/operations";
import type { PanelOperations } from "./contract";
import { createPanelMock } from "./mock";

export function createPanelOperations(): PanelOperations {
  if (isFirstStepsMockEnabled()) return createPanelMock();
  return {
    loadUser: async () => ({ ok: false, error: "unavailable" }),
    logout: async () => ({ ok: false, error: "unavailable" }),
  };
}
