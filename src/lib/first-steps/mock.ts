import type { FirstSteps, FirstStepsOperations, Result } from "./contract";

export function createFirstStepsMock(
  initial: FirstSteps = { completed: [], dismissed: false },
  failure: "load" | "dismiss" | null = null,
): FirstStepsOperations {
  let state = { ...initial, completed: [...initial.completed] };
  async function respond(
    operation: "load" | "dismiss",
  ): Promise<Result<FirstSteps>> {
    await new Promise<void>((resolve) => setTimeout(resolve, 350));
    if (operation === failure) return { ok: false, error: "network" };
    if (operation === "dismiss") state = { ...state, dismissed: true };
    return {
      ok: true,
      data: { ...state, completed: [...state.completed] },
    };
  }
  return { load: () => respond("load"), dismiss: () => respond("dismiss") };
}
