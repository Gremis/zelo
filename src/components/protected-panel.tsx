"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { PanelShell } from "@/components/panel-shell";
import { usePanelData } from "@/components/panel-data";

export function ProtectedPanel({ children }: { children: ReactNode }) {
  const path = usePathname();
  const panel = usePanelData();
  const title =
    path === "/condominios"
      ? "Condomínios"
      : path === "/funcionarios"
        ? "Funcionários"
        : "Fila de ocorrências";
  return (
    <PanelShell key={panel?.sessionKey} title={title} currentPath={path}>
      {children}
    </PanelShell>
  );
}
