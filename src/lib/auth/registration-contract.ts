import type { SignupFormValues } from "./signup-validation";

export const registrationContractStatus = "integrated-ORI-47";

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
    | "already-registered"
    | "rate-limited"
    | "invalid-code"
    | "expired-code"
    | "attempt-limit"
    | "missing-registration";
};
export type ProposedSignupResult =
  | {
      ok: true;
      registrationId: string;
      email: string;
    }
  | ProposedRegistrationFailure;
export type ProposedConfirmationResult =
  { ok: true } | ProposedRegistrationFailure;
export type ProposedResendResult = { ok: true } | ProposedRegistrationFailure;
