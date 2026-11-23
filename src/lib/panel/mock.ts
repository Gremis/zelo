import type { PanelOperations, PanelUser } from "./contract";

export function createPanelMock(
  initial: PanelUser = {
    name: "Alex Exemplo",
    initials: "AE",
    condominiumCount: 0,
  },
  failure: "load" | "logout" | null = null,
): PanelOperations {
  let user: PanelUser | null = { ...initial };
  const delay = () => new Promise<void>((resolve) => setTimeout(resolve, 350));
  return {
    async loadUser() {
      await delay();
      if (failure === "load" || !user) return { ok: false, error: "network" };
      return { ok: true, data: { ...user } };
    },
    async logout() {
      await delay();
      if (failure === "logout") return { ok: false, error: "network" };
      user = null;
      return { ok: true, data: null };
    },
  };
}
