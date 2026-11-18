export type LoginPayload = {
  email: string;
  password: string;
  keepSignedIn: boolean;
};

export const submitLogin: (
  payload: LoginPayload,
) => Promise<void> = async () => {};

export const submitPasswordRecovery: (
  email: string,
) => Promise<void> = async () => {};

export {
  submitConfirmationCode,
  submitResendConfirmationCode,
} from "./registration-demo";
export type { ProposedConfirmationResult as ConfirmationCodeResult } from "./registration-demo";
