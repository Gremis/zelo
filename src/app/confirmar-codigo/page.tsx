"use client";

import { isRegistrationDemoEnabled } from "@/lib/auth/registration";
import { useOnlineStatus } from "@/components/pwa-runtime";
import { signupStyles } from "@/components/signup-styles";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useLayoutEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { AuthCard } from "@/components/auth-card";
import { useSignupFlow } from "@/components/signup-flow";
import {
  submitConfirmationCode,
  submitResendConfirmationCode,
} from "@/lib/auth/submit";

const CODE_LENGTH = 6;

function validateCode(code: string): string | null {
  if (code === "") {
    return "Informe o código recebido.";
  }

  if (code.length !== CODE_LENGTH) {
    return `Digite o código de ${CODE_LENGTH} dígitos.`;
  }

  return null;
}

export function ConfirmationCodeScreen() {
  const router = useRouter();
  const {
    draft,
    registrationId,
    setRegistrationId,
    setConfirmationComplete,
    setShowFirstSteps,
  } = useSignupFlow();
  const email = draft.email.trim();
  const online = useOnlineStatus();
  const id = useId();
  const codeRef = useRef<HTMLInputElement>(null);
  const pending = useRef(false);
  const screenVersion = useRef(0);
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState("");
  const [message, setMessage] = useState("");
  const [operation, setOperation] = useState<
    "confirm" | "resend" | "session" | null
  >(null);
  const [resendStatus, setResendStatus] = useState("");
  const [blocked, setBlocked] = useState(false);
  const mockMode = isRegistrationDemoEnabled();
  const hasContext = Boolean(email);
  const [confirmedEmail, setConfirmedEmail] = useState<string | null>(null);
  const awaitingSession = confirmedEmail === email && registrationId === null;

  async function checkSession(version: number) {
    try {
      const response = await fetch("/api/auth/session", {
        cache: "no-store",
        credentials: "same-origin",
      });
      if (version !== screenVersion.current) return;
      if (!response.ok) {
        setMessage(
          response.status === 401
            ? "Seu e-mail foi confirmado, mas sua sessão não está ativa. Entre com sua conta."
            : "Seu e-mail foi confirmado. Não foi possível verificar sua sessão. Tente novamente.",
        );
        return;
      }
      const data: unknown = await response.json();
      if (version !== screenVersion.current) return;
      const user =
        typeof data === "object" && data !== null && "user" in data
          ? data.user
          : null;
      if (
        typeof user !== "object" ||
        user === null ||
        !("email" in user) ||
        typeof user.email !== "string" ||
        user.email.toLowerCase() !== email.toLowerCase()
      ) {
        setMessage(
          "A sessão ativa não corresponde à conta confirmada. Entre com sua conta para continuar.",
        );
        return;
      }
      setConfirmationComplete(true);
      setShowFirstSteps(true);
      router.replace("/fila");
      router.refresh();
    } catch {
      if (version === screenVersion.current)
        setMessage(
          "Seu e-mail foi confirmado. Não foi possível verificar sua sessão. Tente novamente.",
        );
    }
  }

  async function retrySession() {
    if (pending.current) return;
    pending.current = true;
    const version = screenVersion.current;
    setOperation("session");
    setMessage("");
    try {
      await checkSession(version);
    } finally {
      pending.current = false;
      if (version === screenVersion.current) setOperation(null);
    }
  }

  useLayoutEffect(
    () => () => {
      screenVersion.current += 1;
      setCode("");
      setCodeError("");
      setMessage("");
      setResendStatus("");
      setBlocked(false);
      if (codeRef.current) codeRef.current.value = "";
    },
    [],
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (pending.current || !hasContext || blocked || awaitingSession) {
      return;
    }

    setMessage("");
    setResendStatus("");

    const nextCodeError = validateCode(code);
    setCodeError(nextCodeError ?? "");

    if (nextCodeError) {
      codeRef.current?.focus();
      return;
    }

    pending.current = true;
    const version = screenVersion.current;
    setOperation("confirm");

    try {
      const input = {
        registrationId: registrationId ?? "",
        email,
        code,
      };
      const result = await submitConfirmationCode(input);

      if (version !== screenVersion.current) {
        return;
      }

      if (result.ok) {
        setCode("");
        if (mockMode) {
          setConfirmationComplete(true);
          setShowFirstSteps(true);
          router.replace("/fila");
        } else {
          setConfirmedEmail(email);
          setRegistrationId(null);
          setOperation("session");
          await checkSession(version);
        }
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
          mockMode
            ? "Limite de tentativas atingido. Reenvie o código ou revise o cadastro."
            : "Limite de tentativas atingido. Aguarde 15 minutos e solicite outro código.",
        );
      } else if (result.error === "rate-limited") {
        setMessage(
          "Aguarde antes de tentar novamente. O intervalo de reenvio é de 60 segundos.",
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
    if (
      pending.current ||
      !hasContext ||
      !navigator.onLine ||
      awaitingSession
    ) {
      return;
    }

    pending.current = true;
    const version = screenVersion.current;
    setOperation("resend");
    setMessage("");
    setCodeError("");
    setResendStatus("");

    try {
      const input = {
        registrationId: registrationId ?? "",
        email,
      };
      const result = await submitResendConfirmationCode(input);

      if (version !== screenVersion.current) {
        return;
      }

      if (result.ok) {
        setCode("");
        setBlocked(false);
        setResendStatus(
          mockMode
            ? "Código reenviado. Confira seu e-mail."
            : "Se houver cadastro pendente, o código será enviado. Confira sua caixa de entrada e o spam.",
        );
      } else if (result && !result.ok && result.error === "attempt-limit") {
        setBlocked(true);
        setMessage("Limite de reenvios atingido. Tente novamente mais tarde.");
      } else if (result && !result.ok && result.error === "rate-limited") {
        setMessage("Aguarde 60 segundos entre solicitações de código.");
      } else {
        setMessage(
          result && !result.ok && result.error === "missing-registration"
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
      verticalAlign="center"
      title={awaitingSession ? "E-mail confirmado" : "Confirme seu e-mail"}
      description={
        awaitingSession ? (
          "Seu código já foi validado. Verifique sua sessão para continuar."
        ) : hasContext ? (
          <>
            Digite o código de 6 dígitos para confirmar o e-mail{" "}
            <strong>{email}</strong>.
          </>
        ) : (
          "Confirme o e-mail informado no cadastro para continuar."
        )
      }
    >
      <>
        {!hasContext && (
          <p role="status" data-slot="status" className={signupStyles.status}>
            Não encontramos os dados do seu cadastro nesta sessão. Volte para
            criar sua conta. Se você recarregou a página, será necessário
            informar os dados novamente.
          </p>
        )}
        {awaitingSession ? (
          <div className="flex flex-col gap-4">
            <button
              type="button"
              onClick={retrySession}
              disabled={operation !== null}
              className={signupStyles.submit}
            >
              {operation === "session"
                ? "Verificando sessão..."
                : "Verificar sessão novamente"}
            </button>
            <Link href="/login" className={signupStyles.link}>
              Ir para o login
            </Link>
          </div>
        ) : (
          <>
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
                  maxLength={CODE_LENGTH}
                  disabled={!hasContext || blocked || operation !== null}
                  value={code}
                  onChange={(event) => {
                    setCode(
                      event.target.value
                        .replace(/\D/g, "")
                        .slice(0, CODE_LENGTH),
                    );
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
                disabled={!hasContext || operation !== null || !online}
                onClick={handleResend}
                data-slot="link"
                className={signupStyles.link}
              >
                {operation === "resend" ? "Reenviando..." : "Reenviar código"}
              </button>
            </div>
            {!mockMode && hasContext && (
              <p className={signupStyles.help}>
                Se já existir um cadastro para este e-mail, a senha e os dados
                anteriores são preservados. Para alterá-los, use a recuperação
                de senha. Corrigir o e-mail não exclui o cadastro anterior.
              </p>
            )}
            <p data-slot="help" className={signupStyles.help}>
              O código vale por 15 minutos. Aguarde 60 segundos para reenviar.
              Não chegou? Confira a caixa de spam. A conta só é liberada depois
              da confirmação.
            </p>
          </>
        )}
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
    </AuthCard>
  );
}

export default function ConfirmationCodePage() {
  return <ConfirmationCodeScreen />;
}
