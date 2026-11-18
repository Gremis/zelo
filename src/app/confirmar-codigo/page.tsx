"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import type { FormEvent } from "react";
import { AuthCard } from "@/components/auth-card";
import {
  submitConfirmationCode,
  submitResendConfirmationCode,
} from "@/lib/auth/submit";

const CODE_LENGTH = 6;
const RESEND_SECONDS = 30;

function validateCode(code: string): string | null {
  if (code === "") {
    return "Informe o código recebido.";
  }

  if (code.length !== CODE_LENGTH) {
    return `O código deve ter ${CODE_LENGTH} dígitos.`;
  }

  return null;
}

const inputClasses =
  "w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-center text-base tracking-[0.4em] text-zinc-50 transition-colors placeholder:text-zinc-500 focus-visible:ring-2 focus-visible:ring-teal-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#121a18] focus-visible:outline-none";

const linkClasses =
  "rounded text-sm font-medium text-teal-300 underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-teal-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#121a18] focus-visible:outline-none";

export default function ConfirmationCodePage() {
  const codeId = useId();
  const codeErrorId = useId();

  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resendRemaining, setResendRemaining] = useState(0);

  useEffect(() => {
    if (resendRemaining <= 0) {
      return;
    }

    const timeout = setTimeout(() => {
      setResendRemaining((remaining) => remaining - 1);
    }, 1000);

    return () => clearTimeout(timeout);
  }, [resendRemaining]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    const nextCodeError = validateCode(code);

    setCodeError(nextCodeError);

    if (nextCodeError) {
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await submitConfirmationCode(code);

      if (!result.ok) {
        setCodeError(
          result.error === "expired-code"
            ? "Este código expirou. Solicite um novo código."
            : "Código inválido. Verifique e tente novamente.",
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleResend() {
    if (resendRemaining > 0) {
      return;
    }

    setResendRemaining(RESEND_SECONDS);
    await submitResendConfirmationCode();
  }

  return (
    <AuthCard
      title="Confirmar código"
      description="Enviamos um código para o seu e-mail."
    >
      <div className="flex flex-col gap-5">
        <form
          noValidate
          onSubmit={handleSubmit}
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor={codeId}
              className="text-sm font-medium text-zinc-200"
            >
              Código
            </label>
            <input
              id={codeId}
              name="code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={CODE_LENGTH}
              value={code}
              onChange={(event) => {
                setCode(
                  event.target.value.replace(/\D/g, "").slice(0, CODE_LENGTH),
                );
                setCodeError(null);
              }}
              aria-invalid={codeError ? true : undefined}
              aria-describedby={codeError ? codeErrorId : undefined}
              className={inputClasses}
            />
            {codeError ? (
              <p id={codeErrorId} role="alert" className="text-xs text-red-300">
                {codeError}
              </p>
            ) : null}
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-teal-600 focus-visible:ring-2 focus-visible:ring-teal-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#121a18] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Confirmando..." : "Confirmar"}
          </button>
        </form>

        <button
          type="button"
          onClick={handleResend}
          disabled={resendRemaining > 0}
          className="self-center rounded text-sm font-medium text-zinc-300 underline-offset-4 hover:text-white hover:underline focus-visible:ring-2 focus-visible:ring-teal-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#121a18] focus-visible:outline-none disabled:cursor-not-allowed disabled:text-zinc-500 disabled:no-underline"
        >
          {resendRemaining > 0
            ? `Reenviar código (${resendRemaining}s)`
            : "Reenviar código"}
        </button>

        <Link href="/login" className={`${linkClasses} self-center`}>
          Voltar para o login
        </Link>
      </div>
    </AuthCard>
  );
}
