import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { confirmedIdentity } from "@/server/auth/identity";
import { Inter, Space_Grotesk } from "next/font/google";
import { PanelPageTitle } from "@/components/panel-page-title";
import { PanelShell } from "@/components/panel-shell";
import { PanelAccessLoading } from "@/components/panel-access-loading";
import { ConfirmationNotice } from "@/components/confirmation-notice";
import { SignupFirstSteps } from "@/components/first-steps";

const ui = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  adjustFontFallback: false,
});
const heading = Space_Grotesk({
  subsets: ["latin"],
  weight: "700",
  display: "swap",
  adjustFontFallback: false,
  variable: "--font-panel-heading",
});

export const metadata: Metadata = { title: "Fila de ocorrências | Zelo" };

async function ProtectedQueue() {
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
    <PanelShell title="Fila de ocorrências" currentPath="/fila">
      <ConfirmationNotice />
      <SignupFirstSteps />
      <PanelPageTitle
        className={`${heading.className} mt-[18px] text-2xl font-bold tracking-[-0.01em]`}
      >
        Fila de ocorrências
      </PanelPageTitle>
      <section
        aria-labelledby="empty-queue-title"
        className="py-16 text-center"
      >
        <h2 id="empty-queue-title" className="text-lg font-semibold">
          Nenhuma ocorrência por enquanto
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">
          As ocorrências recebidas aparecerão aqui.
        </p>
      </section>
    </PanelShell>
  );
}

export default function QueuePage() {
  return (
    <div
      lang="pt-BR"
      className={`${ui.className} ${heading.variable} min-h-screen flex-1 bg-[#f6f7f9] text-[#111827] [color-scheme:light] [&_:is(button,a):focus-visible]:outline-2 [&_:is(button,a):focus-visible]:outline-offset-4 [&_:is(button,a):focus-visible]:outline-teal-700 text-sm leading-[1.45] [-webkit-font-smoothing:auto] [-moz-osx-font-smoothing:auto]`}
    >
      <Suspense fallback={<PanelAccessLoading title="Fila de ocorrências" />}>
        <ProtectedQueue />
      </Suspense>
    </div>
  );
}
