"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import type { FormEvent } from "react";
import { AuthCard } from "@/components/auth-card";
import { useSignupFlow } from "@/components/signup-flow";
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
  "w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-zinc-50 transition-colors placeholder:font-medium placeholder:text-zinc-300 focus-visible:ring-2 focus-visible:ring-teal-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#121a18] focus-visible:outline-none";

const linkClasses =
  "rounded text-sm font-medium text-teal-300 underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-teal-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#121a18] focus-visible:outline-none";

export default function PasswordRecoveryPage() {
  const router = useRouter();
  const { recoveryEmail, setRecoveryEmail } = useSignupFlow();
  const emailId = useId();
  const emailErrorId = useId();

  const [email, setEmail] = useState(recoveryEmail);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [requestError, setRequestError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    const trimmedEmail = email.trim();
    const nextEmailError = validateEmail(email);

    setEmailError(nextEmailError);
    setRequestError("");

    if (nextEmailError) {
      return;
    }

    setRecoveryEmail(trimmedEmail);
    setIsSubmitting(true);

    try {
      await submitPasswordRecovery(trimmedEmail);
      router.push("/confirmar-codigo/recuperacao");
    } catch {
      setRequestError("Não foi possível enviar o código. Tente novamente.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthCard
      title="Recuperar senha"
      description="Informe o e-mail da sua conta. Enviaremos um código para criar uma nova senha."
    >
      <div className="flex flex-col gap-5">
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
                setRecoveryEmail(event.target.value);
                setEmailError(null);
                setRequestError("");
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
            {isSubmitting ? "Enviando..." : "Enviar código"}
          </button>
          {requestError && (
            <p role="alert" className="text-xs text-red-300">
              {requestError}
            </p>
          )}
        </form>

        <Link href="/login" className={linkClasses}>
          Voltar para entrar
        </Link>
      </div>
    </AuthCard>
  );
}
