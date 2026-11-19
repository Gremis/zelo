"use client";

import { signupStyles } from "@/components/signup-styles";

import Link from "next/link";
import { useRouter } from "next/navigation";
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
  const { draft, setDraft, setRegistrationId, setMockConfirmationComplete } =
    useSignupFlow();
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
      setMockConfirmationComplete(false);
      const request = submitSignup(payload);
      setPassword("");
      setShowPassword(false);
      const result = await request;
      if (version !== screenVersion.current) return;
      if (result.ok) {
        setDraft({
          fullName: payload.fullName,
          email: result.email,
          phone: values.phone,
        });
        setRegistrationId(result.registrationId);
        router.push("/confirmar-codigo");
      } else {
        setSubmitError("Não foi possível criar sua conta. Tente novamente.");
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
      <form
        ref={formRef}
        noValidate
        onSubmit={handleSubmit}
        data-slot="form"
        className={signupStyles.form}
        aria-busy={isSubmitting}
      >
        <fieldset
          disabled={isSubmitting}
          data-slot="fields"
          className={signupStyles.fields}
        >
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
            <div key={name} data-slot="field" className={signupStyles.field}>
              <label
                htmlFor={`${id}-${name}`}
                data-slot="label"
                className={signupStyles.label}
              >
                {label}
              </label>
              {name === "email" && (
                <p
                  id={`${id}-email-hint`}
                  data-slot="hint"
                  className={signupStyles.hint}
                >
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
                data-slot="input"
                className={signupStyles.input}
              />
              {errors[name] && (
                <p
                  id={`${id}-${name}-error`}
                  role="alert"
                  data-slot="error"
                  className={signupStyles.error}
                >
                  {errors[name]}
                </p>
              )}
            </div>
          ))}
          <div data-slot="field" className={signupStyles.field}>
            <label
              htmlFor={`${id}-phone`}
              data-slot="label"
              className={signupStyles.label}
            >
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
              data-slot="input"
              className={signupStyles.input}
            />
            {errors.phone && (
              <p
                id={`${id}-phone-error`}
                role="alert"
                data-slot="error"
                className={signupStyles.error}
              >
                {errors.phone}
              </p>
            )}
          </div>
          <div data-slot="field" className={signupStyles.field}>
            <label
              htmlFor={`${id}-password`}
              data-slot="label"
              className={signupStyles.label}
            >
              Senha
            </label>
            <div
              data-slot="password-wrap"
              className={signupStyles["password-wrap"]}
            >
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
                data-slot="input"
                className={signupStyles["password-input"]}
              />
              <button
                type="button"
                aria-pressed={showPassword}
                onClick={() => setShowPassword((current) => !current)}
                data-slot="password-toggle"
                className={signupStyles["password-toggle"]}
              >
                {showPassword ? "Ocultar" : "Mostrar"}
              </button>
            </div>
            {errors.password && (
              <p
                id={`${id}-password-error`}
                role="alert"
                data-slot="error"
                className={signupStyles.error}
              >
                {errors.password}
              </p>
            )}
            <ul
              id={`${id}-requirements`}
              aria-label="Requisitos da senha"
              data-slot="requirements"
              className={signupStyles.requirements}
            >
              {getPasswordRequirements(password).map(({ label, met }) => (
                <li
                  key={label}
                  className={
                    met
                      ? signupStyles["requirement-met"]
                      : signupStyles.requirement
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
          <div data-slot="field" className={signupStyles.field}>
            <label
              data-slot="consent"
              className={signupStyles.consent}
              htmlFor={`${id}-acceptedTerms`}
            >
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
                data-slot="checkbox"
                className={signupStyles.checkbox}
              />
              Li e aceito o termo de uso e a política de privacidade
            </label>
            {errors.acceptedTerms && (
              <p
                id={`${id}-acceptedTerms-error`}
                role="alert"
                data-slot="error"
                className={signupStyles.error}
              >
                {errors.acceptedTerms}
              </p>
            )}
          </div>
          <button
            type="submit"
            disabled={isSubmitting}
            data-slot="submit"
            className={signupStyles.submit}
          >
            {isSubmitting ? "Enviando..." : "Criar conta"}
          </button>
        </fieldset>
        {submitError && (
          <p role="alert" data-slot="error" className={signupStyles.error}>
            {submitError}
          </p>
        )}
      </form>
      <p data-slot="footer" className={signupStyles.footer}>
        Já tem conta?{" "}
        <Link href="/login" data-slot="link" className={signupStyles.link}>
          Entrar
        </Link>
      </p>
    </AuthCard>
  );
}
