export class AuthRequestError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function authPost(path: string, body: unknown) {
  let response: Response;
  try {
    response = await fetch(path, {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new AuthRequestError(
      "network",
      "Não foi possível conectar. Confira sua conexão e tente novamente.",
    );
  }
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    const code = typeof result?.code === "string" ? result.code : "unknown";
    const messages: Record<string, string> = {
      invalid_credentials:
        "E-mail ou senha incorretos. Confira os dados ou recupere a senha.",
      rate_limited: "Muitas tentativas. Aguarde antes de tentar novamente.",
      invalid_recovery_code:
        "Código incorreto, expirado ou já utilizado. Solicite outro código.",
      update_failed:
        "O código foi utilizado, mas não foi possível confirmar a alteração da senha. Solicite um novo código.",
    };
    throw new AuthRequestError(
      code,
      messages[code] ??
        "Serviço temporariamente indisponível. Tente novamente.",
    );
  }
}
