import type { AuthRepository, AuthUser } from "./auth.repository";
import { type Result, failure, success } from "./auth.result";
import {
  validateEmailOnly,
  validateLogin,
  validateResetPassword,
  validateSignUp,
} from "./auth.validation";

const RECOVERY_MESSAGE =
  "Se o e-mail existir, enviamos as instruções de recuperação.";

export type AuthService = {
  signUp(body: unknown): Promise<Result<{ user: AuthUser }>>;
  login(body: unknown): Promise<Result<{ user: AuthUser }>>;
  logout(): Promise<Result<{ success: boolean }>>;
  requestPasswordRecovery(body: unknown): Promise<Result<{ message: string }>>;
  resetPassword(body: unknown): Promise<Result<{ success: boolean }>>;
};

export function createAuthService(repository: AuthRepository): AuthService {
  return {
    async signUp(body) {
      const validation = validateSignUp(body);
      if (!validation.ok) {
        return validation;
      }

      const outcome = await repository.signUp(validation.data);
      if (outcome.status === "created") {
        return success({ user: outcome.user });
      }
      if (outcome.status === "duplicate") {
        return failure({
          code: "email_already_registered",
          message: "Este e-mail já está cadastrado.",
        });
      }

      return failure({
        code: "unknown",
        message: "Não foi possível concluir o cadastro.",
      });
    },

    async login(body) {
      const validation = validateLogin(body);
      if (!validation.ok) {
        return validation;
      }

      const outcome = await repository.signIn(validation.data);
      if (outcome.status === "error") {
        return failure({
          code: "invalid_credentials",
          message: "E-mail ou senha inválidos.",
        });
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
        return failure({
          code: "invalid_recovery_code",
          message: "Código inválido ou expirado.",
        });
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
