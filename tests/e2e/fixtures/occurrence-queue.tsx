import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import {
  OccurrenceQueue,
  type QueuePresentation,
} from "@/components/occurrence-queue";
import { ConnectedOccurrenceQueue } from "@/components/occurrence-queue-connected";
import { PanelShell } from "@/components/panel-shell";
import { SignupFlowProvider } from "@/components/signup-flow";
import {
  queueEmptyFixture,
  queueFixture,
} from "../../fixtures/occurrence-queue";
import type { PanelOperations } from "@/lib/panel/contract";

const parameters = new URLSearchParams(window.location.search);
const variant = parameters.get("fixture");
const operations: PanelOperations = {
  loadUser: async () => ({
    ok: true,
    data: {
      name: "Pessoa Sintética de Revisão",
      initials: "PS",
      condominiumCount: 2,
    },
  }),
  logout: async () => ({ ok: true, data: null }),
};

function Fixture() {
  const [retried, setRetried] = useState(false);
  const [updated, setUpdated] = useState(false);
  const state: QueuePresentation =
    variant === "loading"
      ? { status: "loading" }
      : variant === "error" && !retried
        ? { status: "error", onRetry: () => setRetried(true) }
        : {
            status: "success",
            data:
              variant === "empty" || updated
                ? queueEmptyFixture
                : queueFixture(variant === "stress" ? "stress" : "all"),
          };
  return (
    <SignupFlowProvider>
      <PanelShell
        title="Fila de ocorrências"
        currentPath="/fila"
        operations={operations}
      >
        {variant === "refresh" && (
          <button type="button" onClick={() => setUpdated(true)}>
            Atualizar dados de teste
          </button>
        )}
        {variant === "connected" ? (
          <ConnectedOccurrenceQueue />
        ) : (
          <OccurrenceQueue state={state} />
        )}
      </PanelShell>
    </SignupFlowProvider>
  );
}

createRoot(document.getElementById("visual-root")!).render(<Fixture />);
