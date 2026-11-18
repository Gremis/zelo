import type {
  ProposedSignupInput,
  ProposedSignupResult,
  ProposedConfirmationInput,
  ProposedConfirmationResult,
  ProposedResendInput,
  ProposedResendResult,
} from "./registration-contract";

export type RegistrationMockScenario =
  | "standard"
  | "signup-failure"
  | "confirmation-failure"
  | "expired-code"
  | "resend-failure"
  | "attempt-limit";

let sequence = 0;
let registration: { id: string; email: string; attempts: number } | null = null;

function simulateLatency() {
  return new Promise<void>((resolve) => setTimeout(resolve, 650));
}

function findRegistration(input: ProposedResendInput) {
  const active = registration;
  return active?.id === input.registrationId &&
    active?.email === input.email.trim()
    ? active
    : null;
}

export async function submitSignup(
  input: ProposedSignupInput,
  scenario: RegistrationMockScenario = "standard",
): Promise<ProposedSignupResult> {
  const email = input.email.trim();
  await simulateLatency();
  if (scenario === "signup-failure") return { ok: false, error: "network" };
  registration = { id: `demo-registration-${++sequence}`, email, attempts: 0 };
  return { ok: true, registrationId: registration.id, email };
}

export async function submitConfirmationCode(
  input: ProposedConfirmationInput,
  scenario: RegistrationMockScenario = "standard",
): Promise<ProposedConfirmationResult> {
  await simulateLatency();
  const active = findRegistration(input);
  if (!active) return { ok: false, error: "missing-registration" };
  if (scenario === "confirmation-failure")
    return { ok: false, error: "network" };
  if (scenario === "attempt-limit" || active.attempts >= 3)
    return { ok: false, error: "attempt-limit" };
  if (scenario === "expired-code") return { ok: false, error: "expired-code" };
  if (input.code !== "123456") {
    active.attempts += 1;
    return {
      ok: false,
      error: active.attempts >= 3 ? "attempt-limit" : "invalid-code",
    };
  }
  return { ok: true };
}

export async function submitResendConfirmationCode(
  input: ProposedResendInput,
  scenario: RegistrationMockScenario = "standard",
): Promise<ProposedResendResult> {
  await simulateLatency();
  const active = findRegistration(input);
  if (!active) return { ok: false, error: "missing-registration" };
  if (scenario === "resend-failure") return { ok: false, error: "network" };
  if (scenario === "attempt-limit")
    return { ok: false, error: "attempt-limit" };
  active.attempts = 0;
  return { ok: true };
}
