import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "@/lib/supabase/config";

async function PublicCondominium({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await connection();
  const { slug } = await params;
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) notFound();
  const { url, anonKey } = getSupabaseConfig();
  const supabase = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          cache: "no-store",
          signal: AbortSignal.timeout(15000),
        }),
    },
  });
  const { data, error } = await supabase.rpc("resolve_condominium_link", {
    p_slug: slug,
  });
  if (error) throw new Error("Public link temporarily unavailable");
  const item = data?.[0];
  if (!item) notFound();
  return (
    <main className="mx-auto w-full max-w-xl p-6 [overflow-wrap:anywhere]">
      <h1 className="text-2xl font-bold">{item.name}</h1>
      <p className="mt-2">{item.address}</p>
      <p className="mt-6">
        O registro de ocorrências ainda não está disponível. Este link
        identifica o condomínio; o formulário será disponibilizado em uma
        próxima etapa.
      </p>
    </main>
  );
}
export default function PublicLinkPage(props: {
  params: Promise<{ slug: string }>;
}) {
  return (
    <Suspense fallback={<p role="status">Carregando condomínio…</p>}>
      <PublicCondominium {...props} />
    </Suspense>
  );
}
