"use client";

import Link from "next/link";
import { useSignupFlow } from "@/components/signup-flow";
import { useEffect, useState } from "react";
import type {
  FirstSteps as FirstStepsState,
  FirstStepsOperations,
  StepId,
} from "@/lib/first-steps/contract";
import { createFirstStepsOperations } from "@/lib/first-steps/operations";
import { usePanelData } from "@/components/panel-data";

const steps: { id: StepId; title: string }[] = [
  { id: "condominium", title: "Cadastre seu primeiro condomínio" },
  { id: "employees", title: "Cadastre zelador e porteiro de cada prédio" },
  {
    id: "resident-link",
    title: "Copie o link do formulário e envie aos moradores",
  },
];

export function FirstSteps({
  operations,
  onDismissed,
}: {
  operations?: FirstStepsOperations;
  onDismissed?: () => void;
}) {
  const context = usePanelData();
  const shared = operations ? null : context;
  const hasSharedData = shared !== null;
  const [service] = useState(() => operations ?? createFirstStepsOperations());
  const [localData, setData] = useState<FirstStepsState | null>(null);
  const [localLoading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [localError, setError] = useState<string | null>(null);
  const data = shared ? (shared.data?.firstSteps ?? null) : localData;
  const loading = shared ? shared.loading : localLoading;
  const error =
    localError ??
    (shared?.error ? "Não foi possível carregar seus primeiros passos." : null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (hasSharedData) return;
    let active = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const result = await service.load();
        if (!active) return;
        if (result.ok) setData(result.data);
        else setError("Não foi possível carregar seus primeiros passos.");
      } catch {
        if (active)
          setError("Não foi possível carregar seus primeiros passos.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [service, attempt, hasSharedData]);

  useEffect(() => {
    if (hasSharedData) return;
    const refresh = () => setAttempt((value) => value + 1);
    window.addEventListener("condominiums-changed", refresh);
    return () => window.removeEventListener("condominiums-changed", refresh);
  }, [hasSharedData]);

  async function dismiss() {
    setSaving(true);
    setError(null);
    try {
      const result = await (shared ? shared.dismiss() : service.dismiss());
      if (result.ok && result.data.dismissed) {
        setData((previous) => ({
          completed: previous?.completed ?? [],
          dismissed: true,
        }));
        onDismissed?.();
      } else setError("Não foi possível dispensar o quadro. Tente novamente.");
    } catch {
      setError("Não foi possível dispensar o quadro. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  if (data?.dismissed)
    return (
      <p
        role="status"
        tabIndex={-1}
        ref={(node) => node?.focus()}
        className="sr-only"
      >
        Quadro de primeiros passos dispensado.
      </p>
    );

  return (
    <section
      aria-labelledby="first-steps-title"
      aria-busy={loading || saving}
      className="flex flex-col gap-2.5 rounded-[10px] border border-[#e5e7eb] bg-white p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2
            id="first-steps-title"
            className="text-sm leading-[1.45] font-bold"
          >
            Primeiros passos
          </h2>
        </div>
        {data && (
          <button
            type="button"
            disabled={saving}
            aria-busy={saving}
            aria-label={saving ? "Dispensando…" : undefined}
            onClick={dismiss}
            className="cursor-pointer rounded-lg border border-[#d0d5dd] bg-white px-2.5 py-[5px] text-[13px] leading-[1.45] font-semibold hover:bg-[#f6f7f9] active:bg-[#e3f1ef] disabled:cursor-wait disabled:opacity-50"
          >
            Dispensar
          </button>
        )}
      </div>
      {loading ? (
        <p role="status" className="mt-6 text-sm leading-[1.45] text-slate-600">
          Carregando primeiros passos…
        </p>
      ) : (
        <>
          {error && (
            <div
              role="alert"
              className="mt-5 text-sm leading-[1.45] text-red-800"
            >
              <p>{error}</p>
              {!data && (
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    if (shared) shared.refresh();
                    else setAttempt((value) => value + 1);
                  }}
                  className="mt-2 cursor-pointer hover:bg-red-50 active:bg-red-100 min-h-11 rounded-lg border border-red-200 px-4 font-semibold"
                >
                  Tentar novamente
                </button>
              )}
            </div>
          )}
          {data && (
            <>
              <ol className="flex list-decimal flex-col gap-1 pl-5">
                {steps.map((step) => (
                  <li
                    key={step.id}
                    className={
                      data.completed.includes(step.id)
                        ? "text-[#6b7280] line-through"
                        : ""
                    }
                  >
                    {step.id === "condominium" || step.id === "employees" ? (
                      <Link
                        href={
                          step.id === "employees"
                            ? "/funcionarios?novo=1"
                            : "/condominios?novo=1"
                        }
                        className="font-semibold text-[#0b5e58] underline"
                      >
                        {step.title}
                      </Link>
                    ) : (
                      <button
                        type="button"
                        disabled
                        aria-describedby="first-steps-availability"
                        title="Disponível quando o cadastro e o formulário estiverem integrados."
                        className={`align-top text-left text-sm leading-[1.45] font-semibold underline underline-offset-[3px] disabled:cursor-not-allowed ${data.completed.includes(step.id) ? "text-[#6b7280]" : "text-[#0b5e58]"}`}
                      >
                        {step.title}
                      </button>
                    )}
                    {data.completed.includes(step.id) && (
                      <span className="sr-only"> — Concluído</span>
                    )}
                  </li>
                ))}
              </ol>
              <p id="first-steps-availability" className="sr-only">
                O atalho do formulário ainda está indisponível.
              </p>
            </>
          )}
        </>
      )}
    </section>
  );
}

export function SignupFirstSteps({
  operations,
}: {
  operations?: FirstStepsOperations;
}) {
  const { showFirstSteps, setShowFirstSteps } = useSignupFlow();
  return showFirstSteps ? (
    <FirstSteps
      operations={operations}
      onDismissed={() => setShowFirstSteps(false)}
    />
  ) : null;
}
