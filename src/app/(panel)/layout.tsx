import { Suspense, type ReactNode } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { Inter, Space_Grotesk, JetBrains_Mono } from "next/font/google";
import { panelAccess } from "@/server/auth/panel-access";
import { PanelDataProvider } from "@/components/panel-data";
import { ProtectedPanel } from "@/components/protected-panel";
import { PanelAccessLoading } from "@/components/panel-access-loading";

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
const code = JetBrains_Mono({
  subsets: ["latin"],
  weight: "500",
  display: "swap",
  adjustFontFallback: false,
  variable: "--font-condominium-code",
  fallback: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
});

async function AuthorizedPanel({ children }: { children: ReactNode }) {
  await connection();
  let access;
  try {
    access = await panelAccess();
  } catch {
    access = null;
  }
  if (!access) redirect("/login");
  if (!access.permitted) return children;
  return (
    <PanelDataProvider key={access.sessionKey} sessionKey={access.sessionKey}>
      <ProtectedPanel>{children}</ProtectedPanel>
    </PanelDataProvider>
  );
}

export default function PanelLayout({ children }: { children: ReactNode }) {
  return (
    <div
      lang="pt-BR"
      className={`${ui.className} ${heading.variable} ${code.variable} min-h-screen flex-1 bg-[#f6f7f9] text-[#111827] [color-scheme:light] [&_:is(button,a):focus-visible]:outline-2 [&_:is(button,a):focus-visible]:outline-offset-4 [&_:is(button,a):focus-visible]:outline-teal-700 text-sm leading-[1.45] [-webkit-font-smoothing:auto] [-moz-osx-font-smoothing:auto]`}
    >
      <Suspense fallback={<PanelAccessLoading title="Painel" />}>
        <AuthorizedPanel>{children}</AuthorizedPanel>
      </Suspense>
    </div>
  );
}
