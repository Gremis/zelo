export type LoginPayload = {
  email: string;
  password: string;
  keepSignedIn: boolean;
};

export const submitLogin: (payload: LoginPayload) => Promise<void> = async (
  payload,
) => {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error("Login failed.");
};

export const submitPasswordRecovery: (
  email: string,
) => Promise<void> = async () => {};

export {
  submitConfirmationCode,
  submitResendConfirmationCode,
} from "./registration";
export type { ProposedConfirmationResult as ConfirmationCodeResult } from "./registration";
