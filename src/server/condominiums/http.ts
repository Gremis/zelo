import "server-only";
import { NextResponse } from "next/server";
import { confirmedIdentity } from "@/server/auth/identity";
import { validateFields } from "@/lib/condominiums/validation";

export async function handleCondominiums(request?: Request, id?: string) {
  const headers = new Headers({
    "Cache-Control": "private, no-store, max-age=0",
    Pragma: "no-cache",
    Expires: "0",
  });
  const reply = (body: unknown, status = 200) =>
    NextResponse.json(body, { status, headers });
  try {
    const identity = await confirmedIdentity(headers);
    if (!identity)
      return reply({ error: "Entre com uma conta confirmada." }, 401);
    const { supabase, user } = identity;
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("is_sindico")
      .eq("id", user.id)
      .single();
    if (profileError) throw new Error("Profile unavailable");
    if (!profile?.is_sindico)
      return reply({ error: "Acesso não autorizado." }, 403);
    const origin = new URL(process.env.PUBLIC_APP_ORIGIN ?? "");
    if (
      !["https:", "http:"].includes(origin.protocol) ||
      origin.username ||
      origin.password ||
      origin.pathname !== "/" ||
      origin.search ||
      origin.hash
    )
      throw new Error("Invalid public origin");
    const present = (row: {
      id: string;
      name: string;
      address: string;
      slug: string;
    }) => ({ ...row, url: new URL(`/c/${row.slug}`, origin).href });
    if (!request) {
      const { data, error } = await supabase
        .from("condominiums")
        .select("id,name,address,slug")
        .eq("manager_id", user.id)
        .order("id");
      if (error) throw error;
      return reply({ condominiums: data.map(present) });
    }
    const requestOrigin = request.headers.get("origin");
    const requestUrl = new URL(request.url);
    const expectedOrigin = `${requestUrl.protocol}//${request.headers.get("host") ?? requestUrl.host}`;
    if (requestOrigin && requestOrigin !== expectedOrigin)
      return reply({ error: "Origem não autorizada." }, 403);
    if (
      request.headers
        .get("content-type")
        ?.split(";")[0]
        .trim()
        .toLowerCase() !== "application/json"
    )
      return reply({ error: "Envie os dados em JSON." }, 415);
    const body = await request.json().catch(() => null);
    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body) ||
      Object.keys(body).some((key) => !["name", "address"].includes(key))
    )
      return reply({ error: "Envie somente nome e endereço." }, 400);
    const fields = {
      name:
        typeof body.name === "string" ? body.name.trim().normalize("NFC") : "",
      address: typeof body.address === "string" ? body.address.trim() : "",
    };
    const errors = validateFields(fields);
    if (Object.keys(errors).length) return reply({ errors }, 422);
    if (id && !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id))
      return reply({ error: "Condomínio não encontrado." }, 404);
    const result = id
      ? await supabase
          .from("condominiums")
          .update(fields)
          .eq("id", id)
          .eq("manager_id", user.id)
          .select("id,name,address,slug")
          .maybeSingle()
      : await supabase
          .rpc("create_condominium", {
            p_name: fields.name,
            p_address: fields.address,
          })
          .select("id,name,address,slug")
          .single();
    if (result.error) throw result.error;
    if (!result.data)
      return reply({ error: "Condomínio não encontrado." }, 404);
    return reply({ condominium: present(result.data) }, id ? 200 : 201);
  } catch {
    return reply(
      {
        error:
          "Não foi possível carregar ou salvar os condomínios. Tente novamente.",
      },
      503,
    );
  }
}
