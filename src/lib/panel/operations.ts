import type { PanelOperations } from "./contract";
import { loadPanel } from "./request";

export function createPanelOperations(): PanelOperations {
  return {
    loadUser: async () => {
      const result = await loadPanel();
      return result.ok ? { ok: true, data: result.data.user } : result;
    },
    logout: async () => {
      try {
        const response = await fetch("/api/auth/logout", {
          method: "POST",
          credentials: "same-origin",
          cache: "no-store",
        });
        return response.ok
          ? { ok: true, data: null }
          : { ok: false, error: "unavailable" };
      } catch {
        return { ok: false, error: "network" };
      }
    },
  };
}
