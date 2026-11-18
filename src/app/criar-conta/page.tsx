"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { RegistrationDemoNotice } from "@/components/registration-demo-notice";
import { isRegistrationDemoEnabled } from "@/lib/auth/registration-demo";
import { useId, useLayoutEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { AuthCard } from "@/components/auth-card";
import { PhoneInput } from "@/components/phone-input";
import { useSignupFlow } from "@/components/signup-flow";
import {
  getPasswordRequirements,
  submitSignup,
  validateSignup,
} from "@/lib/auth/signup";
import type { SignupFormValues } from "@/lib/auth/signup";

export default function SignupPage() {
  const router = useRouter();
  const { draft, setDraft, setRegistrationId, demoScenario } = useSignupFlow();
  const demoEnabled = isRegistrationDemoEnabled();
  const id = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const submitting = useRef(false);
  const screenVersion = useRef(0);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [errors, setErrors] = useState<
    Partial<Record<keyof SignupFormValues, string>>
  >({});
  const [submitError, setSubmitError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useLayoutEffect(
    () => () => {
      screenVersion.current += 1;
      setPassword("");
      setShowPassword(false);
      setAcceptedTerms(false);
      setErrors({});
      setSubmitError("");
      if (passwordRef.current) passwordRef.current.value = "";
    },
    [],
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const values = { ...draft, password, acceptedTerms };
    const nextErrors = validateSignup(values);
    setErrors(nextErrors);
    setSubmitError("");
    const firstInvalid = Object.keys(nextErrors)[0];
    if (firstInvalid) {
      (
        formRef.current?.elements.namedItem(firstInvalid) as HTMLElement | null
      )?.focus();
      return;
    }
    submitting.current = true;
    const version = screenVersion.current;
    setIsSubmitting(true);
    try {
      const payload = {
        ...values,
        fullName: values.fullName.trim(),
        email: values.email.trim(),
        phone: values.phone.replace(/\D/g, ""),
      };
      setRegistrationId(null);
      const request = demoEnabled
        ? submitSignup(payload, demoScenario)
        : submitSignup(payload);
      setPassword("");
      setShowPassword(false);
      const result = await request;
      if (version !== screenVersion.current) return;
      if (result.ok && result.simulated && demoEnabled) {
        setDraft({
          fullName: payload.fullName,
          email: result.email,
          phone: values.phone,
        });
        setRegistrationId(result.registrationId);
        router.push("/confirmar-codigo");
      } else {
        setSubmitError(
          demoEnabled
            ? "Falha simulada no cadastro. Nenhuma conta real foi criada. Tente novamente."
            : "O cadastro está temporariamente indisponível. Não foi possível criar sua conta. Tente novamente mais tarde.",
        );
      }
    } catch {
      if (version === screenVersion.current) {
        setSubmitError(
          "O cadastro está temporariamente indisponível. Não foi possível criar sua conta. Tente novamente mais tarde.",
        );
      }
    } finally {
      setPassword("");
      setShowPassword(false);
      submitting.current = false;
      setIsSubmitting(false);
    }
  }

  return (
    <AuthCard
      variant="signup"
      title="Criar conta"
      description="Depois de confirmar o e-mail, você cadastra seus condomínios."
    >
      <RegistrationDemoNotice />
      <form
        ref={formRef}
        noValidate
        onSubmit={handleSubmit}
        className="signup-form"
        aria-busy={isSubmitting}
      >
        <fieldset disabled={isSubmitting} className="signup-fields">
          {(
            [
              {
                name: "fullName",
                label: "Nome completo",
                type: "text",
                autoComplete: "name",
                placeholder: "",
              },
              {
                name: "email",
                label: "E-mail",
                type: "email",
                autoComplete: "email",
                placeholder: "voce@email.com",
              },
            ] as const
          ).map(({ name, label, ...input }) => (
            <div key={name} className="signup-field">
              <label htmlFor={`${id}-${name}`} className="signup-label">
                {label}
              </label>
              {name === "email" && (
                <p id={`${id}-email-hint`} className="signup-hint">
                  Você vai usar para entrar
                </p>
              )}
              <input
                {...input}
                id={`${id}-${name}`}
                name={name}
                required
                value={draft[name]}
                onChange={(event) => {
                  setDraft((current) => ({
                    ...current,
                    [name]: event.target.value,
                  }));
                  setErrors((current) => ({ ...current, [name]: undefined }));
                  setSubmitError("");
                }}
                aria-invalid={Boolean(errors[name])}
                aria-describedby={
                  [
                    name === "email" ? `${id}-email-hint` : "",
                    errors[name] ? `${id}-${name}-error` : "",
                  ]
                    .filter(Boolean)
                    .join(" ") || undefined
                }
                className="signup-input"
              />
              {errors[name] && (
                <p
                  id={`${id}-${name}-error`}
                  role="alert"
                  className="signup-error"
                >
                  {errors[name]}
                </p>
              )}
            </div>
          ))}
          <div className="signup-field">
            <label htmlFor={`${id}-phone`} className="signup-label">
              Celular
            </label>
            <PhoneInput
              id={`${id}-phone`}
              name="phone"
              required
              placeholder="(31) 9____-____"
              value={draft.phone}
              onValueChange={(phone) => {
                setDraft((current) => ({ ...current, phone }));
                setErrors((current) => ({ ...current, phone: undefined }));
                setSubmitError("");
              }}
              aria-invalid={Boolean(errors.phone)}
              aria-describedby={errors.phone ? `${id}-phone-error` : undefined}
              className="signup-input"
            />
            {errors.phone && (
              <p id={`${id}-phone-error`} role="alert" className="signup-error">
                {errors.phone}
              </p>
            )}
          </div>
          <div className="signup-field">
            <label htmlFor={`${id}-password`} className="signup-label">
              Senha
            </label>
            <div className="signup-password-wrap">
              <input
                ref={passwordRef}
                id={`${id}-password`}
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                required
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  setErrors((current) => ({ ...current, password: undefined }));
                  setSubmitError("");
                }}
                aria-invalid={Boolean(errors.password)}
                aria-describedby={`${id}-requirements${errors.password ? ` ${id}-password-error` : ""}`}
                className="signup-input"
              />
              <button
                type="button"
                aria-pressed={showPassword}
                onClick={() => setShowPassword((current) => !current)}
                className="signup-password-toggle"
              >
                {showPassword ? "Ocultar" : "Mostrar"}
              </button>
            </div>
            {errors.password && (
              <p
                id={`${id}-password-error`}
                role="alert"
                className="signup-error"
              >
                {errors.password}
              </p>
            )}
            <ul
              id={`${id}-requirements`}
              aria-label="Requisitos da senha"
              className="signup-requirements"
            >
              {getPasswordRequirements(password).map(({ label, met }) => (
                <li
                  key={label}
                  className={
                    met ? "signup-requirement-met" : "signup-requirement"
                  }
                >
                  <span className="sr-only">
                    {met ? "Atendido: " : "Pendente: "}
                  </span>
                  {label}
                </li>
              ))}
            </ul>
          </div>
          <div className="signup-field">
            <label className="signup-consent" htmlFor={`${id}-acceptedTerms`}>
              <input
                id={`${id}-acceptedTerms`}
                name="acceptedTerms"
                type="checkbox"
                required
                checked={acceptedTerms}
                onChange={(event) => {
                  setAcceptedTerms(event.target.checked);
                  setErrors((current) => ({
                    ...current,
                    acceptedTerms: undefined,
                  }));
                }}
                aria-invalid={Boolean(errors.acceptedTerms)}
                aria-describedby={
                  errors.acceptedTerms ? `${id}-acceptedTerms-error` : undefined
                }
                className="signup-checkbox"
              />
              Li e aceito o termo de uso e a política de privacidade
            </label>
            {errors.acceptedTerms && (
              <p
                id={`${id}-acceptedTerms-error`}
                role="alert"
                className="signup-error"
              >
                {errors.acceptedTerms}
              </p>
            )}
          </div>
          <button
            type="submit"
            disabled={isSubmitting}
            className="signup-submit"
          >
            {isSubmitting ? "Enviando..." : "Criar conta"}
          </button>
        </fieldset>
        {submitError && (
          <p role="alert" className="signup-error">
            {submitError}
          </p>
        )}
      </form>
      <p className="signup-footer">
        Já tem conta?{" "}
        <Link href="/login" className="signup-link">
          Entrar
        </Link>
      </p>
    </AuthCard>
  );
}
