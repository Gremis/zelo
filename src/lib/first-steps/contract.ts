export type StepId = "condominium" | "employees" | "resident-link";

export type FirstSteps = {
  completed: StepId[];
  dismissed: boolean;
};

export type Result<T> =
  { ok: true; data: T } | { ok: false; error: "unavailable" | "network" };

export type FirstStepsOperations = {
  load: () => Promise<Result<FirstSteps>>;
  dismiss: () => Promise<Result<{ dismissed: boolean }>>;
};
