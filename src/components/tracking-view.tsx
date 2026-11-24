import {
  formatTrackingMoment,
  trackingLink,
} from "@/lib/occurrences/tracking-link";
import {
  TRACKING_STEPS,
  TRACKING_STEP_LABELS,
  type OccurrenceTracking,
} from "@/server/occurrences/tracking.contract";

export function TrackingView({
  tracking,
  code,
}: {
  tracking: OccurrenceTracking;
  code: string;
}) {
  const current = TRACKING_STEPS.indexOf(tracking.situation.step);
  return (
    <main className="min-h-dvh flex-1 bg-[#f6f7f9] px-4 py-4 text-sm leading-[1.45] text-[#111827] [color-scheme:light] [font-family:var(--font-geist-sans),system-ui,sans-serif] [overflow-wrap:anywhere] sm:px-6 sm:py-8">
      <div className="mx-auto w-full max-w-2xl">
        <header className="rounded-xl bg-[#0f766e] px-4 py-3.5 text-white sm:px-5">
          <p className="text-lg font-bold leading-tight">
            {tracking.condominiumName}
          </p>
          <h1 className="mt-1.5 text-sm font-medium">
            Ocorrência #{tracking.number} · registrada{" "}
            <time dateTime={tracking.registeredAt}>
              {formatTrackingMoment(tracking.registeredAt)}
            </time>
          </h1>
        </header>

        <section
          aria-labelledby="tracking-report"
          className="mt-4 rounded-xl border border-[#e5e7eb] bg-white p-4"
        >
          <h2 id="tracking-report" className="text-base leading-snug font-bold">
            {tracking.description}
          </h2>
          <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-[#4b5563]">
            {tracking.unit && (
              <div className="flex min-w-0 gap-1">
                <dt className="font-semibold">Unidade</dt>
                <dd>{tracking.unit}</dd>
              </div>
            )}
            {tracking.location && (
              <div className="flex min-w-0 gap-1">
                <dt className="font-semibold">Onde</dt>
                <dd>{tracking.location}</dd>
              </div>
            )}
          </dl>
        </section>

        <section
          aria-labelledby="tracking-situation"
          className="mt-4 rounded-xl border border-[#e5e7eb] bg-white p-4"
        >
          <h2 id="tracking-situation" className="text-base font-bold">
            Situação
          </h2>
          <ol aria-label="Etapas da ocorrência" className="mt-3 space-y-3">
            {TRACKING_STEPS.map((value, index) => {
              const reached = index <= current;
              const active = index === current;
              return (
                <li
                  key={value}
                  aria-current={active ? "step" : undefined}
                  className={`flex items-start gap-2.5 rounded-lg px-2 py-1.5 ${
                    active ? "bg-[#e6f4f1] font-semibold" : ""
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border-2 ${
                      reached
                        ? "border-[#0f766e] bg-[#0f766e] text-white"
                        : "border-[#cfd5df] bg-white text-[#6b7280]"
                    }`}
                  >
                    {reached ? (
                      <svg
                        viewBox="0 0 20 20"
                        className="size-3"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M4 10.5l4 4 8-9" />
                      </svg>
                    ) : (
                      <span className="text-[11px]">{index + 1}</span>
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="sr-only">
                      {active
                        ? "Etapa atual: "
                        : reached
                          ? "Etapa cumprida: "
                          : "Etapa futura: "}
                    </span>
                    {TRACKING_STEP_LABELS[value]}
                  </span>
                </li>
              );
            })}
          </ol>
        </section>

        <section
          aria-labelledby="tracking-updates"
          className="mt-4 rounded-xl border border-[#e5e7eb] bg-white p-4"
        >
          <h2 id="tracking-updates" className="text-base font-bold">
            Atualizações
          </h2>
          {tracking.updates.length ? (
            <ol
              aria-label="Atualizações da ocorrência"
              className="mt-3 space-y-3"
            >
              {tracking.updates.map((update) => (
                <li key={`${update.occurredAt}-${update.text}`}>
                  <p className="text-xs text-[#6b7280]">
                    <time dateTime={update.occurredAt}>
                      {formatTrackingMoment(update.occurredAt)}
                    </time>
                  </p>
                  <p className="mt-0.5 text-sm text-[#344054]">{update.text}</p>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-2 text-sm text-[#6b7280]">
              Nenhuma atualização até agora.
            </p>
          )}
        </section>

        <footer className="mt-4 pb-6 text-sm leading-[1.45] text-[#6b7280]">
          Este link mostra só esta ocorrência. Para registrar outra, use o link
          do condomínio.
        </footer>
        <p className="sr-only">
          Endereço desta ocorrência: <span>{trackingLink(code)}</span>
        </p>
      </div>
    </main>
  );
}
