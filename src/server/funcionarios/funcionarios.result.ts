export type FuncionarioErrorCode =
  | "invalid_body"
  | "invalid_input"
  | "not_authenticated"
  | "forbidden"
  | "celular_already_registered"
  | "funcionario_not_found"
  | "unknown";

export type FuncionarioError = {
  code: FuncionarioErrorCode;
  message: string;
  details?: Record<string, string>;
};

export type Result<T> =
  { ok: true; data: T } | { ok: false; error: FuncionarioError };

export function success<T>(data: T): Result<T> {
  return { ok: true, data };
}

export function failure(error: FuncionarioError): Result<never> {
  return { ok: false, error };
}
