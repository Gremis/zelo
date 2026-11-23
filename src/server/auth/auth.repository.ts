import type { AuthError, SupabaseClient, User } from "@supabase/supabase-js";

export type AuthUser = { id: string | null; email: string | null };

export type SignUpParams = {
  fullName: string;
  email: string;
  password: string;
  phone: string;
};
export type SignInParams = { email: string; password: string };
export type EmailCodeParams = { email: string; code: string };

export type SignUpOutcome =
  | { status: "created"; user: AuthUser }
  | { status: "duplicate" }
  | { status: "error"; reason?: "rate_limited" };

export type SignInErrorReason =
  "invalid_credentials" | "rate_limited" | "unknown";

export type SignInOutcome =
  | { status: "ok"; user: AuthUser }
  | { status: "error"; reason: SignInErrorReason };

export type VerifyRecoveryErrorReason =
  "invalid_code" | "rate_limited" | "unknown";

export type VerifyRecoveryOutcome =
  { status: "ok" } | { status: "error"; reason: VerifyRecoveryErrorReason };

export type SimpleOutcome = { status: "ok" } | { status: "error" };

export type ConfirmationOutcome =
  | { status: "ok" }
  | { status: "error"; reason: "invalid_code" | "rate_limited" | "unknown" };

export type AuthRepository = {
  confirmSignup(params: EmailCodeParams): Promise<ConfirmationOutcome>;
  resendSignup(email: string): Promise<ConfirmationOutcome>;
  getConfirmedUser(): Promise<AuthUser | null>;
  signUp(params: SignUpParams): Promise<SignUpOutcome>;
  signIn(params: SignInParams): Promise<SignInOutcome>;
  signOut(scope?: "local" | "global"): Promise<SimpleOutcome>;
  sendRecoveryEmail(email: string): Promise<SimpleOutcome>;
  verifyRecoveryCode(params: EmailCodeParams): Promise<VerifyRecoveryOutcome>;
  updatePassword(password: string): Promise<SimpleOutcome>;
};

function toAuthUser(user: User): AuthUser {
  return { id: user.id ?? null, email: user.email ?? null };
}

function hasNoIdentities(user: User | null): boolean {
  return user !== null && (user.identities?.length ?? 0) === 0;
}

function isDuplicateError(code: string | undefined, message: string): boolean {
  if (code === "user_already_exists") {
    return true;
  }
  return message.toLowerCase().includes("already registered");
}

function isRateLimited(error: AuthError): boolean {
  return error.status === 429 || (error.code ?? "").includes("rate_limit");
}

function isInvalidCredentials(error: AuthError): boolean {
  return (
    error.code === "invalid_credentials" ||
    error.code === "email_not_confirmed" ||
    error.message.toLowerCase().includes("invalid login credentials")
  );
}

function classifySignInError(error: AuthError): SignInErrorReason {
  if (isRateLimited(error)) {
    return "rate_limited";
  }
  if (isInvalidCredentials(error)) {
    return "invalid_credentials";
  }
  return "unknown";
}

function isOtpInvalid(error: AuthError): boolean {
  if (error.code === "otp_expired") {
    return true;
  }
  const message = error.message.toLowerCase();
  return message.includes("invalid") || message.includes("expired");
}

function classifyVerifyRecoveryError(
  error: AuthError,
): VerifyRecoveryErrorReason {
  if (isRateLimited(error)) {
    return "rate_limited";
  }
  if (isOtpInvalid(error)) {
    return "invalid_code";
  }
  return "unknown";
}

export function createAuthRepository(supabase: SupabaseClient): AuthRepository {
  return {
    async signUp({ fullName, email, password, phone }) {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName, phone, is_sindico: true } },
      });

      if (error) {
        if (isDuplicateError(error.code, error.message)) {
          return { status: "duplicate" };
        }
        return {
          status: "error",
          reason: isRateLimited(error) ? "rate_limited" : undefined,
        };
      }

      if (data.user === null) {
        return { status: "error" };
      }

      if (data.session) {
        await supabase.auth.signOut({ scope: "local" });
        return { status: "error" };
      }

      if (hasNoIdentities(data.user)) {
        return { status: "duplicate" };
      }

      return { status: "created", user: toAuthUser(data.user) };
    },

    async getConfirmedUser() {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user?.email_confirmed_at) return null;
      return toAuthUser(data.user);
    },

    async confirmSignup({ email, code }) {
      const { data, error } = await supabase.auth.verifyOtp({
        email,
        token: code,
        type: "signup",
      });
      if (error)
        return {
          status: "error",
          reason: isRateLimited(error)
            ? "rate_limited"
            : error.code === "otp_expired"
              ? "invalid_code"
              : "unknown",
        };
      if (!data.session) return { status: "error", reason: "unknown" };
      const { data: identity, error: identityError } =
        await supabase.auth.getUser();
      if (
        identityError ||
        !identity.user?.email_confirmed_at ||
        identity.user.email?.toLowerCase() !== email.toLowerCase()
      ) {
        await supabase.auth.signOut({ scope: "local" });
        return { status: "error", reason: "unknown" };
      }
      return { status: "ok" };
    },

    async resendSignup(email) {
      const { error } = await supabase.auth.resend({ type: "signup", email });
      return error
        ? {
            status: "error",
            reason: isRateLimited(error) ? "rate_limited" : "unknown",
          }
        : { status: "ok" };
    },

    async signIn({ email, password }) {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        return { status: "error", reason: classifySignInError(error) };
      }

      const { data: identity, error: identityError } =
        await supabase.auth.getUser();
      if (identityError || !identity.user?.email_confirmed_at) {
        await supabase.auth.signOut({ scope: "local" });
        return { status: "error", reason: "invalid_credentials" };
      }
      return { status: "ok", user: toAuthUser(identity.user) };
    },

    async signOut(scope = "global") {
      const { error } = await supabase.auth.signOut({ scope });
      return error ? { status: "error" } : { status: "ok" };
    },

    async sendRecoveryEmail(email) {
      const { error } = await supabase.auth.resetPasswordForEmail(email);
      return error ? { status: "error" } : { status: "ok" };
    },

    async verifyRecoveryCode({ email, code }) {
      const { error } = await supabase.auth.verifyOtp({
        email,
        token: code,
        type: "recovery",
      });
      if (error) {
        return { status: "error", reason: classifyVerifyRecoveryError(error) };
      }
      return { status: "ok" };
    },

    async updatePassword(password) {
      const { data, error: identityError } = await supabase.auth.getUser();
      if (identityError || !data.user?.email_confirmed_at)
        return { status: "error" };
      const { error } = await supabase.auth.updateUser({ password });
      return error ? { status: "error" } : { status: "ok" };
    },
  };
}
