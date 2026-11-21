"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useLayoutEffect,
  useSyncExternalStore,
  useId,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { AuthCard } from "./auth-card";
import { signupStyles as styles } from "./signup-styles";
import { useRecoveryFlow } from "./recovery-flow";
import { submitNewPassword, submitPasswordRecovery } from "@/lib/auth/submit";
import { AuthRequestError } from "@/lib/auth/request";
import { getPasswordRequirements } from "@/lib/auth/signup-validation";

const subscribe = () => () => {};

function RecoveryScreen({
  initialStep = "email",
}: {
  initialStep?: "email" | "code";
}) {
  const flow = useRecoveryFlow();
  const router = useRouter();
  const id = useId();
  const ready = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const active = useRef(false);
  const version = useRef(0);
  const setFlowState = flow?.setState;
  const [step, setStep] = useState<"email" | "code" | "password">(initialStep);
  const [email, setEmail] = useState(flow?.state.email ?? "");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [status, setStatus] = useState("");
  const [needsNewCode, setNeedsNewCode] = useState(false);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const field = useRef<HTMLInputElement>(null);
  const message = useRef<HTMLParagraphElement>(null);
  const hasEmail = step === "email" || Boolean(flow?.state.email);
  const requirements = getPasswordRequirements(password);

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      version.current += 1;
      pending.current = false;
      setCode("");
      setPassword("");
      setStep(initialStep);
      setBusy(false);
      setNeedsNewCode(false);
      setError("");
      setFieldError("");
      setStatus("");
      setFlowState?.((current) => ({ ...current, code: "" }));
    };
  }, [setFlowState, initialStep]);

  useLayoutEffect(() => {
    const input = field.current;
    return () => {
      if (input) input.value = "";
    };
  }, [step]);

  function clearFeedback() {
    setError("");
    setFieldError("");
    setStatus("");
  }
  function changeEmail() {
    if (pending.current) return;
    flow?.setState({ email, code: "", passwordChanged: false });
    setCode("");
    setPassword("");
    clearFeedback();
    router.replace("/recuperar-senha");
  }

  async function sendCode(currentVersion: number) {
    await submitPasswordRecovery(email.trim());
    if (!active.current || version.current !== currentVersion) return;
    flow?.setState({ email: email.trim(), code: "", passwordChanged: false });
  }

  async function resend() {
    if (pending.current) return;
    pending.current = true;
    const currentVersion = version.current;
    setBusy(true);
    clearFeedback();
    setCode("");
    setPassword("");
    flow?.setState({ email, code: "", passwordChanged: false });
    try {
      await sendCode(currentVersion);
      if (!active.current || version.current !== currentVersion) return;
      setStep("code");
      setNeedsNewCode(false);
      setStatus(
        "Se houver uma conta com este e-mail, enviamos outro código. Use o código mais recente.",
      );
    } catch (failure) {
      if (!active.current || version.current !== currentVersion) return;
      setError(
        failure instanceof Error
          ? failure.message
          : "Não foi possível reenviar o código.",
      );
    } finally {
      if (version.current === currentVersion) {
        pending.current = false;
        setBusy(false);
      }
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending.current || needsNewCode) return;
    clearFeedback();
    let issue = "";
    if (step === "email") {
      if (!email.trim()) issue = "Informe seu e-mail.";
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
        issue = "Informe um e-mail válido.";
    } else if (step === "code") {
      if (!/^\d{6}$/.test(code)) issue = "Informe o código de seis dígitos.";
    } else if (requirements.some(({ met }) => !met))
      issue = "A senha ainda não cumpre os requisitos abaixo.";
    if (issue) {
      setFieldError(issue);
      field.current?.focus();
      return;
    }
    if (step === "code") {
      flow?.setState({ email, code, passwordChanged: false });
      setStep("password");
      setCode("");
      return;
    }
    pending.current = true;
    const currentVersion = version.current;
    setBusy(true);
    try {
      if (step === "email") {
        await sendCode(currentVersion);
        if (!active.current || version.current !== currentVersion) return;
        router.push("/confirmar-codigo/recuperacao");
      } else {
        await submitNewPassword({
          email,
          code: flow?.state.code ?? "",
          password,
        });
        if (!active.current || version.current !== currentVersion) return;
        setPassword("");
        flow?.setState({ email, code: "", passwordChanged: true });
        router.replace("/login");
        router.refresh();
      }
    } catch (failure) {
      if (!active.current || version.current !== currentVersion) return;
      if (step === "password") {
        setPassword("");
        setCode("");
        flow?.setState({ email, code: "", passwordChanged: false });
        setStep("code");
        setNeedsNewCode(
          !(
            failure instanceof AuthRequestError &&
            ["invalid_recovery_code", "rate_limited"].includes(failure.code)
          ),
        );
        const known =
          failure instanceof AuthRequestError &&
          ["invalid_recovery_code", "update_failed", "rate_limited"].includes(
            failure.code,
          );
        setError(
          known
            ? failure.message
            : "Não foi possível confirmar a alteração da senha. Solicite um novo código antes de tentar novamente.",
        );
      } else
        setError(
          failure instanceof Error
            ? failure.message
            : "Não foi possível solicitar o código.",
        );
      requestAnimationFrame(() => message.current?.focus());
    } finally {
      if (version.current === currentVersion) {
        pending.current = false;
        setBusy(false);
      }
    }
  }

  const title =
    step === "email"
      ? "Recuperar senha"
      : step === "code"
        ? "Digite o código"
        : "Crie uma nova senha";
  const description =
    step === "email" ? (
      "Informe o e-mail da sua conta. Enviaremos um código para criar uma nova senha."
    ) : step === "code" ? (
      <>
        Se houver uma conta com <strong>{email}</strong>, enviamos um código de
        6 dígitos. Ele vale por 15 minutos.
      </>
    ) : (
      "Use uma senha que você não usa em outros serviços."
    );
  const label =
    step === "email" ? "E-mail" : step === "code" ? "Código" : "Nova senha";
  return (
    <AuthCard
      variant="signup"
      verticalAlign="center"
      title={title}
      description={description}
      focusTitle
    >
      {!hasEmail ? (
        <>
          <p role="status" className={styles.status}>
            Informe o e-mail da sua conta para receber um código de recuperação.
          </p>
          <Link href="/recuperar-senha" className={styles.link}>
            Solicitar código
          </Link>
        </>
      ) : (
        <>
          {error && (
            <p
              ref={message}
              tabIndex={-1}
              role="alert"
              className={styles.error}
            >
              {error}
            </p>
          )}
          <form
            noValidate
            onSubmit={submit}
            className={styles.form}
            aria-busy={busy}
          >
            <div className={styles.field}>
              <label htmlFor={`${id}-field`}>{label}</label>
              {step !== "email" && (
                <p id={`${id}-hint`} className={styles.hint}>
                  {step === "code"
                    ? "Continuar confere apenas o formato. O código será validado ao salvar a nova senha."
                    : "O código e a nova senha serão conferidos juntos ao salvar."}
                </p>
              )}
              <div className="relative">
                <input
                  key={step}
                  ref={field}
                  id={`${id}-field`}
                  name={
                    step === "email"
                      ? "email"
                      : step === "code"
                        ? "code"
                        : "password"
                  }
                  type={
                    step === "email"
                      ? "email"
                      : step === "password" && !visible
                        ? "password"
                        : "text"
                  }
                  autoComplete={
                    step === "email"
                      ? "email"
                      : step === "code"
                        ? "one-time-code"
                        : "new-password"
                  }
                  inputMode={step === "code" ? "numeric" : undefined}
                  maxLength={step === "code" ? 6 : undefined}
                  placeholder={step === "email" ? "voce@email.com" : undefined}
                  value={
                    step === "email" ? email : step === "code" ? code : password
                  }
                  disabled={busy || !ready || needsNewCode}
                  onChange={(event) => {
                    const value = event.target.value;
                    if (step === "email") setEmail(value);
                    else if (step === "code") setCode(value.replace(/\D/g, ""));
                    else setPassword(value);
                    setFieldError("");
                  }}
                  aria-invalid={Boolean(fieldError)}
                  aria-describedby={
                    [
                      step !== "email" ? `${id}-hint` : "",
                      fieldError ? `${id}-error` : "",
                      step === "password" ? `${id}-requirements` : "",
                    ]
                      .filter(Boolean)
                      .join(" ") || undefined
                  }
                  className={
                    step === "code"
                      ? styles.code
                      : step === "password"
                        ? styles["password-input"]
                        : styles.input
                  }
                />
                {step === "password" && (
                  <button
                    type="button"
                    disabled={busy || !ready}
                    aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
                    aria-pressed={visible}
                    className={styles["password-toggle"]}
                    onClick={() => setVisible(!visible)}
                  >
                    {visible ? "Ocultar" : "Mostrar"}
                  </button>
                )}
              </div>
              {fieldError && (
                <p id={`${id}-error`} role="alert" className={styles.error}>
                  {fieldError}
                </p>
              )}
              {step === "password" && (
                <ul id={`${id}-requirements`} className={styles.requirements}>
                  {requirements.map(({ label: requirement, met }) => (
                    <li
                      key={requirement}
                      className={
                        met ? styles["requirement-met"] : styles.requirement
                      }
                    >
                      {requirement}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <button
              disabled={busy || !ready || needsNewCode}
              type="submit"
              className={styles.submit}
            >
              {busy
                ? step === "password"
                  ? "Salvando..."
                  : "Enviando..."
                : step === "email"
                  ? "Enviar código"
                  : step === "code"
                    ? "Continuar"
                    : "Salvar nova senha"}
            </button>
          </form>
          {step === "email" ? (
            <div className={styles.footer}>
              <Link href="/login" className={styles.link}>
                Voltar para o login
              </Link>
            </div>
          ) : (
            <div className={styles.actions}>
              <button
                disabled={busy || !ready}
                className={styles.link}
                onClick={changeEmail}
              >
                Trocar e-mail
              </button>
              <button
                disabled={busy || !ready}
                className={styles.link}
                onClick={resend}
              >
                Reenviar código
              </button>
            </div>
          )}
          {status && (
            <p role="status" className={styles.status}>
              {status}
            </p>
          )}
        </>
      )}
    </AuthCard>
  );
}

export function PasswordRecovery({
  initialStep = "email",
}: {
  initialStep?: "email" | "code";
}) {
  const flow = useRecoveryFlow();
  return (
    <RecoveryScreen
      key={initialStep === "code" ? flow?.state.email || "missing" : "email"}
      initialStep={initialStep}
    />
  );
}
