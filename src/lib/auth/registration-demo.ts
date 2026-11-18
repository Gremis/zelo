import type { SignupFormValues } from "./signup";

export const registrationContractStatus = "proposed-pending-ORI-22-and-ORI-47";

export const registrationDemoScenarios = [
  { value: "standard", label: "Fluxo normal" },
  { value: "signup-failure", label: "Falha no cadastro" },
  { value: "confirmation-failure", label: "Falha na confirmação" },
  { value: "expired-code", label: "Código expirado" },
  { value: "resend-failure", label: "Falha no reenvio" },
  { value: "attempt-limit", label: "Limite de tentativas" },
] as const;

export type RegistrationDemoScenario =
  (typeof registrationDemoScenarios)[number]["value"];
export type ProposedSignupInput = SignupFormValues;
export type ProposedConfirmationInput = {
  registrationId: string;
  email: string;
  code: string;
};
export type ProposedResendInput = Omit<ProposedConfirmationInput, "code">;
export type ProposedRegistrationFailure = {
  ok: false;
  error:
    | "network"
    | "invalid-code"
    | "expired-code"
    | "attempt-limit"
    | "missing-registration";
};
export type ProposedSignupResult =
  | {
      ok: true;
      simulated: true;
      registrationId: string;
      email: string;
    }
  | ProposedRegistrationFailure;
export type ProposedConfirmationResult =
  { ok: true; simulated: true } | ProposedRegistrationFailure;
export type ProposedResendResult =
  { ok: true; simulated: true } | ProposedRegistrationFailure;

let sequence = 0;
let registration: { id: string; email: string; attempts: number } | null = null;

export function isRegistrationDemoEnabled() {
  return (
    (process.env.NODE_ENV === "development" ||
      process.env.NODE_ENV === "test") &&
    process.env.NEXT_PUBLIC_REGISTRATION_DEMO === "enabled"
  );
}

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
  scenario: RegistrationDemoScenario = "standard",
): Promise<ProposedSignupResult> {
  if (!isRegistrationDemoEnabled())
    throw new Error("Signup integration is not available.");
  const email = input.email.trim();
  await simulateLatency();
  if (scenario === "signup-failure") return { ok: false, error: "network" };
  registration = { id: `demo-registration-${++sequence}`, email, attempts: 0 };
  return { ok: true, simulated: true, registrationId: registration.id, email };
}

export async function submitConfirmationCode(
  input: ProposedConfirmationInput,
  scenario: RegistrationDemoScenario = "standard",
): Promise<ProposedConfirmationResult> {
  if (!isRegistrationDemoEnabled())
    throw new Error("Email confirmation integration is not available.");
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
  return { ok: true, simulated: true };
}

export async function submitResendConfirmationCode(
  input: ProposedResendInput,
  scenario: RegistrationDemoScenario = "standard",
): Promise<ProposedResendResult> {
  if (!isRegistrationDemoEnabled())
    throw new Error("Confirmation resend integration is not available.");
  await simulateLatency();
  const active = findRegistration(input);
  if (!active) return { ok: false, error: "missing-registration" };
  if (scenario === "resend-failure") return { ok: false, error: "network" };
  if (scenario === "attempt-limit")
    return { ok: false, error: "attempt-limit" };
  active.attempts = 0;
  return { ok: true, simulated: true };
}
