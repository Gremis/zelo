import type { Result } from "@/lib/first-steps/contract";

export type PanelUser = {
  name: string;
  initials: string;
  condominiumCount: number;
};

export type PanelOperations = {
  loadUser: () => Promise<Result<PanelUser>>;
  logout: () => Promise<Result<null>>;
};
