"use client";

import Link from "next/link";
import { RegistrationDemoNotice } from "@/components/registration-demo-notice";
import { isRegistrationDemoEnabled } from "@/lib/auth/registration-demo";
import { useId, useLayoutEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { AuthCard } from "@/components/auth-card";
import { useSignupFlow } from "@/components/signup-flow";
import {
  submitConfirmationCode,
  submitResendConfirmationCode,
} from "@/lib/auth/submit";

export default function ConfirmationCodePage() {
  const { draft, registrationId, setRegistrationId, demoScenario } =
    useSignupFlow();
  const demoEnabled = isRegistrationDemoEnabled();
  const id = useId();
  const codeRef = useRef<HTMLInputElement>(null);
  const pending = useRef(false);
  const screenVersion = useRef(0);
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState("");
  const [message, setMessage] = useState("");
  const [operation, setOperation] = useState<"confirm" | "resend" | null>(null);
  const [demoSuccess, setDemoSuccess] = useState(false);
  const [resendStatus, setResendStatus] = useState("");
  const [blocked, setBlocked] = useState(false);
  const hasContext = Boolean(
    draft.email.trim() && (!demoEnabled || registrationId),
  );

  useLayoutEffect(
    () => () => {
      screenVersion.current += 1;
      setCode("");
      setCodeError("");
      setMessage("");
      setDemoSuccess(false);
      setResendStatus("");
      setBlocked(false);
      if (codeRef.current) codeRef.current.value = "";
    },
    [],
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current || !hasContext || blocked) return;
    setMessage("");
    setResendStatus("");
    if (!/^\d{6}$/.test(code)) {
      setCodeError("Digite o código de 6 dígitos.");
      codeRef.current?.focus();
      return;
    }
    pending.current = true;
    const version = screenVersion.current;
    setOperation("confirm");
    setCodeError("");
    try {
      const input = {
        registrationId: registrationId ?? "",
        email: draft.email.trim(),
        code,
      };
      const result = demoEnabled
        ? await submitConfirmationCode(input, demoScenario)
        : await submitConfirmationCode(input);
      if (version !== screenVersion.current) return;
      if (result.ok) {
        setCode("");
        if (result.simulated && demoEnabled) setDemoSuccess(true);
        else
          setMessage(
            "Não foi possível verificar sua sessão. A entrada na conta ainda não está disponível.",
          );
      } else if (
        result.error === "invalid-code" ||
        result.error === "expired-code"
      ) {
        setCode("");
        setCodeError("Código incorreto ou expirado. Confira ou peça um novo.");
      } else if (result.error === "attempt-limit") {
        setCode("");
        setBlocked(true);
        setMessage(
          "Limite de tentativas simulado atingido. Reenvie o código no fluxo normal ou revise o cadastro.",
        );
      } else {
        setMessage(
          result.error === "missing-registration"
            ? "Não encontramos o cadastro desta demonstração. Volte para criar sua conta."
            : "Falha simulada na confirmação. Tente novamente.",
        );
      }
    } catch {
      if (version === screenVersion.current) {
        setMessage(
          "A confirmação de e-mail está temporariamente indisponível. Tente novamente mais tarde.",
        );
      }
    } finally {
      pending.current = false;
      setOperation(null);
    }
  }

  async function handleResend() {
    if (pending.current || !hasContext) return;
    pending.current = true;
    const version = screenVersion.current;
    setOperation("resend");
    setMessage("");
    setCodeError("");
    setResendStatus("");
    try {
      const input = {
        registrationId: registrationId ?? "",
        email: draft.email.trim(),
      };
      const result = demoEnabled
        ? await submitResendConfirmationCode(input, demoScenario)
        : await submitResendConfirmationCode(input);
      if (version !== screenVersion.current) return;
      if (result.ok && result.simulated && demoEnabled) {
        setCode("");
        setBlocked(false);
        setResendStatus(
          "Reenvio simulado concluído. Nenhum e-mail real foi enviado.",
        );
      } else if (!result.ok && result.error === "attempt-limit") {
        setBlocked(true);
        setMessage(
          "Limite de reenvios simulado atingido. Selecione o fluxo normal para revisar novamente.",
        );
      } else {
        setMessage(
          !result.ok && result.error === "missing-registration"
            ? "Não encontramos o cadastro desta demonstração. Volte para criar sua conta."
            : "Falha simulada no reenvio. Nenhum e-mail real foi enviado. Tente novamente.",
        );
      }
    } catch {
      if (version === screenVersion.current) {
        setMessage(
          "Não foi possível reenviar o código. O reenvio está temporariamente indisponível.",
        );
      }
    } finally {
      pending.current = false;
      setOperation(null);
    }
  }

  return (
    <AuthCard
      variant="signup"
      title="Confirme seu e-mail"
      description={
        hasContext ? (
          <>
            Digite o código de 6 dígitos para confirmar o e-mail{" "}
            <strong>{draft.email.trim()}</strong>.
          </>
        ) : (
          "Confirme o e-mail informado no cadastro para continuar."
        )
      }
    >
      <RegistrationDemoNotice />
      {demoSuccess ? (
        <section
          role="status"
          tabIndex={-1}
          ref={(element) => {
            element?.focus();
          }}
          className="signup-demo-result"
        >
          <h2>Confirmação simulada concluída</h2>
          <p>
            O fluxo de demonstração foi concluído. Nenhuma conta, sessão ou
            acesso real foi criado.
          </p>
          <Link
            href="/criar-conta"
            className="signup-link"
            onClick={() => setRegistrationId(null)}
          >
            Revisar cadastro
          </Link>
        </section>
      ) : (
        <>
          {!hasContext && (
            <p role="status" className="signup-status">
              Não encontramos os dados do seu cadastro nesta sessão. Volte para
              criar sua conta. Se você recarregou a página, será necessário
              informar os dados novamente.
            </p>
          )}
          <form
            noValidate
            onSubmit={handleSubmit}
            className="signup-form"
            aria-busy={operation !== null}
          >
            <div className="signup-field">
              <label htmlFor={`${id}-code`} className="signup-label">
                Código
              </label>
              <input
                ref={codeRef}
                id={`${id}-code`}
                name="code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                disabled={!hasContext || blocked || operation !== null}
                value={code}
                onChange={(event) => {
                  setCode(event.target.value.replace(/\D/g, "").slice(0, 6));
                  setCodeError("");
                  setMessage("");
                }}
                aria-invalid={Boolean(codeError)}
                aria-describedby={codeError ? `${id}-code-error` : undefined}
                className="signup-input signup-code"
              />
              {codeError && (
                <p
                  id={`${id}-code-error`}
                  role="alert"
                  className="signup-error"
                >
                  {codeError}
                </p>
              )}
            </div>
            <button
              type="submit"
              disabled={!hasContext || blocked || operation !== null}
              className="signup-submit"
            >
              {operation === "confirm"
                ? "Confirmando..."
                : "Confirmar e entrar"}
            </button>
          </form>
          <div className="signup-actions">
            <Link
              href="/criar-conta"
              className="signup-link"
              onClick={() => setRegistrationId(null)}
            >
              {hasContext ? "Corrigir e-mail" : "Criar conta"}
            </Link>
            <button
              type="button"
              disabled={!hasContext || operation !== null}
              onClick={handleResend}
              className="signup-link"
            >
              {operation === "resend" ? "Reenviando..." : "Reenviar código"}
            </button>
          </div>
          {message && (
            <p role="alert" className="signup-error">
              {message}
            </p>
          )}
          {resendStatus && (
            <p role="status" className="signup-status">
              {resendStatus}
            </p>
          )}
          {!demoEnabled && (
            <p className="signup-availability">
              A confirmação e o reenvio ainda não estão disponíveis. Sua conta
              não será liberada por esta tela neste momento.
            </p>
          )}
        </>
      )}
    </AuthCard>
  );
}
