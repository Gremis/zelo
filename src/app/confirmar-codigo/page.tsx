"use client";

import { signupStyles } from "@/components/signup-styles";

import Link from "next/link";
import { useId, useLayoutEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { AuthCard } from "@/components/auth-card";
import { useSignupFlow } from "@/components/signup-flow";
import {
  submitConfirmationCode,
  submitResendConfirmationCode,
} from "@/lib/auth/submit";

export default function ConfirmationCodePage() {
  const { draft, registrationId, setRegistrationId } = useSignupFlow();
  const id = useId();
  const codeRef = useRef<HTMLInputElement>(null);
  const pending = useRef(false);
  const screenVersion = useRef(0);
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState("");
  const [message, setMessage] = useState("");
  const [operation, setOperation] = useState<"confirm" | "resend" | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [resendStatus, setResendStatus] = useState("");
  const [blocked, setBlocked] = useState(false);
  const hasContext = Boolean(draft.email.trim());

  useLayoutEffect(
    () => () => {
      screenVersion.current += 1;
      setCode("");
      setCodeError("");
      setMessage("");
      setConfirmed(false);
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
      const result = await submitConfirmationCode(input);
      if (version !== screenVersion.current) return;
      if (result.ok) {
        setCode("");
        setConfirmed(true);
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
          "Limite de tentativas atingido. Reenvie o código ou revise o cadastro.",
        );
      } else {
        setMessage(
          result.error === "missing-registration"
            ? "Não encontramos seu cadastro. Volte para criar sua conta."
            : "Não foi possível confirmar o código. Tente novamente.",
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
      const result = await submitResendConfirmationCode(input);
      if (version !== screenVersion.current) return;
      if (result.ok) {
        setCode("");
        setBlocked(false);
        setResendStatus("Código reenviado. Confira seu e-mail.");
      } else if (!result.ok && result.error === "attempt-limit") {
        setBlocked(true);
        setMessage("Limite de reenvios atingido. Tente novamente mais tarde.");
      } else {
        setMessage(
          !result.ok && result.error === "missing-registration"
            ? "Não encontramos seu cadastro. Volte para criar sua conta."
            : "Não foi possível reenviar o código. Tente novamente.",
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
      title={confirmed ? "Conta criada." : "Confirme seu e-mail"}
      focusTitle={confirmed}
      description={
        confirmed ? null : hasContext ? (
          <>
            Digite o código de 6 dígitos para confirmar o e-mail{" "}
            <strong>{draft.email.trim()}</strong>.
          </>
        ) : (
          "Confirme o e-mail informado no cadastro para continuar."
        )
      }
    >
      {!confirmed && (
        <>
          {!hasContext && (
            <p role="status" data-slot="status" className={signupStyles.status}>
              Não encontramos os dados do seu cadastro nesta sessão. Volte para
              criar sua conta. Se você recarregou a página, será necessário
              informar os dados novamente.
            </p>
          )}
          <form
            noValidate
            onSubmit={handleSubmit}
            data-slot="form"
            className={signupStyles.form}
            aria-busy={operation !== null}
          >
            <div data-slot="field" className={signupStyles.field}>
              <label
                htmlFor={`${id}-code`}
                data-slot="label"
                className={signupStyles.label}
              >
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
                data-slot="input code"
                className={signupStyles.code}
              />
              {codeError && (
                <p
                  id={`${id}-code-error`}
                  role="alert"
                  data-slot="error"
                  className={signupStyles.error}
                >
                  {codeError}
                </p>
              )}
            </div>
            <button
              type="submit"
              disabled={!hasContext || blocked || operation !== null}
              data-slot="submit"
              className={signupStyles.submit}
            >
              {operation === "confirm"
                ? "Confirmando..."
                : "Confirmar e entrar"}
            </button>
          </form>
          <div data-slot="actions" className={signupStyles.actions}>
            <Link
              href="/criar-conta"
              data-slot="link"
              className={signupStyles.link}
              onClick={() => setRegistrationId(null)}
            >
              {hasContext ? "Corrigir e-mail" : "Criar conta"}
            </Link>
            <button
              type="button"
              disabled={!hasContext || operation !== null}
              onClick={handleResend}
              data-slot="link"
              className={signupStyles.link}
            >
              {operation === "resend" ? "Reenviando..." : "Reenviar código"}
            </button>
          </div>
          <p data-slot="help" className={signupStyles.help}>
            Não chegou? Confira a caixa de spam. A conta só é liberada depois da
            confirmação.
          </p>
          {message && (
            <p role="alert" data-slot="error" className={signupStyles.error}>
              {message}
            </p>
          )}
          {resendStatus && (
            <p role="status" data-slot="status" className={signupStyles.status}>
              {resendStatus}
            </p>
          )}
        </>
      )}
    </AuthCard>
  );
}
