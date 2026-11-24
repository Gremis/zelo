import { type Result, failure, success } from "./funcionarios.result";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Celular móvel brasileiro: DDD (11–99) + 9 + 8 dígitos.
const CELULAR_PATTERN = /^[1-9][1-9]9\d{8}$/;

const NOME_MAX = 100;
const FUNCAO_MAX = 50;
const HORARIO_MAX = 200;

export type CreateFuncionarioInput = {
  condominioId: string;
  funcaoNome: string;
  nome: string;
  celular: string;
  horarioTrabalho: string | null;
};

export type CreateFuncaoInput = { nome: string };

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

// Trim + colapsa espaços internos: "Ana  Lima" -> "Ana Lima".
function collapseSpaces(value: unknown): string {
  if (typeof value === "string") {
    return value.trim().replace(/\s+/g, " ");
  }
  return "";
}

// Só dígitos, removendo o código do país (+55 / 55) quando presente.
function normalizeCelular(value: unknown): string {
  const digits = typeof value === "string" ? value.replace(/\D/g, "") : "";
  if (
    (digits.length === 12 || digits.length === 13) &&
    digits.startsWith("55")
  ) {
    return digits.slice(2);
  }
  return digits;
}

function hasSobrenome(nome: string): boolean {
  return nome.split(" ").filter(Boolean).length >= 2;
}

// Normaliza a máscara para o padrão (31) 98765-4321 ao salvar.
function formatCelular(digits: string): string {
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function invalidInput(details: Record<string, string>): Result<never> {
  return failure({
    code: "invalid_input",
    message: "Dados inválidos.",
    details,
  });
}

export function validateCreateFuncionario(
  body: unknown,
): Result<CreateFuncionarioInput> {
  const record = asRecord(body);
  const nome = collapseSpaces(record.nome);
  const condominioId = readTrimmed(record.condominioId);
  const funcaoNome = collapseSpaces(record.funcaoNome);
  const horarioTrabalho = readTrimmed(record.horarioTrabalho);
  const celular = normalizeCelular(record.celular);

  const details: Record<string, string> = {};
  if (!hasSobrenome(nome)) {
    details.nome = "Informe o nome completo (nome e sobrenome).";
  } else if (nome.length > NOME_MAX) {
    details.nome = `O nome deve ter até ${NOME_MAX} caracteres.`;
  }
  if (!UUID_PATTERN.test(condominioId)) {
    details.condominioId = "Selecione o condomínio.";
  }
  if (!funcaoNome) {
    details.funcaoNome = "Informe a função.";
  } else if (funcaoNome.length > FUNCAO_MAX) {
    details.funcaoNome = `A função deve ter até ${FUNCAO_MAX} caracteres.`;
  }
  if (!CELULAR_PATTERN.test(celular)) {
    details.celular = "Informe um celular válido com DDD (11 dígitos).";
  }
  if (horarioTrabalho.length > HORARIO_MAX) {
    details.horarioTrabalho = `O horário deve ter até ${HORARIO_MAX} caracteres.`;
  }

  if (Object.keys(details).length > 0) {
    return invalidInput(details);
  }

  return success({
    condominioId,
    funcaoNome,
    nome,
    celular: formatCelular(celular),
    horarioTrabalho: horarioTrabalho || null,
  });
}

export function validateCreateFuncao(body: unknown): Result<CreateFuncaoInput> {
  const nome = collapseSpaces(asRecord(body).nome);

  if (!nome) {
    return failure({ code: "invalid_input", message: "Informe a função." });
  }
  if (nome.length > FUNCAO_MAX) {
    return failure({
      code: "invalid_input",
      message: `A função deve ter até ${FUNCAO_MAX} caracteres.`,
    });
  }

  return success({ nome });
}

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}
