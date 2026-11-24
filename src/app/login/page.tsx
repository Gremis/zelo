"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useLayoutEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { AuthCard } from "@/components/auth-card";
import { signupStyles } from "@/components/signup-styles";
import { AuthRequestError } from "@/lib/auth/request";
import { useSignupFlow } from "@/components/signup-flow";
import { useRecoveryFlow } from "@/components/recovery-flow";
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

const inputClasses = signupStyles.input;
const linkClasses = signupStyles.link;

function LoginForm() {
  const router = useRouter();
  const recovery = useRecoveryFlow();
  const { setShowFirstSteps } = useSignupFlow();
  const emailId = useId();
  const emailErrorId = useId();
  const passwordId = useId();
  const passwordErrorId = useId();
  const keepSignedInId = useId();

  const emailInputRef = useRef<HTMLInputElement>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState(
    recovery?.state.passwordChanged ? recovery.state.email : "",
  );
  const [password, setPassword] = useState("");
  const [keepSignedIn, setKeepSignedIn] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [credentialsError, setCredentialsError] = useState("");
  const pending = useRef(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const version = useRef(0);
  useLayoutEffect(
    () => () => {
      version.current += 1;
      pending.current = false;
      setPassword("");
      setIsSubmitting(false);
      if (passwordInputRef.current) passwordInputRef.current.value = "";
    },
    [],
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (pending.current) {
      return;
    }

    const trimmedEmail = email.trim();
    const nextEmailError = validateEmail(email);
    const nextPasswordError = password === "" ? "Informe sua senha." : null;

    setEmailError(nextEmailError);
    setPasswordError(nextPasswordError);
    setCredentialsError("");

    if (nextEmailError || nextPasswordError) {
      if (nextEmailError) {
        emailInputRef.current?.focus();
      } else {
        passwordInputRef.current?.focus();
      }
      return;
    }

    const currentVersion = version.current;
    pending.current = true;
    setIsSubmitting(true);

    try {
      await submitLogin({
        email: trimmedEmail,
        password,
        keepSignedIn,
      });
      if (currentVersion !== version.current) return;
      setShowFirstSteps(false);
      recovery?.setState({ email: "", code: "", passwordChanged: false });
      router.replace("/fila");
      router.refresh();
    } catch (error) {
      if (currentVersion !== version.current) return;
      setCredentialsError(
        error instanceof AuthRequestError
          ? error.message
          : "Serviço temporariamente indisponível. Tente novamente.",
      );
      emailInputRef.current?.focus();
    } finally {
      if (currentVersion === version.current) {
        pending.current = false;
        setIsSubmitting(false);
      }
    }
  }

  return (
    <AuthCard
      variant="signup"
      verticalAlign="center"
      title="Entrar"
      description="Painel do síndico profissional."
    >
      {recovery?.state.passwordChanged && (
        <p role="status" className="rounded-lg bg-green-100 p-3 text-green-800">
          Senha alterada. Entre com a nova senha.
        </p>
      )}
      <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
        {credentialsError ? (
          <p role="alert" className={signupStyles.error}>
            {credentialsError}
          </p>
        ) : null}
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor={emailId}
            className="text-sm font-medium text-[#111827]"
          >
            E-mail
          </label>
          <input
            ref={emailInputRef}
            id={emailId}
            name="email"
            type="email"
            autoComplete="username"
            placeholder="voce@email.com"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              setEmailError(null);
              setCredentialsError("");
            }}
            aria-invalid={emailError ? true : undefined}
            aria-describedby={emailError ? emailErrorId : undefined}
            className={inputClasses}
          />
          {emailError ? (
            <p
              id={emailErrorId}
              role="alert"
              className="text-xs text-[#b42318]"
            >
              {emailError}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor={passwordId}
            className="text-sm font-medium text-[#111827]"
          >
            Senha
          </label>
          <div className="relative">
            <input
              ref={passwordInputRef}
              id={passwordId}
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                setPasswordError(null);
                setCredentialsError("");
              }}
              aria-invalid={passwordError ? true : undefined}
              aria-describedby={passwordError ? passwordErrorId : undefined}
              className={`${inputClasses} pr-20`}
            />
            <button
              type="button"
              onClick={() => setShowPassword((visible) => !visible)}
              aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
              aria-pressed={showPassword}
              className={signupStyles["password-toggle"]}
            >
              {showPassword ? "Ocultar" : "Mostrar"}
            </button>
          </div>
          {passwordError ? (
            <p
              id={passwordErrorId}
              role="alert"
              className="text-xs text-[#b42318]"
            >
              {passwordError}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <label
            htmlFor={keepSignedInId}
            className="flex items-center gap-2 text-sm text-[#4b5563]"
          >
            <input
              id={keepSignedInId}
              name="keepSignedIn"
              type="checkbox"
              checked={keepSignedIn}
              onChange={(event) => setKeepSignedIn(event.target.checked)}
              className="size-4 accent-teal-700"
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
          className={signupStyles.submit}
        >
          {isSubmitting ? "Entrando..." : "Entrar"}
        </button>
      </form>
      <p className={signupStyles.help}>
        Desmarque para usar cookies de sessão. O navegador pode restaurar a
        sessão ao reabrir.
      </p>
      <p className={signupStyles.footer}>
        Ainda não tem conta?{" "}
        <Link href="/criar-conta" className={linkClasses}>
          Criar conta
        </Link>
      </p>
    </AuthCard>
  );
}

export default function LoginPage() {
  const recovery = useRecoveryFlow();
  return (
    <LoginForm
      key={
        recovery?.state.passwordChanged
          ? `${recovery.state.email}-changed`
          : "login"
      }
    />
  );
}
