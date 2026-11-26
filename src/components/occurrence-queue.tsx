"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { PanelPageTitle } from "./panel-page-title";
import { OccurrenceDetailPanel } from "./occurrence-detail";
import {
  formatOccurrenceDateTitle,
  formatQueueDate,
} from "@/lib/occurrences/format";
import type {
  PortfolioQueue,
  QueueCard,
  QueuePriority,
  QueueStatus,
} from "@/server/occurrences/queue.contract";

export { formatQueueDate } from "@/lib/occurrences/format";

export type QueuePresentation =
  | { status: "loading" }
  | { status: "error"; onRetry: () => void; message?: string }
  | { status: "success"; data: PortfolioQueue };

const columns: { status: QueueStatus; title: string; empty: string }[] = [
  { status: "new", title: "Novo", empty: "Nenhuma ocorrência nova." },
  {
    status: "in_progress",
    title: "Em andamento",
    empty: "Nenhuma ocorrência em andamento.",
  },
  {
    status: "delegated",
    title: "Delegado",
    empty: "Nenhuma ocorrência delegada.",
  },
  {
    status: "completed",
    title: "Concluído",
    empty: "Nenhuma ocorrência concluída.",
  },
];
const mobileQuery = "(max-width: 1000px)";

function subscribeToViewport(onChange: () => void) {
  if (!window.matchMedia) return () => {};
  const query = window.matchMedia(mobileQuery);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function isMobileViewport() {
  return window.matchMedia?.(mobileQuery).matches ?? false;
}

const priorities: Record<
  QueuePriority | "unclassified",
  { title: string; badge: string; border: string; dot: string }
> = {
  urgent: {
    title: "Urgente",
    badge: "bg-[#fee4e2] text-[#b42318]",
    border: "border-l-[#b42318]",
    dot: "bg-[#b42318]",
  },
  normal: {
    title: "Normal",
    badge: "bg-[#dbeafe] text-[#175cd3]",
    border: "border-l-[#175cd3]",
    dot: "bg-[#175cd3]",
  },
  low: {
    title: "Baixa",
    badge: "bg-[#eef0f3] text-[#475467]",
    border: "border-l-[#475467]",
    dot: "bg-[#475467]",
  },
  unclassified: {
    title: "Sem classificação",
    badge: "bg-[#f2f4f7] text-[#475467]",
    border: "border-l-[#98a2b3]",
    dot: "bg-[#98a2b3]",
  },
};

function Report({ text }: { text: string }) {
  const id = useId();
  const element = useRef<HTMLHeadingElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [clipped, setClipped] = useState(false);
  useEffect(() => {
    const node = element.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    let active = true;
    const measure = () => {
      if (active && !expanded)
        setClipped(node.scrollHeight > node.clientHeight + 1);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    void document.fonts?.ready.then(measure);
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [expanded, text]);
  return (
    <div>
      <h3
        ref={element}
        id={id}
        className={`text-sm leading-[1.45] font-semibold [overflow-wrap:anywhere] ${expanded ? "" : "line-clamp-2"}`}
      >
        {text}
      </h3>
      {clipped && (
        <button
          type="button"
          aria-controls={id}
          aria-expanded={expanded}
          onClick={(event) => {
            event.stopPropagation();
            setExpanded(!expanded);
          }}
          className="mt-1 cursor-pointer text-xs font-medium text-[#0b5e58] underline underline-offset-2 hover:text-[#0f766e]"
        >
          {expanded ? "Recolher relato" : "Ler relato completo"}
        </button>
      )}
    </div>
  );
}

export function OccurrenceCard({
  item,
  onOpen,
  now,
}: {
  item: QueueCard;
  now?: Date;
  onOpen?: (id: string) => void;
}) {
  const style = priorities[item.effectivePriority ?? "unclassified"];
  const fullDate = formatOccurrenceDateTitle(item.registeredAt);
  const id = useId();
  return (
    <article
      aria-labelledby={id}
      onClick={onOpen ? () => onOpen(item.id) : undefined}
      className={`flex min-w-0 flex-col gap-[5px] rounded-[10px] border border-[#e5e7eb] border-l-4 ${style.border} bg-white px-3 py-[11px] ${onOpen ? "cursor-pointer" : ""}`}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <span
          className={`rounded-full px-[9px] py-1 text-xs leading-[1.45] font-bold ${style.badge}`}
        >
          {style.title}
        </span>
        {item.suggestionPending && (
          <span className="text-[11px] font-medium text-[#6b7280]">
            sugerida
          </span>
        )}
        {item.isDemo && (
          <span
            title="Dados de demonstração"
            className="rounded border border-[#e5e7eb] px-1 text-[10px] leading-4 font-medium text-[#6b7280]"
          >
            <span aria-hidden="true">Demo</span>
            <span className="sr-only">Dados de demonstração</span>
          </span>
        )}
        <span
          id={id}
          className="ml-auto font-mono text-[11.5px] font-medium text-[#6b7280]"
        >
          #{item.number}
        </span>
      </div>
      <p className="text-xs leading-[1.45] text-[#4b5563] [overflow-wrap:anywhere]">
        {item.condominium.name}
        {item.reporterUnitOrRole && <> · {item.reporterUnitOrRole}</>}
      </p>
      <Report text={item.description} />
      {item.status === "new" && item.suggestionReason && (
        <p className="text-xs leading-[1.45] text-[#4b5563] [overflow-wrap:anywhere]">
          {item.suggestionReason}
        </p>
      )}
      <footer className="mt-0.5 border-t border-[#e5e7eb] pt-1.5 text-xs leading-[1.45] text-[#6b7280] [overflow-wrap:anywhere]">
        {item.reporterName && <>{item.reporterName} · </>}
        <time
          dateTime={item.registeredAt}
          title={fullDate}
          aria-label={fullDate}
        >
          {formatQueueDate(item.registeredAt, now)}
        </time>
      </footer>
      {item.responsibleName && (
        <p className="text-xs text-[#475467] [overflow-wrap:anywhere]">
          Responsável: {item.responsibleName}
        </p>
      )}
      {item.dueDate && (
        <p className="text-xs text-[#475467]">
          Previsão: {item.dueDate.split("-").reverse().join("/")}
        </p>
      )}
      {onOpen && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onOpen(item.id);
          }}
          className="cursor-pointer text-xs font-semibold text-[#0b5e58] underline underline-offset-2"
        >
          Abrir ocorrência #{item.number}
        </button>
      )}
    </article>
  );
}

export function OccurrenceQueue({
  state,
  onOpenOccurrence,
  detail,
}: {
  state: QueuePresentation;
  onOpenOccurrence?: (id: string) => void;
  detail?: {
    id: string;
    onClose: () => void;
    onChanged?: () => void;
  } | null;
}) {
  const [selected, setSelected] = useState<QueueStatus>("new");
  const mobile = useSyncExternalStore(
    subscribeToViewport,
    isMobileViewport,
    () => false,
  );
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const queueRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement)) return;
    if (
      mobile &&
      queueRef.current?.contains(active) &&
      active.closest("[data-status]")?.getAttribute("data-status") !== selected
    ) {
      tabRefs.current[
        columns.findIndex(({ status }) => status === selected)
      ]?.focus();
    } else if (
      !mobile &&
      tabRefs.current.includes(active as HTMLButtonElement)
    ) {
      queueRef.current
        ?.querySelector<HTMLElement>(`[data-status="${selected}"]`)
        ?.focus();
    }
  }, [mobile, selected]);
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
  const id = useId();
  const data = state.status === "success" ? state.data : null;
  const empty =
    data && columns.every(({ status }) => data.columns[status].count === 0);
  return (
    <section aria-label="Fila de ocorrências" className="min-w-0">
      <PanelPageTitle className="focus:outline-none font-[family-name:var(--font-panel-heading)] text-2xl leading-[1.45] font-bold tracking-[-0.01em]">
        Fila de ocorrências
      </PanelPageTitle>
      <p className="mt-1.5 max-w-[600px] text-sm leading-[1.45] text-[#4b5563]">
        Acompanhe as ocorrências de todos os seus condomínios. Nas colunas
        abertas, as prioridades e os relatos mais antigos vêm primeiro. Confira
        a sugestão e o motivo dos novos relatos.
      </p>
      {data && (
        <dl
          aria-label="Ocorrências abertas por prioridade"
          className="mt-[18px] flex flex-wrap items-center gap-x-3.5 gap-y-2 text-sm text-[#4b5563]"
        >
          {(
            [
              "urgent",
              "normal",
              "low",
              ...(data.openByPriority.unclassified
                ? ["unclassified" as const]
                : []),
            ] as const
          ).map((key) => (
            <div key={key} className="flex items-center gap-1">
              <dt className="flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className={`size-2 shrink-0 rounded-full ${priorities[key].dot}`}
                />
                {priorities[key].title}
              </dt>
              <dd className="font-bold text-[#111827]">
                {data.openByPriority[key]}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {state.status === "loading" && (
        <p role="status" className="mt-[18px] text-sm text-[#475467]">
          Carregando ocorrências…
        </p>
      )}
      {detail && (
        <OccurrenceDetailPanel
          occurrenceId={detail.id}
          onClose={detail.onClose}
          onChanged={detail.onChanged}
        />
      )}
      {state.status === "error" ? (
        <div
          role="alert"
          className="mt-[18px] rounded-[10px] border border-[#fecdca] bg-white p-4"
        >
          <p className="font-semibold text-[#b42318]">
            {state.message ?? "Não foi possível carregar a fila."}
          </p>
          <p className="mt-1 text-sm text-[#4b5563]">
            Tente novamente para consultar as ocorrências.
          </p>
          <button
            type="button"
            onClick={state.onRetry}
            className="mt-3 cursor-pointer rounded-lg border border-[#d0d5dd] bg-white px-3 py-2 text-sm font-semibold text-[#111827] hover:border-[#6b7280]"
          >
            Tentar novamente
          </button>
        </div>
      ) : (
        <div className={detail ? "max-[1000px]:hidden" : undefined}>
          {empty && (
            <div className="mt-[18px] rounded-[10px] border border-[#e5e7eb] bg-white p-4">
              <h2 className="text-sm font-semibold">
                Nenhuma ocorrência por enquanto
              </h2>
              <p className="mt-1 text-sm text-[#6b7280]">
                Os novos relatos da sua carteira aparecerão aqui.
              </p>
            </div>
          )}
          <div
            role="tablist"
            aria-label="Status das ocorrências"
            className="mt-[18px] grid min-w-0 grid-cols-4 rounded-[10px] border border-[#d0d5dd] bg-white p-0.5 [@media(width>1000px)]:hidden"
          >
            {columns.map(({ status, title }, index) => (
              <button
                key={status}
                ref={(node) => {
                  tabRefs.current[index] = node;
                }}
                type="button"
                role="tab"
                id={`${id}-tab-${status}`}
                aria-controls={`${id}-panel-${status}`}
                aria-selected={selected === status}
                tabIndex={selected === status ? 0 : -1}
                onClick={() => setSelected(status)}
                onKeyDown={(event) => {
                  const next =
                    event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? columns.length - 1
                        : event.key === "ArrowRight"
                          ? (index + 1) % columns.length
                          : event.key === "ArrowLeft"
                            ? (index + columns.length - 1) % columns.length
                            : null;
                  if (next === null) return;
                  event.preventDefault();
                  setSelected(columns[next].status);
                  tabRefs.current[next]?.focus();
                }}
                className={`flex min-h-14 min-w-0 cursor-pointer flex-col items-center justify-center rounded-lg px-0.5 py-2 text-[11px] leading-[1.45] font-semibold [overflow-wrap:anywhere] min-[390px]:text-xs [@media(width>560px)]:min-h-11 [@media(width>560px)]:flex-row [@media(width>560px)]:gap-1.5 [@media(width>560px)]:text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f766e] ${selected === status ? "bg-[#111827] text-white" : "text-[#4b5563] hover:bg-[#f2f4f7]"}`}
              >
                <span>{status === "in_progress" ? "Andamento" : title}</span>
                <span>{data ? data.columns[status].count : "—"}</span>
              </button>
            ))}
          </div>
          <div
            ref={queueRef}
            aria-busy={state.status === "loading"}
            className="mt-[18px] grid min-w-0 grid-cols-1 items-start gap-3 [@media(width>1000px)]:grid-cols-4"
          >
            {columns.map(({ status, title, empty: message }) => (
              <section
                key={status}
                id={`${id}-panel-${status}`}
                data-status={status}
                role={mobile ? "tabpanel" : undefined}
                aria-labelledby={
                  mobile ? `${id}-tab-${status}` : `${id}-${status}`
                }
                tabIndex={0}
                className={`${selected === status ? "flex" : "hidden [@media(width>1000px)]:flex"} min-w-0 flex-col gap-2 rounded-xl bg-[#eef0f3] p-2.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f766e]`}
              >
                <div className="hidden min-w-0 items-center gap-2 px-1 pt-0.5 pb-1 [@media(width>1000px)]:flex">
                  <h2
                    id={`${id}-${status}`}
                    className="min-w-0 font-[family-name:var(--font-panel-heading)] text-[14.5px] leading-[1.45] font-bold"
                  >
                    {title}
                  </h2>
                  <span
                    aria-label={`${data ? data.columns[status].count : "Carregando"} em ${title}`}
                    className="rounded-full border border-[#e5e7eb] bg-white px-2 text-xs leading-5 font-semibold"
                  >
                    {data ? data.columns[status].count : "—"}
                  </span>
                </div>
                {data ? (
                  data.columns[status].items.length ? (
                    data.columns[status].items.map((item) => (
                      <OccurrenceCard
                        key={item.id}
                        item={item}
                        now={now}
                        onOpen={onOpenOccurrence}
                      />
                    ))
                  ) : (
                    <p className="px-1.5 py-4 text-center text-[12.5px] leading-[1.45] text-[#475467]">
                      {message}
                    </p>
                  )
                ) : (
                  <div
                    aria-hidden="true"
                    className="h-32 rounded-[10px] border border-[#e5e7eb] bg-white motion-safe:animate-pulse"
                  />
                )}
              </section>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
