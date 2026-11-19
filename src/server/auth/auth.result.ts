export type AuthErrorCode =
  | "invalid_body"
  | "invalid_input"
  | "invalid_credentials"
  | "rate_limited"
  | "email_already_registered"
  | "invalid_recovery_code"
  | "update_failed"
  | "unknown";

export type AuthError = {
  code: AuthErrorCode;
  message: string;
  details?: Record<string, string>;
};

export type Result<T> = { ok: true; data: T } | { ok: false; error: AuthError };

export function success<T>(data: T): Result<T> {
  return { ok: true, data };
}

export function failure(error: AuthError): Result<never> {
  return { ok: false, error };
}
