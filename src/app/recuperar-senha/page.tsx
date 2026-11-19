"use client";

import Link from "next/link";
import { useId, useState } from "react";
import type { FormEvent } from "react";
import { AuthCard } from "@/components/auth-card";
import { submitPasswordRecovery } from "@/lib/auth/submit";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateEmail(email: string): string | null {
  const trimmedEmail = email.trim();

  if (trimmedEmail === "") {
    return "Informe seu e-mail.";
  }

  if (!EMAIL_PATTERN.test(trimmedEmail)) {
    return "Informe um e-mail válido.";
  }

  return null;
}

const inputClasses =
  "w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-zinc-50 transition-colors placeholder:text-zinc-500 focus-visible:ring-2 focus-visible:ring-teal-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#121a18] focus-visible:outline-none";

const linkClasses =
  "rounded text-sm font-medium text-teal-300 underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-teal-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#121a18] focus-visible:outline-none";

export default function PasswordRecoveryPage() {
  const emailId = useId();
  const emailErrorId = useId();

  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    const trimmedEmail = email.trim();
    const nextEmailError = validateEmail(email);

    setEmailError(nextEmailError);

    if (nextEmailError) {
      return;
    }

    setIsSubmitting(true);

    try {
      await submitPasswordRecovery(trimmedEmail);
      setIsSubmitted(true);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthCard
      title="Recuperar senha"
      description="Informe o e-mail da sua conta para receber o link de redefinição de senha."
    >
      <div className="flex flex-col gap-5">
        {isSubmitted ? (
          <p role="status" className="text-sm leading-5 text-zinc-300">
            Se este e-mail estiver cadastrado, enviaremos um link para redefinir
            sua senha.
          </p>
        ) : (
          <form
            noValidate
            onSubmit={handleSubmit}
            className="flex flex-col gap-4"
          >
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor={emailId}
                className="text-sm font-medium text-zinc-200"
              >
                E-mail
              </label>
              <input
                id={emailId}
                name="email"
                type="email"
                autoComplete="email"
                placeholder="voce@email.com"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setEmailError(null);
                }}
                aria-invalid={emailError ? true : undefined}
                aria-describedby={emailError ? emailErrorId : undefined}
                className={inputClasses}
              />
              {emailError ? (
                <p
                  id={emailErrorId}
                  role="alert"
                  className="text-xs text-red-300"
                >
                  {emailError}
                </p>
              ) : null}
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-teal-600 focus-visible:ring-2 focus-visible:ring-teal-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#121a18] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? "Enviando..." : "Enviar link"}
            </button>
          </form>
        )}

        <Link href="/login" className={linkClasses}>
          Voltar para o login
        </Link>
      </div>
    </AuthCard>
  );
}
