"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { FormEvent } from "react";
import { CopyTrackingLink } from "@/components/copy-tracking-link";
import { PhoneInput } from "@/components/phone-input";
import { trackingLink } from "@/lib/occurrences/tracking-link";
import {
  MANAGER_CHANNELS,
  type ManagerCondominium,
  type ManagerOccurrenceOperations,
  type ManagerRegistrationErrors,
  type ManagerRegistrationFields,
} from "@/lib/manager-occurrences/contract";
import { createManagerOccurrenceOperations } from "@/lib/manager-occurrences/operations";
import {
  emptyRegistration,
  validateRegistration,
} from "@/lib/manager-occurrences/validation";

const defaultOperations = createManagerOccurrenceOperations();

const fieldStyle =
  "w-full rounded-lg border border-[#D0D5DD] bg-white px-2.5 py-2 text-[13px] font-semibold text-[#111827] aria-invalid:border-[#b42318] disabled:bg-[#eef0f3] disabled:text-[#4b5563]";
const selectStyle =
  "h-[35px] w-full rounded-lg border border-[#D0D5DD] bg-white px-2.5 text-[13px] font-semibold text-[#111827] aria-invalid:border-[#b42318] disabled:bg-[#eef0f3]";
const labelStyle = "mb-1 block text-[13px] font-semibold text-[#111827]";
const errorStyle = "mt-1 text-[12px] font-medium text-[#b42318]";
const primaryBtn =
  "rounded-lg bg-[#0F766E] px-3.5 py-2 text-[14px] font-semibold text-white hover:bg-[#0b5e58] disabled:cursor-wait disabled:opacity-60";
const secondaryBtn =
  "rounded-lg border border-[#D0D5DD] bg-white px-3.5 py-2 text-[14px] font-semibold text-[#111827] hover:bg-[#f0f2f5]";
const closeBtn =
  "rounded-lg border border-[#D0D5DD] bg-white px-2.5 py-[5px] text-[13px] font-semibold text-[#111827] hover:bg-[#f0f2f5]";

type CondoState =
  | { status: "loading" }
  | { status: "ready"; list: ManagerCondominium[] }
  | { status: "error"; kind: "unauthorized" | "unavailable" };

export function ManagerOccurrenceForm({
  onClose,
  onRegistered,
  operations = defaultOperations,
}: {
  onClose: () => void;
  onRegistered?: () => void;
  operations?: ManagerOccurrenceOperations;
}) {
  const id = useId();
  const [condos, setCondos] = useState<CondoState>({ status: "loading" });
  const [fields, setFields] = useState<ManagerRegistrationFields>(
    emptyRegistration(),
  );
  const [errors, setErrors] = useState<ManagerRegistrationErrors>({});
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [receipt, setReceipt] = useState<{
    number: number;
    trackingCode: string;
  } | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    void operations
      .loadCondominiums(controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        if (!result.ok) {
          setCondos({ status: "error", kind: result.error });
          return;
        }
        setCondos({ status: "ready", list: result.data });
        if (result.data.length === 1)
          setFields((previous) => ({
            ...previous,
            condominiumId: result.data[0].id,
          }));
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setCondos({ status: "error", kind: "unavailable" });
      });
    return () => controller.abort();
  }, [operations]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !sending) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, sending]);

  function change(name: keyof ManagerRegistrationFields, value: string) {
    if (sending) return;
    setFields((previous) => ({ ...previous, [name]: value }));
    setErrors((previous) => ({ ...previous, [name]: undefined }));
    setMessage("");
  }

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    if (busy.current) return;
    const invalid = validateRegistration(fields);
    if (Object.keys(invalid).length) {
      setErrors(invalid);
      setMessage("Confira os campos indicados.");
      return;
    }
    busy.current = true;
    setSending(true);
    setMessage("");
    setErrors({});
    try {
      const result = await operations.register(fields);
      if (result.ok) {
        setReceipt({ number: result.number, trackingCode: result.trackingCode });
        onRegistered?.();
      } else if (result.error === "invalid_input") {
        setErrors(result.fields);
        setMessage("Confira os dados informados e envie novamente.");
      } else if (result.error === "unauthorized") {
        setMessage("Sua sessão expirou. Entre novamente para registrar.");
      } else if (result.error === "not_found") {
        setMessage("Condomínio não encontrado na sua carteira.");
      } else {
        setMessage(
          "Não foi possível confirmar o registro. Verifique a fila antes de tentar de novo.",
        );
      }
    } catch {
      setMessage("Não foi possível registrar agora. Tente novamente.");
    } finally {
      busy.current = false;
      setSending(false);
    }
  }

  function reset() {
    const onlyOne =
      condos.status === "ready" && condos.list.length === 1
        ? condos.list[0].id
        : "";
    setFields({ ...emptyRegistration(), condominiumId: onlyOne });
    setErrors({});
    setMessage("");
    setReceipt(null);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-[rgba(17,24,39,0.32)]"
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${id}-title`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !sending) onClose();
      }}
    >
      <aside className="flex h-full w-full max-w-[520px] flex-col overflow-y-auto bg-white px-5 py-4 text-[14px] leading-[1.45] text-[#111827] shadow-[-12px_0_32px_rgba(17,24,39,0.14)] [font-family:var(--font-geist-sans),system-ui,sans-serif] sm:px-6">
        <div className="flex items-start justify-between gap-4">
          <h2
            id={`${id}-title`}
            className="text-[18px] font-bold leading-[1.45] tracking-[-0.18px] text-[#111827] [font-family:var(--font-panel-heading),var(--font-geist-sans),system-ui,sans-serif]"
          >
            Registrar ocorrência
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={sending}
            className={closeBtn}
          >
            Fechar
          </button>
        </div>
        <p className="mt-1 text-[12.5px] leading-[1.45] text-[#6B7280]">
          Para o que chegou por WhatsApp, telefone ou pessoalmente. Entra na fila
          como as do formulário.
        </p>

        {receipt ? (
          <section className="mt-5 text-center" aria-live="polite">
            <p className="text-[13px] font-semibold text-[#4b5563]">
              Ocorrência registrada
            </p>
            <p className="mt-2 font-mono text-4xl font-bold text-[#0f766e]">
              #{receipt.number}
            </p>
            <p className="mt-3 text-[#4b5563]">
              Ela entrou na fila em Novo, com a prioridade sugerida.
            </p>
            <section className="mt-5 rounded-xl border border-[#e5e7eb] bg-white p-4 text-left">
              <h3 className="text-[13px] font-semibold">
                Link de acompanhamento
              </h3>
              <p className="mt-1 text-[12.5px] text-[#6B7280]">
                Copie e mande a quem relatou, se quiser.
              </p>
              <p className="mt-3 rounded-lg bg-[#f2f4f7] px-3 py-2 font-mono text-xs text-[#344054] [overflow-wrap:anywhere]">
                {trackingLink(receipt.trackingCode)}
              </p>
              <CopyTrackingLink
                link={trackingLink(receipt.trackingCode)}
                label="Copiar"
                className="mt-3"
              />
            </section>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={reset} className={secondaryBtn}>
                Registrar outra
              </button>
              <button type="button" onClick={onClose} className={primaryBtn}>
                Fechar
              </button>
            </div>
          </section>
        ) : condos.status === "loading" ? (
          <p role="status" className="mt-5 text-[#4b5563]">
            Carregando seus condomínios…
          </p>
        ) : condos.status === "error" ? (
          <p role="alert" className="mt-5 text-[13px] font-medium text-[#b42318]">
            {condos.kind === "unauthorized"
              ? "Sua sessão expirou. Entre novamente."
              : "Não foi possível carregar seus condomínios. Tente de novo."}
          </p>
        ) : condos.list.length === 0 ? (
          <p role="alert" className="mt-5 text-[#4b5563]">
            Cadastre um condomínio antes de registrar uma ocorrência.
          </p>
        ) : (
          <form
            noValidate
            onSubmit={submit}
            className="mt-4 flex flex-1 flex-col"
            aria-busy={sending}
          >
            <fieldset disabled={sending} className="min-w-0 space-y-3.5">
              <legend className="sr-only">Dados da ocorrência</legend>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="min-w-0">
                  <label htmlFor={`${id}-condominiumId`} className={labelStyle}>
                    Condomínio
                  </label>
                  <select
                    id={`${id}-condominiumId`}
                    name="condominiumId"
                    value={fields.condominiumId}
                    className={selectStyle}
                    aria-invalid={!!errors.condominiumId}
                    onChange={(event) =>
                      change("condominiumId", event.target.value)
                    }
                  >
                    <option value="">Escolha</option>
                    {condos.list.map((condo) => (
                      <option key={condo.id} value={condo.id}>
                        {condo.name}
                      </option>
                    ))}
                  </select>
                  {errors.condominiumId && (
                    <p className={errorStyle}>{errors.condominiumId}</p>
                  )}
                </div>

                <div className="min-w-0">
                  <label htmlFor={`${id}-channel`} className={labelStyle}>
                    Como chegou
                  </label>
                  <select
                    id={`${id}-channel`}
                    name="channel"
                    value={fields.channel}
                    className={selectStyle}
                    aria-invalid={!!errors.channel}
                    onChange={(event) => change("channel", event.target.value)}
                  >
                    <option value="">Escolha</option>
                    {MANAGER_CHANNELS.map((channel) => (
                      <option key={channel.value} value={channel.value}>
                        {channel.label}
                      </option>
                    ))}
                  </select>
                  {errors.channel && (
                    <p className={errorStyle}>{errors.channel}</p>
                  )}
                </div>
              </div>

              <div className="min-w-0">
                <label htmlFor={`${id}-description`} className={labelStyle}>
                  O que aconteceu
                </label>
                <textarea
                  id={`${id}-description`}
                  name="description"
                  value={fields.description}
                  className={`${fieldStyle} h-[76px] resize-y`}
                  aria-invalid={!!errors.description}
                  onChange={(event) =>
                    change("description", event.target.value)
                  }
                />
                {errors.description && (
                  <p className={errorStyle}>{errors.description}</p>
                )}
              </div>

              <div className="min-w-0">
                <label htmlFor={`${id}-location`} className={labelStyle}>
                  Onde fica o problema
                </label>
                <input
                  id={`${id}-location`}
                  name="location"
                  type="text"
                  autoComplete="off"
                  placeholder="Ex.: garagem, vaga 12"
                  value={fields.location}
                  className={fieldStyle}
                  aria-invalid={!!errors.location}
                  onChange={(event) => change("location", event.target.value)}
                />
                {errors.location && (
                  <p className={errorStyle}>{errors.location}</p>
                )}
              </div>

              <fieldset className="min-w-0 rounded-[10px] border border-[#D0D5DD] px-3 py-2.5">
                <legend className="px-1 text-[13px] font-semibold text-[#111827]">
                  Quem relatou{" "}
                  <span className="text-[12px] font-normal text-[#6B7280]">
                    opcional
                  </span>
                </legend>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="min-w-0">
                    <label
                      htmlFor={`${id}-reporterName`}
                      className={labelStyle}
                    >
                      Nome
                    </label>
                    <input
                      id={`${id}-reporterName`}
                      name="reporterName"
                      type="text"
                      autoComplete="off"
                      value={fields.reporterName}
                      className={fieldStyle}
                      aria-invalid={!!errors.reporterName}
                      onChange={(event) =>
                        change("reporterName", event.target.value)
                      }
                    />
                    {errors.reporterName && (
                      <p className={errorStyle}>{errors.reporterName}</p>
                    )}
                  </div>
                  <div className="min-w-0">
                    <label
                      htmlFor={`${id}-reporterPhone`}
                      className={labelStyle}
                    >
                      Celular
                    </label>
                    <PhoneInput
                      id={`${id}-reporterPhone`}
                      name="reporterPhone"
                      value={fields.reporterPhone}
                      className={fieldStyle}
                      aria-invalid={!!errors.reporterPhone}
                      onValueChange={(value) => change("reporterPhone", value)}
                    />
                    {errors.reporterPhone && (
                      <p className={errorStyle}>{errors.reporterPhone}</p>
                    )}
                  </div>
                  <div className="min-w-0">
                    <label
                      htmlFor={`${id}-reporterUnitOrRole`}
                      className={labelStyle}
                    >
                      Unidade ou função
                    </label>
                    <input
                      id={`${id}-reporterUnitOrRole`}
                      name="reporterUnitOrRole"
                      type="text"
                      autoComplete="off"
                      placeholder="Ex.: Bloco 1, apto 3"
                      value={fields.reporterUnitOrRole}
                      className={fieldStyle}
                      aria-invalid={!!errors.reporterUnitOrRole}
                      onChange={(event) =>
                        change("reporterUnitOrRole", event.target.value)
                      }
                    />
                    {errors.reporterUnitOrRole && (
                      <p className={errorStyle}>{errors.reporterUnitOrRole}</p>
                    )}
                  </div>
                </div>
                <p className="mt-2 text-[12px] text-[#6B7280]">
                  Deixe em branco se foi você que viu o problema.
                </p>
              </fieldset>
            </fieldset>

            {message && (
              <p role="alert" className="mt-3 text-[13px] font-medium text-[#b42318]">
                {message}
              </p>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={sending}
                className={secondaryBtn}
              >
                Cancelar
              </button>
              <button type="submit" disabled={sending} className={primaryBtn}>
                {sending ? "Registrando…" : "Registrar na fila"}
              </button>
            </div>
          </form>
        )}
      </aside>
    </div>
  );
}
