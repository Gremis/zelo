import type { Metadata } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import { PanelPageTitle } from "@/components/panel-page-title";
import { PanelShell } from "@/components/panel-shell";
import { MockConfirmationNotice } from "@/components/mock-confirmation-notice";
import { FirstSteps } from "@/components/first-steps";

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

export default function QueuePage() {
  return (
    <div
      lang="pt-BR"
      className={`${ui.className} ${heading.variable} min-h-screen flex-1 bg-[#f6f7f9] text-[#111827] [color-scheme:light] [&_:is(button,a):focus-visible]:outline-2 [&_:is(button,a):focus-visible]:outline-offset-4 [&_:is(button,a):focus-visible]:outline-teal-700 text-sm leading-[1.45] [-webkit-font-smoothing:auto] [-moz-osx-font-smoothing:auto]`}
    >
      <PanelShell title="Fila de ocorrências" currentPath="/fila">
        <MockConfirmationNotice />
        <FirstSteps />
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
    </div>
  );
}
