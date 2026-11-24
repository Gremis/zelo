import { authPost } from "./request";
export type LoginPayload = {
  email: string;
  password: string;
  keepSignedIn: boolean;
};

export const submitLogin = (payload: LoginPayload) =>
  authPost("/api/auth/login", payload);

export const submitPasswordRecovery = (email: string) =>
  authPost("/api/auth/forgot-password", { email });

export const submitNewPassword = (payload: {
  email: string;
  code: string;
  password: string;
}) => authPost("/api/auth/reset-password", payload);

export {
  submitConfirmationCode,
  submitResendConfirmationCode,
} from "./registration";
export type { ProposedConfirmationResult as ConfirmationCodeResult } from "./registration";
