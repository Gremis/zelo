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
  if (!isRegistrationDemoEnabled())
    throw new Error("Signup integration is not available.");
  return mock.submitSignup(input, configuredScenario());
}

export async function submitConfirmationCode(
  input: ProposedConfirmationInput,
): Promise<ProposedConfirmationResult> {
  if (!isRegistrationDemoEnabled())
    throw new Error("Email confirmation integration is not available.");
  return mock.submitConfirmationCode(input, configuredScenario());
}

export async function submitResendConfirmationCode(
  input: ProposedResendInput,
): Promise<ProposedResendResult> {
  if (!isRegistrationDemoEnabled())
    throw new Error("Confirmation resend integration is not available.");
  return mock.submitResendConfirmationCode(input, configuredScenario());
}
