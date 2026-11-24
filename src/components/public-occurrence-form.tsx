"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { PhoneInput } from "@/components/phone-input";
import type {
  CondominiumResult,
  PublicOccurrenceOperations,
  RegistrationAttempt,
  RegistrationErrors,
  RegistrationFields,
} from "@/lib/public-occurrences/contract";
import { createPublicOccurrenceOperations } from "@/lib/public-occurrences/operations";
import {
  emptyRegistration,
  normalizeRegistration,
  registrationFields,
  validateRegistration,
} from "@/lib/public-occurrences/validation";

const defaultOperations = createPublicOccurrenceOperations();
const inputStyle =
  "block min-h-10 w-full min-w-0 rounded-lg border border-[#cfd5df] bg-white px-3 py-2 text-sm font-medium text-[#111827] placeholder:text-[#737373] aria-invalid:border-[#b42318] disabled:bg-[#eef0f3] disabled:text-[#4b5563]";
const buttonStyle =
  "min-h-11 w-full rounded-lg bg-[#0f766e] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0b5e58] disabled:cursor-wait disabled:opacity-60";
const secondaryStyle =
  "min-h-11 w-full rounded-lg border border-[#cfd5df] bg-white px-4 py-2.5 text-sm font-semibold text-[#111827] hover:bg-[#f0f2f5]";

export function PublicOccurrenceForm({
  slug,
  operations = defaultOperations,
}: {
  slug: string;
  operations?: PublicOccurrenceOperations;
}) {
  const id = useId();
  const [condominium, setCondominium] = useState<CondominiumResult | null>(
    null,
  );
  const [loadVersion, setLoadVersion] = useState(0);
  const [fields, setFields] = useState(emptyRegistration);
  const [errors, setErrors] = useState<RegistrationErrors>({});
  const [message, setMessage] = useState("");
  const [attempt, setAttempt] = useState<RegistrationAttempt | null>(null);
  const [sending, setSending] = useState(false);
  const [blocked, setBlocked] = useState<"uncertain" | "conflict" | null>(null);
  const [abandon, setAbandon] = useState(false);
  const [number, setNumber] = useState<number | null>(null);
  const busy = useRef(false);
  const form = useRef<HTMLFormElement>(null);
  const confirmation = useRef<HTMLHeadingElement>(null);
  const recovery = useRef<HTMLHeadingElement>(null);
  const resetFocus = useRef(false);
  const errorFocus = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    void operations
      .load(slug, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setCondominium(result);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setCondominium({ ok: false, error: "unavailable" });
      });
    return () => controller.abort();
  }, [slug, operations, loadVersion]);

  useLayoutEffect(() => {
    if (number !== null) confirmation.current?.focus();
    else if (blocked) recovery.current?.focus();
    else if (!sending) {
      const first = registrationFields.find((field) => errors[field.name]);
      if (first && errorFocus.current)
        (
          form.current?.elements.namedItem(first.name) as HTMLElement | null
        )?.focus();
      else if (resetFocus.current) {
        (
          form.current?.elements.namedItem("reporterName") as HTMLElement | null
        )?.focus();
        resetFocus.current = false;
      }
      errorFocus.current = false;
    }
  }, [number, blocked, sending, errors]);

  function reset() {
    setFields(emptyRegistration());
    setErrors({});
    setMessage("");
    setAttempt(null);
    setBlocked(null);
    setAbandon(false);
    setNumber(null);
    resetFocus.current = true;
  }

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    if (busy.current) return;
    const invalid = validateRegistration(fields);
    if (!blocked && Object.keys(invalid).length) {
      errorFocus.current = true;
      setErrors(invalid);
      setMessage("Confira os campos indicados.");
      return;
    }
    busy.current = true;
    setSending(true);
    setMessage("");
    setErrors({});
    try {
      const currentAttempt = attempt ?? {
        key: crypto.randomUUID(),
        fields: normalizeRegistration(fields),
      };
      setAttempt(currentAttempt);
      const result = await operations.register(slug, currentAttempt);
      if (result.ok) {
        setNumber(result.number);
        setAttempt(null);
        setBlocked(null);
        setFields(emptyRegistration());
      } else if (result.error === "invalid_input") {
        setAttempt(null);
        setBlocked(null);
        errorFocus.current = true;
        setErrors(result.fields);
        setMessage("Confira os dados informados e envie novamente.");
      } else if (result.error === "not_found") {
        setAttempt(null);
        setBlocked(null);
        setMessage(
          "Este link não está disponível. Confira o link do condomínio e tente novamente.",
        );
      } else {
        setBlocked(result.error);
      }
    } catch {
      setBlocked("uncertain");
    } finally {
      busy.current = false;
      setSending(false);
    }
  }

  function change(name: keyof RegistrationFields, value: string) {
    if (sending || blocked) return;
    setFields((previous) => ({ ...previous, [name]: value }));
    setErrors((previous) => ({ ...previous, [name]: undefined }));
    setMessage("");
  }

  return (
    <main className="min-h-dvh flex-1 bg-[#f6f7f9] px-4 py-2 text-sm leading-[1.45] text-[#111827] [color-scheme:light] [font-family:var(--font-geist-sans),system-ui,sans-serif] [overflow-wrap:anywhere] [&_:is(input,textarea,button):focus-visible]:outline-2 [&_:is(input,textarea,button):focus-visible]:outline-offset-2 [&_:is(input,textarea,button):focus-visible]:outline-[#0f766e] sm:px-6 sm:py-6">
      <div className="mx-auto w-full max-w-xl">
        {number !== null ? (
          <section
            className="pt-6 text-center sm:pt-10"
            aria-labelledby={`${id}-confirmed`}
          >
            <h1
              ref={confirmation}
              id={`${id}-confirmed`}
              tabIndex={-1}
              className="text-lg font-medium text-[#4b5563]"
            >
              Ocorrência registrada
            </h1>
            <p className="mt-3 font-mono text-4xl font-bold text-[#0f766e]">
              #{number}
            </p>
            <p className="mt-4 text-[#4b5563]">
              O síndico já recebeu e vai decidir o que fazer.
            </p>
            <button
              type="button"
              onClick={reset}
              className={`${secondaryStyle} mt-6`}
            >
              Registrar outra
            </button>
          </section>
        ) : !condominium ? (
          <p role="status">Carregando condomínio…</p>
        ) : !condominium.ok ? (
          <section
            aria-labelledby={`${id}-unavailable`}
            className="rounded-xl border border-[#e5e7eb] bg-white p-6"
          >
            <h1 id={`${id}-unavailable`} className="text-2xl font-bold">
              {condominium.error === "not_found"
                ? "Link não encontrado"
                : "Não foi possível carregar o condomínio"}
            </h1>
            <p role="alert" className="mt-3 text-[#4b5563]">
              {condominium.error === "not_found"
                ? "Este link não existe ou está indisponível. Confira o link do condomínio."
                : "O serviço está temporariamente indisponível. Tente novamente."}
            </p>
            {condominium.error === "unavailable" && (
              <button
                type="button"
                className={`${buttonStyle} mt-6`}
                onClick={() => {
                  setCondominium(null);
                  setLoadVersion((value) => value + 1);
                }}
              >
                Tentar novamente
              </button>
            )}
          </section>
        ) : (
          <>
            <header className="rounded-xl bg-[#0f766e] px-4 py-3.5 text-white sm:px-5">
              <h1 className="text-lg font-bold leading-tight">
                {condominium.data.name}
              </h1>
              <p className="mt-1.5 text-sm">
                Registro de ocorrência · <span>{condominium.data.address}</span>
              </p>
            </header>
            <form
              ref={form}
              noValidate
              onSubmit={submit}
              className="mt-4"
              aria-label="Registrar ocorrência"
              aria-busy={sending}
            >
              <fieldset
                disabled={sending || !!blocked}
                className="min-w-0 space-y-4"
              >
                <legend className="sr-only">Dados da ocorrência</legend>
                {registrationFields.map((field) => {
                  const inputId = `${id}-${field.name}`;
                  const hintId = `${inputId}-hint`;
                  const errorId = `${inputId}-error`;
                  const attributes = {
                    id: inputId,
                    name: field.name,
                    required: true,
                    value: fields[field.name],
                    placeholder:
                      "placeholder" in field ? field.placeholder : undefined,
                    className: inputStyle,
                    "aria-invalid": !!errors[field.name],
                    "aria-describedby":
                      [
                        field.name === "reporterUnitOrRole" ? hintId : "",
                        errors[field.name] ? errorId : "",
                      ]
                        .filter(Boolean)
                        .join(" ") || undefined,
                  };
                  return (
                    <div key={field.name} className="min-w-0">
                      <label
                        htmlFor={inputId}
                        className="mb-1.5 block text-sm font-semibold"
                      >
                        {field.label}
                      </label>
                      {field.name === "reporterPhone" ? (
                        <PhoneInput
                          {...attributes}
                          onValueChange={(value) => change(field.name, value)}
                        />
                      ) : field.name === "description" ? (
                        <textarea
                          {...attributes}
                          rows={3}
                          onChange={(event) =>
                            change(field.name, event.target.value)
                          }
                        />
                      ) : (
                        <input
                          {...attributes}
                          type="text"
                          autoComplete="off"
                          onChange={(event) =>
                            change(field.name, event.target.value)
                          }
                        />
                      )}
                      {field.name === "reporterUnitOrRole" && (
                        <p
                          id={hintId}
                          className="mt-1.5 text-[13px] text-[#6b7280]"
                        >
                          Trabalha no prédio? Escreva sua função, como
                          ‘Porteiro’.
                        </p>
                      )}
                      {errors[field.name] && (
                        <p
                          id={errorId}
                          className="mt-2 text-sm font-medium text-[#b42318]"
                        >
                          {errors[field.name]}
                        </p>
                      )}
                    </div>
                  );
                })}
              </fieldset>
              {message && (
                <p
                  role="alert"
                  className="mt-4 text-sm font-medium text-[#b42318]"
                >
                  {message}
                </p>
              )}
              {blocked && (
                <section
                  className="mt-5 rounded-xl border border-[#cfd5df] bg-white p-4"
                  aria-labelledby={`${id}-recovery`}
                >
                  <h2
                    ref={recovery}
                    tabIndex={-1}
                    id={`${id}-recovery`}
                    className="font-bold"
                  >
                    {blocked === "uncertain"
                      ? "Precisamos confirmar seu envio"
                      : "Não foi possível confirmar esta tentativa"}
                  </h2>
                  <p role="alert" className="mt-2 text-sm text-[#4b5563]">
                    {blocked === "uncertain"
                      ? "A resposta não chegou. Seu registro pode ter sido salvo. Recupere o envio original para evitar uma ocorrência duplicada."
                      : "Este envio conflita com uma tentativa anterior. Não enviaremos outro registro automaticamente."}
                  </p>
                  <p className="mt-2 text-sm text-[#4b5563]">
                    Mantenha esta página aberta. Se recarregar ou fechar, esta
                    tentativa será perdida nesta tela.
                  </p>
                  {!abandon ? (
                    <div className="mt-4 space-y-3">
                      <button
                        type="button"
                        disabled={sending}
                        onClick={() => void submit()}
                        className={buttonStyle}
                      >
                        {sending
                          ? "Confirmando envio…"
                          : "Recuperar envio original"}
                      </button>
                      <button
                        type="button"
                        disabled={sending}
                        className={secondaryStyle}
                        onClick={() => setAbandon(true)}
                      >
                        Iniciar outro registro
                      </button>
                    </div>
                  ) : (
                    <div className="mt-4 space-y-3">
                      <p role="alert" className="text-sm font-medium">
                        O envio anterior pode já existir. Iniciar outro pode
                        duplicar a ocorrência. Deseja descartar esta tentativa?
                      </p>
                      <button
                        type="button"
                        className={secondaryStyle}
                        onClick={() => setAbandon(false)}
                      >
                        Manter tentativa original
                      </button>
                      <button
                        type="button"
                        className={secondaryStyle}
                        onClick={reset}
                      >
                        Descartar e iniciar outro
                      </button>
                    </div>
                  )}
                </section>
              )}
              {!blocked && (
                <button
                  type="submit"
                  disabled={sending}
                  className={`${buttonStyle} mt-4`}
                >
                  {sending ? "Enviando ocorrência…" : "Enviar ocorrência"}
                </button>
              )}
              {sending && (
                <p role="status" className="mt-3 text-sm text-[#4b5563]">
                  Aguarde a confirmação do envio.
                </p>
              )}
              <p className="mt-4 text-sm text-[#6b7280]">
                Seu nome, celular e unidade são usados só para o síndico tratar
                a ocorrência e falar com você.
              </p>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
