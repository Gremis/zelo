import { describe, expect, it } from "vitest";
import type { AuthRepository } from "@/server/auth/auth.repository";
import { createAuthService } from "@/server/auth/auth.service";

const USER = { id: "user-1", email: "maria@example.com" };

function createRepository(
  overrides: Partial<AuthRepository> = {},
): AuthRepository {
  return {
    signUp: async () => ({ status: "created", user: USER }),
    signIn: async () => ({ status: "ok", user: USER }),
    signOut: async () => ({ status: "ok" }),
    sendRecoveryEmail: async () => ({ status: "ok" }),
    verifyRecoveryCode: async () => ({ status: "ok" }),
    updatePassword: async () => ({ status: "ok" }),
    ...overrides,
  };
}

describe("AuthService.signUp", () => {
  it("returns the created user", async () => {
    const service = createAuthService(createRepository());

    const result = await service.signUp({
      fullName: "Maria",
      email: "maria@example.com",
      password: "codigo789",
    });

    expect(result).toEqual({ ok: true, data: { user: USER } });
  });

  it("does not reach the repository when input is invalid", async () => {
    let called = false;
    const service = createAuthService(
      createRepository({
        signUp: async () => {
          called = true;
          return { status: "created", user: USER };
        },
      }),
    );

    const result = await service.signUp({});

    expect(called).toBe(false);
    if (result.ok) {
      throw new Error("expected a validation failure");
    }
    expect(result.error.code).toBe("invalid_input");
  });

  it("maps a duplicate e-mail to a conflict error", async () => {
    const service = createAuthService(
      createRepository({ signUp: async () => ({ status: "duplicate" }) }),
    );

    const result = await service.signUp({
      fullName: "Maria",
      email: "maria@example.com",
      password: "codigo789",
    });

    if (result.ok) {
      throw new Error("expected a failure");
    }
    expect(result.error.code).toBe("email_already_registered");
  });
});

describe("AuthService.login", () => {
  it("returns the user on success", async () => {
    const service = createAuthService(createRepository());

    const result = await service.login({
      email: "maria@example.com",
      password: "codigo789",
    });

    expect(result).toEqual({ ok: true, data: { user: USER } });
  });

  it("maps a repository error to invalid credentials", async () => {
    const service = createAuthService(
      createRepository({ signIn: async () => ({ status: "error" }) }),
    );

    const result = await service.login({
      email: "maria@example.com",
      password: "wrong",
    });

    if (result.ok) {
      throw new Error("expected a failure");
    }
    expect(result.error.code).toBe("invalid_credentials");
  });
});

describe("AuthService.logout", () => {
  it("reports success", async () => {
    const service = createAuthService(createRepository());

    const result = await service.logout();

    expect(result).toEqual({ ok: true, data: { success: true } });
  });
});

describe("AuthService.requestPasswordRecovery", () => {
  it("returns a generic message even when the provider fails", async () => {
    const service = createAuthService(
      createRepository({
        sendRecoveryEmail: async () => ({ status: "error" }),
      }),
    );

    const result = await service.requestPasswordRecovery({
      email: "maria@example.com",
    });

    expect(result).toEqual({
      ok: true,
      data: {
        message: "Se o e-mail existir, enviamos as instruções de recuperação.",
      },
    });
  });
});

describe("AuthService.resetPassword", () => {
  it("rejects an invalid recovery code", async () => {
    const service = createAuthService(
      createRepository({
        verifyRecoveryCode: async () => ({ status: "error" }),
      }),
    );

    const result = await service.resetPassword({
      email: "maria@example.com",
      code: "000000",
      password: "codigo789",
    });

    if (result.ok) {
      throw new Error("expected a failure");
    }
    expect(result.error.code).toBe("invalid_recovery_code");
  });

  it("reports a failure when the password update fails", async () => {
    const service = createAuthService(
      createRepository({
        updatePassword: async () => ({ status: "error" }),
      }),
    );

    const result = await service.resetPassword({
      email: "maria@example.com",
      code: "123456",
      password: "codigo789",
    });

    if (result.ok) {
      throw new Error("expected a failure");
    }
    expect(result.error.code).toBe("update_failed");
  });

  it("succeeds when the code is valid and the password is updated", async () => {
    const service = createAuthService(createRepository());

    const result = await service.resetPassword({
      email: "maria@example.com",
      code: "123456",
      password: "codigo789",
    });

    expect(result).toEqual({ ok: true, data: { success: true } });
  });
});
