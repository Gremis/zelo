import { describe, expect, it } from "vitest";
import {
  validateEmailOnly,
  validateLogin,
  validateResetPassword,
  validateSignUp,
} from "@/server/auth/auth.validation";

describe("validateSignUp", () => {
  it("accepts valid input and trims name and email", () => {
    const result = validateSignUp({
      fullName: "  Maria  ",
      email: "  maria@example.com ",
      password: "codigo789",
    });

    expect(result).toEqual({
      ok: true,
      data: {
        fullName: "Maria",
        email: "maria@example.com",
        password: "codigo789",
      },
    });
  });

  it("reports every missing field", () => {
    const result = validateSignUp({});

    if (result.ok) {
      throw new Error("expected a validation failure");
    }
    expect(result.error.code).toBe("invalid_input");
    expect(result.error.details).toEqual({
      fullName: "Informe o nome.",
      email: "Informe o e-mail.",
      password: "Informe a senha.",
    });
  });

  it("rejects a short password", () => {
    const result = validateSignUp({
      fullName: "Maria",
      email: "maria@example.com",
      password: "123",
    });

    if (result.ok) {
      throw new Error("expected a validation failure");
    }
    expect(result.error.details?.password).toContain("pelo menos 6");
  });
});

describe("validateLogin", () => {
  it("accepts e-mail and password", () => {
    const result = validateLogin({
      email: "maria@example.com",
      password: "codigo789",
    });

    expect(result.ok).toBe(true);
  });

  it("rejects when a field is missing", () => {
    const result = validateLogin({ email: "maria@example.com" });

    if (result.ok) {
      throw new Error("expected a validation failure");
    }
    expect(result.error.code).toBe("invalid_input");
  });
});

describe("validateEmailOnly", () => {
  it("rejects a blank e-mail", () => {
    const result = validateEmailOnly({ email: "   " });

    if (result.ok) {
      throw new Error("expected a validation failure");
    }
    expect(result.error.message).toBe("Informe o e-mail.");
  });
});

describe("validateResetPassword", () => {
  it("accepts e-mail, code and new password", () => {
    const result = validateResetPassword({
      email: "maria@example.com",
      code: "123456",
      password: "codigo789",
    });

    expect(result.ok).toBe(true);
  });

  it("reports a missing code and a short password", () => {
    const result = validateResetPassword({
      email: "maria@example.com",
      password: "123",
    });

    if (result.ok) {
      throw new Error("expected a validation failure");
    }
    expect(result.error.details?.code).toBe("Informe o código.");
    expect(result.error.details?.password).toContain("pelo menos 6");
  });
});
