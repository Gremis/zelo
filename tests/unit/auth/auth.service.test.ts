import { describe, expect, it, vi } from "vitest";
import type { AuthRepository } from "@/server/auth/auth.repository";
import { createAuthService as createService } from "@/server/auth/auth.service";

const guard = async () => ({
  status: "ok" as const,
  id: "11111111-1111-4111-8111-111111111111",
  lease: "22222222-2222-4222-8222-222222222222",
});
const createAuthService = (repository: AuthRepository) =>
  createService(repository, guard);
const USER = { id: "user-1", email: "maria@example.com" };

function createRepository(
  overrides: Partial<AuthRepository> = {},
): AuthRepository {
  return {
    confirmSignup: async () => ({ status: "ok" }),
    resendSignup: async () => ({ status: "ok" }),
    getConfirmedUser: async () => USER,
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
      fullName: "Maria Exemplo",
      email: "maria@example.com",
      password: "codigo789",
      phone: "21999990000",
      acceptedTerms: true,
    });

    expect(result).toEqual({
      ok: true,
      data: {
        user: USER,
        registrationId: "11111111-1111-4111-8111-111111111111",
        email: USER.email,
      },
    });
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

  it("preserves the duplicate error contract for existing accounts", async () => {
    const service = createAuthService(
      createRepository({ signUp: async () => ({ status: "duplicate" }) }),
    );
    const result = await service.signUp({
      fullName: "Maria Exemplo",
      email: USER.email,
      password: "codigo789",
      phone: "21999990000",
      acceptedTerms: true,
    });
    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "email_already_registered",
        message: "Este e-mail já está cadastrado.",
      },
    });
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

  it("maps invalid credentials to a 401 error", async () => {
    const service = createAuthService(
      createRepository({
        signIn: async () => ({
          status: "error",
          reason: "invalid_credentials",
        }),
      }),
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

  it("maps a rate limit to its own error instead of invalid credentials", async () => {
    const service = createAuthService(
      createRepository({
        signIn: async () => ({ status: "error", reason: "rate_limited" }),
      }),
    );

    const result = await service.login({
      email: "maria@example.com",
      password: "codigo789",
    });

    if (result.ok) {
      throw new Error("expected a failure");
    }
    expect(result.error.code).toBe("rate_limited");
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
  it("reports provider failure without pretending the code was sent", async () => {
    const service = createAuthService(
      createRepository({
        sendRecoveryEmail: async () => ({ status: "error" }),
      }),
    );

    const result = await service.requestPasswordRecovery({
      email: "maria@example.com",
    });

    expect(result).toMatchObject({ ok: false, error: { code: "unknown" } });
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

it.each(["invalid_code", "rate_limited", "unknown"] as const)(
  "preserves recovery provider reason %s",
  async (reason) => {
    const result = await createAuthService(
      createRepository({
        verifyRecoveryCode: async () => ({ status: "error", reason }),
      }),
    ).resetPassword({
      email: USER.email,
      code: "123456",
      password: "Example123",
    });
    expect(result).toMatchObject({
      ok: false,
      error: {
        code:
          reason === "invalid_code"
            ? "invalid_recovery_code"
            : reason === "rate_limited"
              ? "rate_limited"
              : "unknown",
      },
    });
  },
);
it.each([false, true])(
  "always closes the isolated recovery session after update failure (throw: %s)",
  async (throws) => {
    const signOut = vi.fn(async () => ({ status: "ok" as const }));
    const updatePassword = vi.fn(async () => {
      if (throws) throw new Error("Unavailable");
      return { status: "error" as const };
    });
    const normal = createRepository();
    const normalSignOut = vi.spyOn(normal, "signOut");
    const recovery = createRepository({ signOut, updatePassword });
    const result = await createService(normal, guard, recovery).resetPassword({
      email: USER.email,
      code: "123456",
      password: "Example123",
    });
    expect(result).toMatchObject({
      ok: false,
      error: { code: "update_failed" },
    });
    expect(signOut).toHaveBeenCalledExactlyOnceWith("local");
    expect(normalSignOut).not.toHaveBeenCalled();
  },
);
it("closes the recovery session after success", async () => {
  const signOut = vi.fn(async () => ({ status: "ok" as const }));
  await createAuthService(createRepository({ signOut })).resetPassword({
    email: USER.email,
    code: "123456",
    password: "Example123",
  });
  expect(signOut).toHaveBeenCalledExactlyOnceWith("local");
});
