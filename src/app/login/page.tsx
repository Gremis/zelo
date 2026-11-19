"use client";

import Link from "next/link";
import { useId, useState } from "react";
import type { FormEvent } from "react";
import { AuthCard } from "@/components/auth-card";
import { submitLogin } from "@/lib/auth/submit";

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

export default function LoginPage() {
  const emailId = useId();
  const emailErrorId = useId();
  const passwordId = useId();
  const passwordErrorId = useId();
  const keepSignedInId = useId();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [keepSignedIn, setKeepSignedIn] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    const trimmedEmail = email.trim();
    const nextEmailError = validateEmail(email);
    const nextPasswordError = password === "" ? "Informe sua senha." : null;

    setEmailError(nextEmailError);
    setPasswordError(nextPasswordError);

    if (nextEmailError || nextPasswordError) {
      return;
    }

    setIsSubmitting(true);

    try {
      await submitLogin({
        email: trimmedEmail,
        password,
        keepSignedIn,
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthCard title="Entrar" description="Acesse sua conta.">
      <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
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
            autoComplete="username"
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
            <p id={emailErrorId} role="alert" className="text-xs text-red-300">
              {emailError}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor={passwordId}
            className="text-sm font-medium text-zinc-200"
          >
            Senha
          </label>
          <div className="relative">
            <input
              id={passwordId}
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                setPasswordError(null);
              }}
              aria-invalid={passwordError ? true : undefined}
              aria-describedby={passwordError ? passwordErrorId : undefined}
              className={`${inputClasses} pr-20`}
            />
            <button
              type="button"
              onClick={() => setShowPassword((visible) => !visible)}
              aria-pressed={showPassword}
              className="absolute inset-y-0 right-0 flex items-center rounded pr-3 text-xs font-medium text-teal-300 hover:text-teal-200 focus-visible:ring-2 focus-visible:ring-teal-400 focus-visible:outline-none"
            >
              {showPassword ? "Ocultar" : "Mostrar"}
            </button>
          </div>
          {passwordError ? (
            <p
              id={passwordErrorId}
              role="alert"
              className="text-xs text-red-300"
            >
              {passwordError}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <label
            htmlFor={keepSignedInId}
            className="flex items-center gap-2 text-sm text-zinc-300"
          >
            <input
              id={keepSignedInId}
              name="keepSignedIn"
              type="checkbox"
              checked={keepSignedIn}
              onChange={(event) => setKeepSignedIn(event.target.checked)}
              className="size-4 rounded border-white/25 bg-white/5 accent-teal-600 focus-visible:ring-2 focus-visible:ring-teal-400 focus-visible:outline-none"
            />
            Manter conectado
          </label>
          <Link href="/recuperar-senha" className={linkClasses}>
            Esqueci minha senha
          </Link>
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-teal-600 focus-visible:ring-2 focus-visible:ring-teal-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#121a18] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? "Entrando..." : "Entrar"}
        </button>
      </form>
      <p className="mt-5 text-center text-sm text-zinc-300">
        Ainda não tem conta?{" "}
        <Link href="/criar-conta" className={linkClasses}>
          Criar conta
        </Link>
      </p>
    </AuthCard>
  );
}
