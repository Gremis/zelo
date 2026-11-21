import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { confirmedIdentity } from "@/server/auth/identity";
import { Inter, Space_Grotesk, JetBrains_Mono } from "next/font/google";
import { Condominiums } from "@/components/condominiums";
import { PanelShell } from "@/components/panel-shell";
import { PanelAccessLoading } from "@/components/panel-access-loading";

const ui = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  adjustFontFallback: false,
  fallback: ["system-ui", "-apple-system", "Segoe UI", "sans-serif"],
});
const heading = Space_Grotesk({
  subsets: ["latin"],
  weight: "700",
  display: "swap",
  adjustFontFallback: false,
  variable: "--font-panel-heading",
  fallback: ["Inter", "system-ui", "sans-serif"],
});
const code = JetBrains_Mono({
  subsets: ["latin"],
  weight: "500",
  display: "swap",
  adjustFontFallback: false,
  variable: "--font-condominium-code",
  fallback: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
});

export const metadata: Metadata = { title: "Condomínios | Zelo" };

async function ProtectedCondominiums() {
  await connection();
  let identity;
  try {
    identity = await confirmedIdentity();
  } catch {
    identity = null;
  }
  if (!identity) redirect("/login");
  const { data: profile, error } = await identity.supabase
    .from("profiles")
    .select("is_sindico")
    .eq("id", identity.user.id)
    .single();
  if (error || !profile?.is_sindico)
    return (
      <main className="m-auto max-w-md p-8 text-center">
        <h1 className="text-2xl font-semibold">Acesso não autorizado</h1>
        <p className="mt-4">Esta área está disponível apenas para síndicos.</p>
        <a className="mt-6 inline-block underline" href="/login">
          Voltar para o login
        </a>
      </main>
    );
  return (
    <PanelShell title="Condomínios" currentPath="/condominios">
      <Condominiums />
    </PanelShell>
  );
}

export default function CondominiumsPage() {
  return (
    <div
      lang="pt-BR"
      className={`${ui.className} ${heading.variable} ${code.variable} min-h-screen flex-1 bg-[#f6f7f9] text-[#111827] [color-scheme:light] [&_:is(button,a):focus-visible]:outline-2 [&_:is(button,a):focus-visible]:outline-offset-4 [&_:is(button,a):focus-visible]:outline-teal-700 text-sm leading-[1.45] [-webkit-font-smoothing:auto] [-moz-osx-font-smoothing:auto]`}
    >
      <Suspense fallback={<PanelAccessLoading title="Condomínios" compact />}>
        <ProtectedCondominiums />
      </Suspense>
    </div>
  );
}
