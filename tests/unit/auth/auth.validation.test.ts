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
      fullName: "  Maria Exemplo  ",
      email: "  maria@example.com ",
      password: "codigo789",
      phone: "21999990000",
      acceptedTerms: true,
    });

    expect(result).toEqual({
      ok: true,
      data: {
        fullName: "Maria Exemplo",
        email: "maria@example.com",
        password: "codigo789",
        phone: "21999990000",
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
      fullName: "Digite nome e sobrenome.",
      email: "Digite um e-mail válido, como nome@email.com.",
      phone: "Digite o celular com DDD.",
      password: "A senha ainda não cumpre os requisitos abaixo.",
      acceptedTerms:
        "Para criar a conta, aceite os termos de uso e a política de privacidade.",
    });
  });

  it("rejects a short password", () => {
    const result = validateSignUp({
      fullName: "Maria Exemplo",
      email: "maria@example.com",
      password: "123",
      acceptedTerms: true,
    });

    if (result.ok) {
      throw new Error("expected a validation failure");
    }
    expect(result.error.details?.password).toBe(
      "A senha ainda não cumpre os requisitos abaixo.",
    );
  });
});

describe("validateLogin", () => {
  it("accepts e-mail and password", () => {
    const result = validateLogin({
      email: "maria@example.com",
      password: "codigo789",
      phone: "21999990000",
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
    expect(result.error.message).toBe("Informe um e-mail válido.");
  });
});

describe("validateResetPassword", () => {
  it("accepts e-mail, code and new password", () => {
    const result = validateResetPassword({
      email: "maria@example.com",
      code: "123456",
      password: "codigo789",
      phone: "21999990000",
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
    expect(result.error.details?.password).toContain("pelo menos 8");
  });
});

it.each([false, undefined, "true"])(
  "rejects signup without explicit consent: %s",
  (acceptedTerms) => {
    const result = validateSignUp({
      fullName: "Pessoa Exemplo",
      email: "person@example.invalid",
      phone: "21999990000",
      password: "Example123",
      acceptedTerms,
    });
    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "invalid_input",
        details: { acceptedTerms: expect.any(String) },
      },
    });
  },
);

it.each(["abcdefgh", "12345678", "ááááááá1"])(
  "rejects recovery passwords outside the signup/provider policy",
  (password) => {
    expect(
      validateResetPassword({
        email: "person@example.invalid",
        code: "123456",
        password,
      }).ok,
    ).toBe(false);
  },
);
