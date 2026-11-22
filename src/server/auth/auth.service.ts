import type { ConfirmationGuard, GuardStatus } from "./confirmation-guard";
import type {
  AuthRepository,
  AuthUser,
  SignInErrorReason,
  VerifyRecoveryErrorReason,
} from "./auth.repository";
import { type AuthError, type Result, failure, success } from "./auth.result";
import {
  validateEmailOnly,
  validateConfirmation,
  validatePendingRegistration,
  validateLogin,
  validateResetPassword,
  validateSignUp,
} from "./auth.validation";

const RECOVERY_MESSAGE =
  "Se o e-mail existir, enviamos as instruções de recuperação.";

const LOGIN_ERRORS: Record<SignInErrorReason, AuthError> = {
  invalid_credentials: {
    code: "invalid_credentials",
    message: "E-mail ou senha inválidos.",
  },
  rate_limited: {
    code: "rate_limited",
    message:
      "Muitas tentativas em pouco tempo. Aguarde alguns instantes e tente novamente.",
  },
  unknown: {
    code: "unknown",
    message: "Não foi possível fazer login. Tente novamente mais tarde.",
  },
};

const RECOVERY_CODE_ERRORS: Record<VerifyRecoveryErrorReason, AuthError> = {
  invalid_code: {
    code: "invalid_recovery_code",
    message: "Código inválido ou expirado.",
  },
  rate_limited: {
    code: "rate_limited",
    message:
      "Muitas tentativas em pouco tempo. Aguarde alguns instantes e tente novamente.",
  },
  unknown: {
    code: "unknown",
    message: "Não foi possível validar o código. Tente novamente mais tarde.",
  },
};

export type AuthService = {
  signUp(
    body: unknown,
  ): Promise<Result<{ user: AuthUser; registrationId: string; email: string }>>;
  confirmSignup(body: unknown): Promise<Result<{ success: boolean }>>;
  resendSignup(body: unknown): Promise<Result<{ success: boolean }>>;
  confirmedIdentity(): Promise<Result<{ user: AuthUser }>>;
  login(body: unknown): Promise<Result<{ user: AuthUser }>>;
  logout(): Promise<Result<{ success: boolean }>>;
  requestPasswordRecovery(body: unknown): Promise<Result<{ message: string }>>;
  resetPassword(body: unknown): Promise<Result<{ success: boolean }>>;
};

function guardFailure(status: GuardStatus) {
  return failure({
    code:
      status === "blocked"
        ? "confirmation_blocked"
        : status === "rate_limited"
          ? "rate_limited"
          : "confirmation_expired",
    message:
      status === "blocked"
        ? "Muitas tentativas. Aguarde 15 minutos e solicite outro código."
        : status === "rate_limited"
          ? "Aguarde antes de tentar novamente. O intervalo de reenvio é de 60 segundos."
          : "Cadastro ou código expirado. Solicite outro código.",
  });
}

export function createAuthService(
  repository: AuthRepository,
  guard: ConfirmationGuard,
): AuthService {
  return {
    async signUp(body) {
      const validation = validateSignUp(body);
      if (!validation.ok) {
        return validation;
      }

      const email = validation.data.email;
      const reservation = await guard({ operation: "send", email });
      if (reservation.status !== "ok") return guardFailure(reservation.status);
      if (!reservation.id || !reservation.lease)
        throw new Error("Missing send reservation.");
      let accepted = false;
      let user: AuthUser | undefined;
      try {
        const outcome = await repository.signUp(validation.data);
        accepted = outcome.status === "created";
        if (outcome.status === "duplicate")
          return failure({
            code: "email_already_registered",
            message: "Este e-mail já está cadastrado.",
          });
        if (outcome.status === "created") user = outcome.user;
        if (outcome.status === "error")
          return outcome.reason === "rate_limited"
            ? guardFailure("rate_limited")
            : failure({
                code: "unknown",
                message: "Não foi possível concluir o cadastro.",
              });
      } finally {
        await guard({
          operation: "sent",
          email,
          registrationId: reservation.id,
          lease: reservation.lease,
          outcome: accepted ? "ok" : "error",
        });
      }
      if (!user) throw new Error("Missing signup user.");
      return success({ user, registrationId: reservation.id, email });
    },

    async confirmSignup(body) {
      const validation = validateConfirmation(body);
      if (!validation.ok) return validation;
      const { email, registrationId, code } = validation.data;
      const reservation = await guard({
        operation: "reserve",
        email,
        registrationId,
      });
      if (reservation.status !== "ok") return guardFailure(reservation.status);
      if (!reservation.lease)
        throw new Error("Missing verification reservation.");
      let outcome: "ok" | "invalid" | "error" = "error";
      let reason: "invalid_code" | "rate_limited" | "unknown" = "unknown";
      let settled;
      try {
        const result = await repository.confirmSignup({ email, code });
        if (result.status === "ok") outcome = "ok";
        else {
          reason = result.reason;
          outcome = reason === "invalid_code" ? "invalid" : "error";
        }
      } finally {
        try {
          settled = await guard({
            operation: "settle",
            email,
            registrationId,
            lease: reservation.lease,
            outcome,
          });
        } catch {
          if (outcome === "ok") await repository.signOut("local");
          throw new Error("Unable to finalize confirmation.");
        }
      }
      if (settled.status !== "ok") {
        if (outcome === "ok") await repository.signOut("local");
        return guardFailure(settled.status);
      }
      if (outcome === "ok") return success({ success: true });
      if (reason === "rate_limited") return guardFailure("rate_limited");
      return failure({
        code:
          reason === "invalid_code" ? "invalid_confirmation_code" : "unknown",
        message:
          reason === "invalid_code"
            ? "Código incorreto ou expirado."
            : "Não foi possível confirmar o código. Tente novamente.",
      });
    },

    async resendSignup(body) {
      const validation = validatePendingRegistration(body);
      if (!validation.ok) return validation;
      const { email, registrationId } = validation.data;
      const reservation = await guard({ operation: "send", email });
      if (reservation.status !== "ok") return guardFailure(reservation.status);
      let accepted = false;
      try {
        if (reservation.id !== registrationId) return guardFailure("missing");
        const outcome = await repository.resendSignup(email);
        accepted = outcome.status === "ok";
        if (outcome.status === "error")
          return outcome.reason === "rate_limited"
            ? guardFailure("rate_limited")
            : failure({
                code: "unknown",
                message: "Não foi possível reenviar o código.",
              });
      } finally {
        await guard({
          operation: "sent",
          email,
          registrationId: reservation.id,
          lease: reservation.lease,
          outcome: accepted ? "ok" : "error",
        });
      }
      return success({ success: true });
    },

    async confirmedIdentity() {
      const user = await repository.getConfirmedUser();
      return user
        ? success({ user })
        : failure({
            code: "unauthorized",
            message: "Entre com uma conta com e-mail confirmado.",
          });
    },

    async login(body) {
      const validation = validateLogin(body);
      if (!validation.ok) {
        return validation;
      }

      const outcome = await repository.signIn(validation.data);
      if (outcome.status === "error") {
        return failure(LOGIN_ERRORS[outcome.reason]);
      }

      return success({ user: outcome.user });
    },

    async logout() {
      const outcome = await repository.signOut();
      if (outcome.status === "error") {
        return failure({
          code: "unknown",
          message: "Não foi possível encerrar a sessão.",
        });
      }

      return success({ success: true });
    },

    async requestPasswordRecovery(body) {
      const validation = validateEmailOnly(body);
      if (!validation.ok) {
        return validation;
      }

      await repository.sendRecoveryEmail(validation.data.email);

      return success({ message: RECOVERY_MESSAGE });
    },

    async resetPassword(body) {
      const validation = validateResetPassword(body);
      if (!validation.ok) {
        return validation;
      }

      const verification = await repository.verifyRecoveryCode({
        email: validation.data.email,
        code: validation.data.code,
      });
      if (verification.status === "error") {
        return failure(RECOVERY_CODE_ERRORS[verification.reason]);
      }

      const update = await repository.updatePassword(validation.data.password);
      if (update.status === "error") {
        return failure({
          code: "update_failed",
          message: "Não foi possível atualizar a senha.",
        });
      }

      return success({ success: true });
    },
  };
}
