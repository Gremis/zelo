import * as mock from "./registration-demo";
import type {
  ProposedSignupInput,
  ProposedSignupResult,
  ProposedConfirmationInput,
  ProposedConfirmationResult,
  ProposedResendInput,
  ProposedResendResult,
} from "./registration-contract";

export { registrationContractStatus } from "./registration-contract";
export type * from "./registration-contract";

export function isRegistrationDemoEnabled() {
  return (
    (process.env.NEXT_PUBLIC_APP_ENV === "local" ||
      process.env.NEXT_PUBLIC_APP_ENV === "development") &&
    process.env.NEXT_PUBLIC_REGISTRATION_DEMO === "enabled"
  );
}

function configuredScenario(): mock.RegistrationMockScenario {
  const scenario = process.env.NEXT_PUBLIC_REGISTRATION_DEMO_SCENARIO;
  switch (scenario) {
    case "signup-failure":
    case "confirmation-failure":
    case "expired-code":
    case "resend-failure":
    case "attempt-limit":
      return scenario;
    default:
      return "standard";
  }
}

export async function submitSignup(
  input: ProposedSignupInput,
): Promise<ProposedSignupResult> {
  if (isRegistrationDemoEnabled())
    return mock.submitSignup(input, configuredScenario());
  const result = await request("signup", input);
  if (!result.ok) return result;
  if (
    typeof result.data.registrationId !== "string" ||
    typeof result.data.email !== "string"
  )
    return { ok: false, error: "network" };
  return {
    ok: true,
    registrationId: result.data.registrationId,
    email: result.data.email,
  };
}

export async function submitConfirmationCode(
  input: ProposedConfirmationInput,
): Promise<ProposedConfirmationResult> {
  if (isRegistrationDemoEnabled())
    return mock.submitConfirmationCode(input, configuredScenario());
  const result = await request("confirm-signup", input);
  return result.ok && result.data.success === true
    ? { ok: true }
    : result.ok
      ? { ok: false, error: "network" }
      : result;
}

export async function submitResendConfirmationCode(
  input: ProposedResendInput,
): Promise<ProposedResendResult> {
  if (isRegistrationDemoEnabled())
    return mock.submitResendConfirmationCode(input, configuredScenario());
  const result = await request("resend-signup", input);
  return result.ok && result.data.success === true
    ? { ok: true }
    : result.ok
      ? { ok: false, error: "network" }
      : result;
}

async function request(
  operation: string,
  input: unknown,
): Promise<
  | { ok: true; data: Record<string, unknown> }
  | import("./registration-contract").ProposedRegistrationFailure
> {
  try {
    const response = await fetch(`/api/auth/${operation}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      cache: "no-store",
      body: JSON.stringify(input),
    });
    const data: unknown = await response.json();
    if (typeof data !== "object" || data === null)
      return { ok: false, error: "network" };
    if (response.ok) return { ok: true, data: data as Record<string, unknown> };
    const code = "code" in data ? data.code : undefined;
    return {
      ok: false,
      error:
        code === "email_already_registered"
          ? "already-registered"
          : code === "invalid_confirmation_code"
            ? "invalid-code"
            : code === "confirmation_expired"
              ? "expired-code"
              : code === "confirmation_blocked"
                ? "attempt-limit"
                : code === "rate_limited"
                  ? "rate-limited"
                  : "network",
    };
  } catch {
    return { ok: false, error: "network" };
  }
}
