import type { PanelUser } from "./contract";
import type { FirstSteps, Result } from "@/lib/first-steps/contract";

export async function loadPanel(
  signal?: AbortSignal,
): Promise<Result<{ user: PanelUser; firstSteps: FirstSteps }>> {
  try {
    const response = await fetch("/api/panel", {
      cache: "no-store",
      credentials: "same-origin",
      signal,
    });
    if (!response.ok) return { ok: false, error: "unavailable" };
    const data = await response.json();
    return { ok: true, data };
  } catch {
    return { ok: false, error: "network" };
  }
}
