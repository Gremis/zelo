import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { OccurrenceWriteError, type PublicRegistration } from "./contracts";
import { occurrenceEvents } from "./event.factory";

const fields = {
  reporterName: 200,
  reporterUnitOrRole: 200,
  reporterPhone: 11,
  location: 200,
  description: 10000,
};
const slugPattern = /^[a-z0-9]+(-[a-z0-9]+)*-([0-9a-f]{32}|[a-z0-9]{4})$/;
const keyPattern = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export function publicReply(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", Pragma: "no-cache" },
  });
}

export function validatePublicRegistration(
  body: unknown,
  attemptKey: string | null,
) {
  const errors: Record<string, string> = {};
  const values: Record<string, string> = {};
  if (!attemptKey || !keyPattern.test(attemptKey))
    errors.attemptKey = "Informe uma chave UUID para esta tentativa.";
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    errors.body = "Informe um objeto JSON.";
  } else {
    if (Object.keys(body).some((key) => !Object.hasOwn(fields, key)))
      errors.body = "O envio contém campos não permitidos.";
    for (const [field, max] of Object.entries(fields)) {
      const value = (body as Record<string, unknown>)[field];
      if (
        typeof value !== "string" ||
        !value.trim() ||
        value.length > max ||
        value.includes("\0")
      ) {
        errors[field] = `Informe um texto de até ${max} caracteres.`;
      } else {
        values[field] = value.trim();
      }
    }
    if (
      values.reporterPhone &&
      !/^[1-9][0-9]9[0-9]{8}$/.test(values.reporterPhone)
    )
      errors.reporterPhone = "Informe o celular com DDD, usando 11 dígitos.";
  }
  return { errors, values };
}

export async function resolvePublicCondominium(slug: string) {
  if (slug.length > 200 || !slugPattern.test(slug))
    throw new OccurrenceWriteError("not_found");
  const { url, anonKey } = getSupabaseConfig();
  const client = createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          cache: "no-store",
          signal: AbortSignal.timeout(15000),
        }),
    },
  });
  const { data, error } = await client.rpc("resolve_condominium_link", {
    p_slug: slug,
  });
  if (error) throw new OccurrenceWriteError("unavailable");
  if (!data?.[0]) throw new OccurrenceWriteError("not_found");
  return { name: data[0].name, address: data[0].address };
}

export function publicFailure(error: unknown) {
  const code =
    error instanceof OccurrenceWriteError ? error.code : "unavailable";
  const status =
    code === "not_found"
      ? 404
      : code === "conflict"
        ? 409
        : code === "invalid_input"
          ? 400
          : 503;
  return publicReply(
    {
      code,
      error:
        status === 404
          ? "Link não encontrado ou indisponível."
          : status === 409
            ? "Esta tentativa já foi usada com outro conteúdo."
            : status === 400
              ? "Confira os dados informados."
              : "Serviço temporariamente indisponível.",
    },
    status,
  );
}

export async function registerPublicRequest(request: Request, slug: string) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return publicReply(
      { code: "invalid_input", fields: { body: "Informe um JSON válido." } },
      400,
    );
  }
  const attemptKey = request.headers.get("Idempotency-Key");
  const uploadSecret = request.headers.get("Upload-Token");
  if (uploadSecret !== null && !/^[0-9a-f]{64}$/.test(uploadSecret))
    return publicReply(
      { code: "invalid_input", error: "Credencial de envio inválida." },
      400,
    );
  const { errors, values } = validatePublicRegistration(body, attemptKey);
  if (Object.keys(errors).length)
    return publicReply({ code: "invalid_input", fields: errors }, 400);
  try {
    await resolvePublicCondominium(slug);
    const receipt = await occurrenceEvents(
      undefined,
      uploadSecret ?? undefined,
    ).registerPublic({
      ...values,
      type: "registered",
      condominiumSlug: slug,
      attemptKey: attemptKey!,
    } as PublicRegistration);
    return publicReply({ number: receipt.number });
  } catch (error) {
    return publicFailure(error);
  }
}
