export type LoginPayload = {
  email: string;
  password: string;
  keepSignedIn: boolean;
};

export type ConfirmationCodeResult =
  { ok: true } | { ok: false; error: "invalid-code" | "expired-code" };

export const submitLogin: (
  payload: LoginPayload,
) => Promise<void> = async () => {};

export const submitPasswordRecovery: (
  email: string,
) => Promise<void> = async () => {};

export const submitResendConfirmationCode: () => Promise<void> = async () => {};

export const submitConfirmationCode: (
  code: string,
) => Promise<ConfirmationCodeResult> = async () => ({ ok: true });
