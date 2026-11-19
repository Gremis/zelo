import type { AuthError, SupabaseClient, User } from "@supabase/supabase-js";

export type AuthUser = { id: string | null; email: string | null };

export type SignUpParams = {
  fullName: string;
  email: string;
  password: string;
};
export type SignInParams = { email: string; password: string };
export type VerifyRecoveryParams = { email: string; code: string };

export type SignUpOutcome =
  | { status: "created"; user: AuthUser }
  | { status: "duplicate" }
  | { status: "error" };

export type SignInErrorReason =
  "invalid_credentials" | "rate_limited" | "unknown";

export type SignInOutcome =
  | { status: "ok"; user: AuthUser }
  | { status: "error"; reason: SignInErrorReason };

export type SimpleOutcome = { status: "ok" } | { status: "error" };

export type AuthRepository = {
  signUp(params: SignUpParams): Promise<SignUpOutcome>;
  signIn(params: SignInParams): Promise<SignInOutcome>;
  signOut(): Promise<SimpleOutcome>;
  sendRecoveryEmail(email: string): Promise<SimpleOutcome>;
  verifyRecoveryCode(params: VerifyRecoveryParams): Promise<SimpleOutcome>;
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

export function createAuthRepository(supabase: SupabaseClient): AuthRepository {
  return {
    async signUp({ fullName, email, password }) {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName, is_sindico: true } },
      });

      if (error) {
        if (isDuplicateError(error.code, error.message)) {
          return { status: "duplicate" };
        }
        return { status: "error" };
      }

      if (data.user === null) {
        return { status: "error" };
      }

      if (hasNoIdentities(data.user)) {
        return { status: "duplicate" };
      }

      return { status: "created", user: toAuthUser(data.user) };
    },

    async signIn({ email, password }) {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        return { status: "error", reason: classifySignInError(error) };
      }

      return { status: "ok", user: toAuthUser(data.user) };
    },

    async signOut() {
      const { error } = await supabase.auth.signOut();
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
      return error ? { status: "error" } : { status: "ok" };
    },

    async updatePassword(password) {
      const { error } = await supabase.auth.updateUser({ password });
      return error ? { status: "error" } : { status: "ok" };
    },
  };
}
