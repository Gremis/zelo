"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { OccurrenceAttachment } from "./occurrence-attachment";
import { OccurrenceReopen } from "./occurrence-reopen";
import { OccurrenceWorkflow } from "./occurrence-workflow";
import { useRouter } from "next/navigation";
import { CopyTrackingLink } from "@/components/copy-tracking-link";
import { formatPhone } from "@/lib/auth/phone";
import { trackingLink } from "@/lib/occurrences/tracking-link";
import {
  addOccurrenceUpdate,
  loadOccurrenceDetail,
  OccurrenceRequestError,
  saveOccurrencePriority,
} from "@/lib/occurrences/detail-request";
import {
  formatOccurrenceDateTitle,
  formatQueueDate,
} from "@/lib/occurrences/format";
import {
  PRIORITY_CHANGE_REASONS,
  type OccurrenceDetail,
  type OccurrenceEvent,
  type PriorityChangeReason,
} from "@/server/occurrences/detail.contract";
import type {
  QueuePriority,
  QueueStatus,
} from "@/server/occurrences/queue.contract";

const priorityLabels: Record<QueuePriority, string> = {
  urgent: "Urgente",
  normal: "Normal",
  low: "Baixa",
};

const priorityColors: Record<QueuePriority, string> = {
  urgent: "text-[#b42318]",
  normal: "text-[#175cd3]",
  low: "text-[#475467]",
};

const statusLabels: Record<QueueStatus, string> = {
  new: "Novo",
  in_progress: "Em andamento",
  delegated: "Delegado",
  completed: "Concluído",
};

const changeReasonLabels: Record<PriorityChangeReason, string> = {
  greater_risk: "Risco maior do que parece",
  lower_risk: "Risco menor do que parece",
  already_handled: "Já está sendo resolvido",
  recurring: "Problema recorrente",
  other: "Outro",
};

function useNow() {
  const [now, setNow] = useState<Date>();
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) setNow(new Date());
    });
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
  return now;
}

function useDesktop() {
  const [desktop, setDesktop] = useState(() =>
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(min-width: 1001px)").matches
      : false,
  );
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(min-width: 1001px)");
    const update = () => setDesktop(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return desktop;
}

function loadMessage(status: number) {
  return status === 404
    ? "Ocorrência não encontrada."
    : status === 403
      ? "Acesso não autorizado."
      : status === 401
        ? "Sua sessão expirou. Entre novamente."
        : "Não foi possível carregar a ocorrência.";
}

function writeMessage(status: number) {
  return status === 404
    ? "Ocorrência não encontrada."
    : status === 409
      ? "Ocorrência concluída não aceita mudança de prioridade."
      : status === 401
        ? "Sua sessão expirou. Entre novamente."
        : "Não foi possível salvar a prioridade.";
}

function eventAuthor(event: OccurrenceEvent) {
  if (event.type === "registered")
    return (
      <>
        {event.authorPhone ? ` · ${formatPhone(event.authorPhone)}` : ""} (quem
        registrou)
      </>
    );
  if (event.authorType === "manager")
    return event.authorIsViewer ? " (síndico, você)" : " (síndico)";
  if (event.authorType === "employee") return " (funcionário)";
  return " (morador)";
}

export function OccurrenceDetailPanel({
  occurrenceId,
  onClose,
  onChanged,
}: {
  occurrenceId: string;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const router = useRouter();
  const [workflowBusy, setWorkflowBusy] = useState(false);
  const workflowLock = useRef(false);
  const desktop = useDesktop();
  const now = useNow();
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const [detail, setDetail] = useState<OccurrenceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [savingPriority, setSavingPriority] = useState(false);
  const [priorityError, setPriorityError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [savingUpdate, setSavingUpdate] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [updateStatus, setUpdateStatus] = useState<string | null>(null);
  const helpId = useId();
  const updateId = useId();
  const updateErrorId = useId();
  const priorityId = useId();
  const reasonId = useId();

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    loadOccurrenceDetail(occurrenceId, controller.signal)
      .then((data) => {
        if (!active) return;
        setDetail(data);
        setLoading(false);
      })
      .catch((error: unknown) => {
        if (!active) return;
        const status =
          error instanceof OccurrenceRequestError ? error.status : 503;
        setLoading(false);
        setNotFound(status === 404);
        setLoadError(loadMessage(status));
        if (status === 401) router.replace("/login");
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [attempt, occurrenceId, router]);

  useEffect(() => {
    const previous = document.activeElement;
    if (desktop) {
      const overflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      closeButton.current?.focus();
      return () => {
        document.body.style.overflow = overflow;
        if (previous instanceof HTMLElement) previous.focus();
      };
    }
    const scroll = window.scrollY;
    panel.current?.scrollIntoView?.({ block: "start" });
    closeButton.current?.focus({ preventScroll: true });
    return () => {
      if (scroll > 0)
        requestAnimationFrame(() => window.scrollTo({ top: scroll }));
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, [desktop]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented) return;
      if (
        event.target instanceof Element &&
        event.target.closest('[role="dialog"]') !== panel.current
      )
        return;
      if (event.key === "Escape") {
        if (event.target instanceof HTMLSelectElement) return;
        event.preventDefault();
        if (!workflowLock.current) onClose();
        return;
      }
      if (event.key !== "Tab" || !desktop) return;
      const focusable = panel.current?.querySelectorAll<HTMLElement>(
        'input:not([disabled]), button:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!panel.current?.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
        return;
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [desktop, onClose]);

  async function changePriority(priority: QueuePriority) {
    if (!detail || savingPriority) return;
    setSavingPriority(true);
    setPriorityError(null);
    try {
      const decision = await saveOccurrencePriority(detail.id, priority, null);
      setDetail((current) =>
        current
          ? {
              ...current,
              finalPriority: decision.finalPriority,
              suggestionPending: decision.suggestionPending,
              priorityChangeReason: decision.priorityChangeReason,
              effectivePriority:
                decision.finalPriority ?? current.suggestedPriority,
              priorityDecidedAt: decision.suggestionPending
                ? null
                : new Date().toISOString(),
            }
          : current,
      );
      const currentDetail = await loadOccurrenceDetail(detail.id).catch(
        () => null,
      );
      if (currentDetail)
        setDetail((current) =>
          currentDetail.version !== current?.version ? currentDetail : current,
        );
      onChanged?.();
    } catch (error) {
      const status =
        error instanceof OccurrenceRequestError ? error.status : 503;
      setPriorityError(writeMessage(status));
      if (status === 401) router.replace("/login");
    } finally {
      setSavingPriority(false);
    }
  }

  async function changeReason(reason: PriorityChangeReason | null) {
    if (!detail || detail.finalPriority === null || savingPriority) return;
    setSavingPriority(true);
    setPriorityError(null);
    try {
      const decision = await saveOccurrencePriority(
        detail.id,
        detail.finalPriority,
        reason,
      );
      setDetail((current) =>
        current
          ? {
              ...current,
              finalPriority: decision.finalPriority,
              suggestionPending: decision.suggestionPending,
              priorityChangeReason: decision.priorityChangeReason,
              effectivePriority:
                decision.finalPriority ?? current.suggestedPriority,
            }
          : current,
      );
      const currentDetail = await loadOccurrenceDetail(detail.id).catch(
        () => null,
      );
      if (currentDetail)
        setDetail((current) =>
          currentDetail.version !== current?.version ? currentDetail : current,
        );
      onChanged?.();
    } catch (error) {
      const status =
        error instanceof OccurrenceRequestError ? error.status : 503;
      setPriorityError(writeMessage(status));
      if (status === 401) router.replace("/login");
    } finally {
      setSavingPriority(false);
    }
  }

  async function submitUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detail || savingUpdate) return;
    if (!text.trim()) {
      setUpdateStatus(null);
      setUpdateError("Escreva a atualização.");
      return;
    }
    setSavingUpdate(true);
    setUpdateError(null);
    setUpdateStatus(null);
    try {
      await addOccurrenceUpdate(detail.id, text);
      setText("");
      setUpdateStatus("Atualização adicionada.");
      const refreshed = await loadOccurrenceDetail(detail.id).catch(() => null);
      if (refreshed) setDetail(refreshed);
    } catch (error) {
      const status =
        error instanceof OccurrenceRequestError ? error.status : 503;
      setUpdateError(
        status === 404
          ? "Ocorrência não encontrada."
          : status === 401
            ? "Sua sessão expirou. Entre novamente."
            : "Não foi possível adicionar a atualização.",
      );
      if (status === 401) router.replace("/login");
    } finally {
      setSavingUpdate(false);
    }
  }

  let content: ReactNode;
  if (loadError) {
    content = (
      <div className="px-5 pt-4 pb-6">
        <h2
          id={titleId}
          className="font-[family-name:var(--font-panel-heading)] text-lg font-bold"
        >
          Ocorrência
        </h2>
        <div
          role="alert"
          className="mt-3 rounded-[10px] border border-[#fecdca] bg-[#fffbfa] p-4"
        >
          <p className="font-semibold text-[#b42318]">{loadError}</p>
          {!notFound && (
            <button
              type="button"
              onClick={() => {
                setLoading(true);
                setLoadError(null);
                setAttempt((value) => value + 1);
              }}
              className="mt-3 cursor-pointer rounded-lg border border-[#d0d5dd] bg-white px-3 py-2 text-sm font-semibold text-[#111827] hover:border-[#6b7280]"
            >
              Tentar novamente
            </button>
          )}
        </div>
      </div>
    );
  } else if (!detail) {
    content = (
      <div className="px-5 pt-4 pb-6">
        <h2
          id={titleId}
          className="font-[family-name:var(--font-panel-heading)] text-lg font-bold"
        >
          Ocorrência
        </h2>
        <p role="status" className="mt-2 text-sm text-[#6b7280]">
          {loading ? "Carregando ocorrência…" : "Ocorrência indisponível."}
        </p>
      </div>
    );
  } else {
    const priority = detail.effectivePriority;
    const showReason =
      detail.finalPriority !== null &&
      detail.finalPriority !== detail.suggestedPriority;
    content = (
      <>
        <header className="px-5 pt-4">
          <div
            className={`flex flex-wrap items-center gap-2 text-xs ${detail.status === "completed" ? "min-h-8 pr-32" : "pr-10"}`}
          >
            <span className="font-mono font-medium text-[#6b7280]">
              #{detail.number}
            </span>
            <span className="font-semibold text-[#344054]">
              {detail.condominium.name}
            </span>
            <span className="rounded-full bg-[#eef0f3] px-2 py-0.5 font-semibold text-[#344054]">
              {statusLabels[detail.status]}
            </span>
          </div>
          <h2
            id={titleId}
            className="mt-2 pr-10 font-[family-name:var(--font-panel-heading)] text-xl leading-snug font-bold tracking-[-0.01em] [overflow-wrap:anywhere]"
          >
            {detail.description}
          </h2>
          <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs leading-[1.45] text-[#6b7280]">
            {detail.reporterUnitOrRole && (
              <span>Unidade {detail.reporterUnitOrRole}</span>
            )}
            {detail.location && <span>Onde {detail.location}</span>}
            <span>
              Registrada{" "}
              <time
                dateTime={detail.registeredAt}
                title={formatOccurrenceDateTitle(detail.registeredAt)}
                aria-label={formatOccurrenceDateTitle(detail.registeredAt)}
              >
                {formatQueueDate(detail.registeredAt, now)}
              </time>
            </span>
          </p>
        </header>
        <div className="mt-4 grid min-w-0 grid-cols-1 gap-4 border-t border-[#e5e7eb] px-5 pt-4 pb-5 min-[1001px]:grid-cols-[190px_1fr] min-[1001px]:gap-5">
          <aside
            aria-label="Dados do caso"
            className="min-w-0 space-y-4 rounded-xl bg-[#f2f4f7] p-3 min-[1001px]:rounded-none min-[1001px]:border-r min-[1001px]:border-[#e5e7eb] min-[1001px]:bg-transparent min-[1001px]:p-0 min-[1001px]:pr-5"
          >
            <div>
              <label
                htmlFor={priorityId}
                className="block text-[11px] font-bold tracking-[0.04em] text-[#6b7280] uppercase"
              >
                Prioridade
              </label>
              <select
                id={priorityId}
                value={priority ?? ""}
                disabled={
                  !detail.canDecidePriority || savingPriority || workflowBusy
                }
                onChange={(event) => {
                  const value = event.target.value as QueuePriority;
                  if (value) void changePriority(value);
                }}
                className={`mt-1.5 w-full cursor-pointer rounded-lg border border-[#d0d5dd] bg-white px-2.5 py-1.5 text-sm font-semibold disabled:cursor-not-allowed disabled:bg-[#f9fafb] ${priority ? priorityColors[priority] : "text-[#475467]"}`}
              >
                {priority === null && (
                  <option value="" disabled>
                    Sem prioridade
                  </option>
                )}
                {(Object.keys(priorityLabels) as QueuePriority[]).map(
                  (value) => (
                    <option key={value} value={value}>
                      {priorityLabels[value]}
                    </option>
                  ),
                )}
              </select>
              <p className="mt-2 text-xs leading-[1.45] text-[#6b7280]">
                {detail.suggestionPending
                  ? "Sugerida pelo Sindicondo"
                  : detail.suggestedPriority
                    ? `Sugerida: ${priorityLabels[detail.suggestedPriority]}`
                    : "Sem sugestão"}
              </p>
              {detail.suggestionReason && (
                <p className="mt-1 text-xs leading-[1.45] text-[#4b5563] [overflow-wrap:anywhere]">
                  <span className="font-semibold">Por quê:</span>{" "}
                  {detail.suggestionReason}
                </p>
              )}
              <p className="mt-1 text-xs leading-[1.45] text-[#4b5563]">
                <span className="font-semibold">Categoria:</span>{" "}
                {detail.category ?? "Não classificada"}
              </p>
              {priorityError && (
                <p role="alert" className="mt-2 text-xs text-[#b42318]">
                  {priorityError}
                </p>
              )}
            </div>
            {showReason && (
              <div>
                <label htmlFor={reasonId} className="sr-only">
                  Por que mudou? (opcional)
                </label>
                <select
                  id={reasonId}
                  value={detail.priorityChangeReason ?? ""}
                  disabled={
                    !detail.canDecidePriority || savingPriority || workflowBusy
                  }
                  onChange={(event) =>
                    void changeReason(
                      (event.target.value ||
                        null) as PriorityChangeReason | null,
                    )
                  }
                  className="w-full cursor-pointer rounded-lg border border-[#d0d5dd] bg-white px-2.5 py-1.5 text-xs text-[#344054] disabled:cursor-not-allowed disabled:bg-[#f9fafb]"
                >
                  <option value="">Por que mudou? (opcional)</option>
                  {PRIORITY_CHANGE_REASONS.map((value) => (
                    <option key={value} value={value}>
                      {changeReasonLabels[value]}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <fieldset
              disabled={savingPriority || savingUpdate}
              className="min-w-0"
            >
              <OccurrenceWorkflow
                key={`${detail.id}:${detail.events.find((event) => event.type === "reopened")?.id ?? 0}`}
                detail={detail}
                onBusy={(value) => {
                  workflowLock.current = value;
                  setWorkflowBusy(value);
                }}
                onChanged={(value) => {
                  setDetail(value);
                  onChanged?.();
                }}
              />
            </fieldset>
            <div>
              <h3 className="text-[11px] font-bold tracking-[0.04em] text-[#6b7280] uppercase">
                Registrada por
              </h3>
              <p className="mt-1.5 text-sm font-semibold text-[#111827] [overflow-wrap:anywhere]">
                {detail.reporterName ?? "Não informado"}
              </p>
              {detail.reporterPhone && (
                <p className="text-xs text-[#4b5563]">
                  {formatPhone(detail.reporterPhone)}
                </p>
              )}
              {detail.reporterUnitOrRole && (
                <p className="text-xs text-[#4b5563]">
                  {detail.reporterUnitOrRole}
                </p>
              )}
              <CopyTrackingLink
                link={trackingLink(detail.trackingCode)}
                label="Copiar link de acompanhamento"
                variant="link"
                className="mt-1.5"
              />
            </div>
          </aside>
          <section aria-labelledby={`${titleId}-activity`} className="min-w-0">
            <h3
              id={`${titleId}-activity`}
              className="text-[11px] font-bold tracking-[0.04em] text-[#6b7280] uppercase"
            >
              Atividade
            </h3>
            {detail.canDecidePriority && (
              <>
                <form
                  onSubmit={submitUpdate}
                  className="mt-2 rounded-xl border border-[#e5e7eb] bg-white p-3"
                >
                  <label htmlFor={updateId} className="sr-only">
                    Escreva uma atualização
                  </label>
                  <textarea
                    id={updateId}
                    value={text}
                    rows={3}
                    disabled={savingUpdate || workflowBusy}
                    aria-invalid={Boolean(updateError)}
                    aria-describedby={`${helpId}${updateError ? ` ${updateErrorId}` : ""}`}
                    onChange={(event) => {
                      setText(event.target.value);
                      if (updateError) setUpdateError(null);
                      if (updateStatus) setUpdateStatus(null);
                    }}
                    placeholder="Escreva uma atualização: uma visita, um orçamento, um combinado"
                    className="w-full resize-y border-0 bg-transparent p-0 text-sm leading-[1.45] text-[#111827] outline-none placeholder:text-[#98a2b3]"
                  />
                  <div className="mt-2 flex justify-end">
                    <button
                      type="submit"
                      disabled={savingUpdate || workflowBusy}
                      className="cursor-pointer rounded-lg bg-[#0b5e58] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[#0f766e] disabled:cursor-wait disabled:opacity-60"
                    >
                      Adicionar
                    </button>
                  </div>
                </form>
                <p
                  id={helpId}
                  className="mt-2 text-xs leading-[1.45] text-[#6b7280]"
                >
                  Só você vê. O morador não vê as atualizações.
                </p>
                {updateError && (
                  <p
                    id={updateErrorId}
                    role="alert"
                    className="mt-1 text-xs text-[#b42318]"
                  >
                    {updateError}
                  </p>
                )}
                {updateStatus && (
                  <p role="status" className="mt-1 text-xs text-[#0b5e58]">
                    {updateStatus}
                  </p>
                )}
              </>
            )}
            {detail.events.length ? (
              <ol
                aria-label="Histórico da ocorrência"
                className="mt-4 space-y-3"
              >
                {detail.events.map((event) => (
                  <li key={event.id}>
                    <p className="text-xs leading-[1.45] text-[#6b7280]">
                      <time
                        dateTime={event.occurredAt}
                        title={formatOccurrenceDateTitle(event.occurredAt)}
                        aria-label={formatOccurrenceDateTitle(event.occurredAt)}
                      >
                        {formatQueueDate(event.occurredAt, now)}
                      </time>
                      {" · "}
                      <span className="font-medium text-[#344054]">
                        {event.authorName}
                      </span>
                      {eventAuthor(event)}
                    </p>
                    <p className="mt-0.5 text-sm leading-[1.45] text-[#344054] [overflow-wrap:anywhere]">
                      {event.text}
                    </p>
                    {event.attachments?.map((file) => (
                      <OccurrenceAttachment
                        key={file.id}
                        occurrenceId={detail.id}
                        file={file}
                      />
                    ))}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-4 text-sm text-[#6b7280]">
                Nenhuma atividade registrada.
              </p>
            )}
          </section>
        </div>
      </>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-black/40 px-4 py-8 max-[1000px]:static max-[1000px]:overflow-visible max-[1000px]:bg-transparent max-[1000px]:p-0"
      onMouseDown={(event) => {
        if (
          desktop &&
          event.target === event.currentTarget &&
          !workflowLock.current
        )
          onClose();
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal={desktop ? true : undefined}
        aria-labelledby={titleId}
        className="relative mx-auto w-full max-w-[720px] rounded-xl bg-white shadow-[0_20px_50px_rgba(16,24,40,0.2)] max-[1000px]:max-w-none max-[1000px]:rounded-xl max-[1000px]:border max-[1000px]:border-[#e5e7eb] max-[1000px]:shadow-none"
      >
        <div className="absolute top-3 right-3 flex items-center gap-2">
          {detail?.status === "completed" && (
            <OccurrenceReopen
              key={detail.id}
              detail={detail}
              onBusy={(value) => {
                workflowLock.current = value;
                setWorkflowBusy(value);
              }}
              onChanged={(value) => {
                setDetail(value);
                onChanged?.();
                queueMicrotask(() => closeButton.current?.focus());
              }}
            />
          )}
          <button
            ref={closeButton}
            type="button"
            aria-label="Fechar"
            disabled={workflowBusy}
            onClick={onClose}
            className="grid size-8 cursor-pointer place-items-center rounded-lg border border-[#e5e7eb] bg-white text-[#475467] hover:bg-[#f2f4f7]"
          >
            <svg
              viewBox="0 0 20 20"
              aria-hidden="true"
              className="size-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            >
              <path d="M5 5l10 10M15 5L5 15" />
            </svg>
          </button>
        </div>
        {content}
      </div>
    </div>
  );
}
