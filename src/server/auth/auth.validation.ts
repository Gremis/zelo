import { type Result, failure, success } from "./auth.result";

const MIN_PASSWORD_LENGTH = 6;

export type SignUpInput = { fullName: string; email: string; password: string };
export type LoginInput = { email: string; password: string };
export type EmailInput = { email: string };
export type ResetPasswordInput = {
  email: string;
  code: string;
  password: string;
};

function asRecord(body: unknown): Record<string, unknown> {
  if (typeof body === "object" && body !== null) {
    return body as Record<string, unknown>;
  }
  return {};
}

function readTrimmed(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }
  return "";
}

function readRaw(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  return "";
}

function passwordError(password: string): string | null {
  if (!password) {
    return "Informe a senha.";
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `A senha deve ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`;
  }
  return null;
}

function invalidInput(details: Record<string, string>): Result<never> {
  return failure({
    code: "invalid_input",
    message: "Dados inválidos.",
    details,
  });
}

export function validateSignUp(body: unknown): Result<SignUpInput> {
  const record = asRecord(body);
  const fullName = readTrimmed(record.fullName);
  const email = readTrimmed(record.email);
  const password = readRaw(record.password);

  const details: Record<string, string> = {};
  if (!fullName) {
    details.fullName = "Informe o nome.";
  }
  if (!email) {
    details.email = "Informe o e-mail.";
  }
  const passwordIssue = passwordError(password);
  if (passwordIssue) {
    details.password = passwordIssue;
  }

  if (Object.keys(details).length > 0) {
    return invalidInput(details);
  }

  return success({ fullName, email, password });
}

export function validateLogin(body: unknown): Result<LoginInput> {
  const record = asRecord(body);
  const email = readTrimmed(record.email);
  const password = readRaw(record.password);

  if (!email || !password) {
    return failure({
      code: "invalid_input",
      message: "Informe e-mail e senha.",
    });
  }

  return success({ email, password });
}

export function validateEmailOnly(body: unknown): Result<EmailInput> {
  const email = readTrimmed(asRecord(body).email);

  if (!email) {
    return failure({ code: "invalid_input", message: "Informe o e-mail." });
  }

  return success({ email });
}

export function validateResetPassword(
  body: unknown,
): Result<ResetPasswordInput> {
  const record = asRecord(body);
  const email = readTrimmed(record.email);
  const code = readTrimmed(record.code);
  const password = readRaw(record.password);

  const details: Record<string, string> = {};
  if (!email) {
    details.email = "Informe o e-mail.";
  }
  if (!code) {
    details.code = "Informe o código.";
  }
  const passwordIssue = passwordError(password);
  if (passwordIssue) {
    details.password = passwordIssue;
  }

  if (Object.keys(details).length > 0) {
    return invalidInput(details);
  }

  return success({ email, code, password });
}
