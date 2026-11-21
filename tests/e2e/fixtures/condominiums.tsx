import React from "react";
import { createRoot } from "react-dom/client";
import { Condominiums } from "@/components/condominiums";
import { PanelShell } from "@/components/panel-shell";
import { SignupFlowProvider } from "@/components/signup-flow";

createRoot(document.getElementById("visual-root")!).render(
  <SignupFlowProvider>
    <PanelShell title="Condomínios" currentPath="/condominios">
      <Condominiums />
    </PanelShell>
  </SignupFlowProvider>,
);
