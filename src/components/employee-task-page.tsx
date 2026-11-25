"use client";

import { useEffect, useRef, useState } from "react";
import { EmployeeTaskActions } from "./employee-task-actions";
import {
  parseEmployeeTask,
  type EmployeeTask,
} from "@/server/occurrences/task.contract";
import { TASK_CODE_PATTERN } from "@/lib/occurrences/task-link";
import { formatTrackingMoment } from "@/lib/occurrences/format";

type State =
  | { kind: "loading" }
  | { kind: "invalid" }
  | { kind: "error" }
  | { kind: "loaded"; task: EmployeeTask };

export function EmployeeTaskPage({ code }: { code: string }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState(0);
  const noticeRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (notice && !editing) noticeRef.current?.focus();
  }, [notice, editing]);
  const completionHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (state.kind === "loaded" && state.task.completedAt)
      completionHeading.current?.focus();
  }, [state]);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      if (!TASK_CODE_PATTERN.test(code)) {
        setState({ kind: "invalid" });
        return;
      }
      setState({ kind: "loading" });
      try {
        const response = await fetch(`/api/public/tasks/${code}`, {
          cache: "no-store",
          credentials: "omit",
          referrerPolicy: "no-referrer",
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        if (response.status === 404) {
          setState({ kind: "invalid" });
          return;
        }
        if (!response.ok) throw new Error("Task unavailable.");
        const task = parseEmployeeTask(await response.json());
        if (!controller.signal.aborted) setState({ kind: "loaded", task });
      } catch {
        if (!controller.signal.aborted) setState({ kind: "error" });
      }
    }
    void load();
    return () => controller.abort();
  }, [code, attempt]);

  const task = state.kind === "loaded" ? state.task : null;
  return (
    <main className="min-h-dvh flex-1 bg-[#f3f4f6] px-4 py-6 text-[#111827] [overflow-wrap:anywhere] sm:py-10">
      <div className="mx-auto w-full max-w-xl">
        {state.kind === "loading" && (
          <p role="status" className="rounded-xl bg-white p-5">
            Carregando tarefa…
          </p>
        )}
        {state.kind === "invalid" && (
          <section className="rounded-xl border border-[#e5e7eb] bg-white p-5">
            <h1 className="text-xl font-bold">Tarefa não encontrada</h1>
            <p role="alert" className="mt-3">
              Não encontramos esta tarefa. Confira o link que você recebeu.
            </p>
          </section>
        )}
        {state.kind === "error" && (
          <section className="rounded-xl border border-[#e5e7eb] bg-white p-5">
            <h1 className="text-xl font-bold">
              Não foi possível carregar a tarefa
            </h1>
            <p role="alert" className="mt-3">
              Tente novamente em instantes.
            </p>
            <button
              type="button"
              onClick={() => setAttempt((value) => value + 1)}
              className="mt-5 min-h-12 w-full rounded-lg bg-[#0f766e] px-4 py-3 font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f766e]"
            >
              Tentar novamente
            </button>
          </section>
        )}
        {task && (
          <>
            <header className="mb-4 flex flex-wrap items-start justify-between gap-2 text-sm text-[#4b5563]">
              <p className="font-medium">{task.condominiumName}</p>
              <h1 className="font-mono text-base text-[#111827]">
                Tarefa #{task.number}
              </h1>
            </header>
            {notice > 0 && !editing && (
              <p
                ref={noticeRef}
                tabIndex={-1}
                role="status"
                className="mb-4 rounded-xl bg-[#111827] p-4 text-white"
              >
                Recado enviado ao síndico.
              </p>
            )}
            {task.completedAt && (
              <section role="status" className="py-6 text-center">
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="mx-auto mb-5 size-16 rounded-full bg-[#0f766e] p-4 text-white"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                >
                  <path d="m5 12 4 4 10-10" />
                </svg>
                <h2
                  ref={completionHeading}
                  tabIndex={-1}
                  className="text-3xl font-bold text-[#111827] outline-none"
                >
                  Tarefa concluída
                </h2>
                <p className="mt-2">
                  Concluída em {formatTrackingMoment(task.completedAt)}.
                  Obrigado!
                </p>
              </section>
            )}
            <section
              hidden={editing}
              aria-labelledby="task-report"
              className="mt-4 rounded-2xl border border-[#e5e7eb] bg-white p-5"
            >
              <h2 id="task-report" className="sr-only">
                O que aconteceu
              </h2>
              <p className="whitespace-pre-wrap text-xl font-bold leading-snug">
                {task.description}
              </p>
              <dl className="mt-5 space-y-3 text-sm">
                <div className="grid grid-cols-[5rem_minmax(0,1fr)] gap-3">
                  <dt className="text-[#6b7280]">Onde</dt>
                  <dd>{task.location || "Não informado"}</dd>
                </div>
                <div className="grid grid-cols-[5rem_minmax(0,1fr)] gap-3">
                  <dt className="text-[#6b7280]">Pedido por</dt>
                  <dd>
                    {task.reporterName || "Não informado"}
                    {task.reporterUnitOrRole
                      ? ` · ${task.reporterUnitOrRole}`
                      : ""}
                  </dd>
                </div>
                <div className="grid grid-cols-[5rem_minmax(0,1fr)] gap-3">
                  <dt className="text-[#6b7280]">Quando</dt>
                  <dd>
                    <time dateTime={task.registeredAt}>
                      {formatTrackingMoment(task.registeredAt)}
                    </time>
                  </dd>
                </div>
              </dl>
            </section>
            {task.startedAt && !task.completedAt && !editing && (
              <p
                role="status"
                className="mt-4 rounded-xl bg-[#e6f4f1] p-5 text-[#0b5e58]"
              >
                Você começou às{" "}
                {new Intl.DateTimeFormat("pt-BR", {
                  timeZone: "America/Sao_Paulo",
                  hour: "2-digit",
                  minute: "2-digit",
                }).format(new Date(task.startedAt))}
                . Quando terminar, conclua a tarefa com uma foto do serviço
                feito.
              </p>
            )}
            {task.completedAt ? (
              <p className="mt-6 text-center text-sm text-[#4b5563]">
                Esta tarefa está encerrada. Se o síndico precisar de você de
                novo, ele manda um link novo.
              </p>
            ) : !task.canAct ? (
              <p
                role="status"
                className="mt-5 rounded-xl border border-[#cfd5df] bg-white p-4 text-sm"
              >
                Este link continua disponível para consulta, mas não permite
                mais alterações. Peça ao síndico o link da delegação atual.
              </p>
            ) : (
              <EmployeeTaskActions
                code={code}
                task={task}
                onEditing={setEditing}
                onMessageSent={() => setNotice((value) => value + 1)}
                onChanged={(value) => setState({ kind: "loaded", task: value })}
              />
            )}
          </>
        )}
      </div>
    </main>
  );
}
