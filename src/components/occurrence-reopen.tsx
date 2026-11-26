"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { OccurrenceDetail } from "@/server/occurrences/detail.contract";
import {
  sendWorkflowCommand,
  type WorkflowCommand,
} from "@/lib/occurrences/workflow-request";
import {
  loadOccurrenceDetail,
  OccurrenceRequestError,
} from "@/lib/occurrences/detail-request";

const buttonClass =
  "min-h-10 cursor-pointer rounded-lg border border-[#0b5e58] px-3 py-2 text-sm font-semibold text-[#0b5e58] disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f766e]";
export function OccurrenceReopen({
  detail,
  onChanged,
  onBusy,
}: {
  detail: OccurrenceDetail;
  onChanged: (value: OccurrenceDetail) => void;
  onBusy: (value: boolean) => void;
}) {
  const titleId = useId(),
    reasonId = useId(),
    errorId = useId();
  const [open, setOpen] = useState(false),
    [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false),
    [pending, setPending] = useState<WorkflowCommand | null>(null),
    [error, setError] = useState<string | null>(null),
    [conflict, setConflict] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null),
    field = useRef<HTMLTextAreaElement>(null),
    dialog = useRef<HTMLDivElement>(null),
    lock = useRef(false);
  const storageKey = `occurrence-reopen:${detail.id}`;
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      try {
        const saved = sessionStorage.getItem(storageKey);
        if (saved) {
          const command = JSON.parse(saved) as WorkflowCommand;
          if (
            command.type === "reopen" &&
            typeof command.payload.reason === "string"
          ) {
            setPending(command);
            setReason(command.payload.reason);
            setOpen(true);
            setError(
              "Há uma reabertura sem confirmação. Tente novamente para consultar o resultado.",
            );
          }
        }
      } catch {
        setError("Não foi possível recuperar a tentativa anterior.");
      }
    });
    return () => {
      active = false;
    };
  }, [storageKey]);
  useEffect(() => {
    if (open && !busy) {
      const target = field.current?.disabled
        ? dialog.current?.querySelector<HTMLButtonElement>(
            'button[type="submit"]',
          )
        : field.current;
      target?.focus();
    }
  }, [open, busy]);
  function forget() {
    try {
      sessionStorage.removeItem(storageKey);
    } catch {
      return;
    }
  }
  function cancel() {
    if (lock.current) return;
    setOpen(false);
    setReason(pending?.payload.reason ?? "");
    setError(null);
    setConflict(false);
    if (!pending) forget();
    trigger.current?.focus();
  }
  async function submit() {
    if (lock.current || conflict) return;
    const command = pending ?? {
      key: crypto.randomUUID(),
      version: detail.version ?? 0,
      type: "reopen" as const,
      payload: { reason: reason.trim() },
    };
    lock.current = true;
    setBusy(true);
    onBusy(true);
    setError(null);
    setPending(command);
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(command));
    } catch {
      setError("Mantenha esta janela aberta para recuperar o resultado.");
    }
    try {
      const receipt = await sendWorkflowCommand(detail.id, command);
      const result =
        (receipt.version ?? 0) < (detail.version ?? 0)
          ? await loadOccurrenceDetail(detail.id)
          : receipt;
      forget();
      setPending(null);
      setOpen(false);
      onChanged(result);
    } catch (cause) {
      const status =
        cause instanceof OccurrenceRequestError ? cause.status : 503;
      if (status === 409) {
        forget();
        setPending(null);
        setConflict(true);
        setError(
          "A ocorrência foi alterada. Atualize os dados antes de tentar novamente.",
        );
      } else if (
        status === 400 ||
        status === 401 ||
        status === 403 ||
        status === 404
      ) {
        forget();
        setPending(null);
        setError(
          status === 400
            ? "Confira o motivo informado."
            : "Sua sessão ou seu acesso à ocorrência não está disponível.",
        );
      } else
        setError(
          "Não foi possível confirmar a reabertura. Tente novamente com o mesmo motivo para recuperar o resultado.",
        );
    } finally {
      lock.current = false;
      setBusy(false);
      onBusy(false);
    }
  }
  async function refresh() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    onBusy(true);
    try {
      const current = await loadOccurrenceDetail(detail.id);
      setConflict(false);
      setError(null);
      onChanged(current);
      if (current.status !== "completed") setOpen(false);
    } catch {
      setError("Não foi possível atualizar a ocorrência. Tente novamente.");
    } finally {
      lock.current = false;
      setBusy(false);
      onBusy(false);
    }
  }
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="min-h-8 cursor-pointer rounded-lg border border-[#d0d5dd] bg-white px-2.5 py-1 text-sm font-semibold text-[#111827] hover:border-[#6b7280] disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f766e]"
        disabled={busy}
        onClick={() => {
          setOpen(true);
          setError(
            pending
              ? "Há uma reabertura sem confirmação. Tente novamente para consultar o resultado."
              : null,
          );
        }}
      >
        Reabrir
      </button>
      {open && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-black/40 p-4"
          onMouseDown={(event) => {
            event.stopPropagation();
            if (event.target === event.currentTarget) cancel();
          }}
        >
          <div
            ref={dialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-busy={busy}
            className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                cancel();
              }
              if (event.key === "Tab") {
                event.stopPropagation();
                const nodes = dialog.current?.querySelectorAll<HTMLElement>(
                  "button:not(:disabled),textarea:not(:disabled)",
                );
                if (!nodes?.length) return;
                const first = nodes[0],
                  last = nodes[nodes.length - 1];
                if (event.shiftKey && document.activeElement === first) {
                  event.preventDefault();
                  last.focus();
                } else if (!event.shiftKey && document.activeElement === last) {
                  event.preventDefault();
                  first.focus();
                }
              }
            }}
          >
            <h3 id={titleId} className="text-lg font-bold text-[#111827]">
              Reabrir #{detail.number}?
            </h3>
            <p className="mt-2 text-sm text-[#475467]">
              A ocorrência voltará para Novo, sem responsável e sem previsão. O
              histórico e a prioridade serão preservados.
            </p>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void submit();
              }}
            >
              <label
                htmlFor={reasonId}
                className="mt-4 block text-sm font-semibold"
              >
                Motivo <span className="font-normal">(opcional)</span>
              </label>
              <textarea
                ref={field}
                id={reasonId}
                rows={4}
                maxLength={10000}
                value={reason}
                disabled={busy || !!pending}
                aria-describedby={error ? errorId : undefined}
                className="mt-1 w-full min-w-0 rounded-lg border border-[#d0d5dd] p-2 text-sm focus-visible:outline-2 focus-visible:outline-[#0f766e]"
                onChange={(event) => setReason(event.target.value)}
              />
              {busy && (
                <p role="status" className="mt-2 text-sm">
                  Reabrindo…
                </p>
              )}
              {error && (
                <p
                  id={errorId}
                  role="alert"
                  className="mt-2 text-sm text-[#b42318]"
                >
                  {error}
                </p>
              )}
              <div className="mt-4 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  className={buttonClass}
                  disabled={busy}
                  onClick={cancel}
                >
                  Cancelar
                </button>
                {conflict ? (
                  <button
                    type="button"
                    className={buttonClass}
                    disabled={busy}
                    onClick={() => void refresh()}
                  >
                    Atualizar dados
                  </button>
                ) : (
                  <button
                    type="submit"
                    className={`${buttonClass} bg-[#0b5e58] text-white`}
                    disabled={busy}
                  >
                    Reabrir
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
