"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { formatPhone } from "@/lib/auth/phone";
import { PhoneInput } from "@/components/phone-input";
import { validateCreateFuncionario } from "@/server/funcionarios/funcionarios.validation";
import type {
  Funcao,
  FuncionarioListItem,
} from "@/server/funcionarios/funcionarios.repository";
import type { Condominium } from "@/lib/condominiums/validation";

const button =
  "inline-flex min-h-11 cursor-pointer items-center justify-center rounded-lg border px-3.5 py-2 text-sm font-semibold disabled:cursor-wait disabled:opacity-60 sm:min-h-0 pointer-coarse:min-h-11";
const primary = `${button} border-[#0f766e] bg-[#0f766e] text-white hover:bg-[#0b5e58]`;
const secondary = `${button} border-[#d0d5dd] bg-white hover:border-[#6b7280]`;
const card = "min-w-0 rounded-[10px] border border-[#e5e7eb] bg-white p-4";
const heading =
  "font-[family-name:var(--font-panel-heading)] font-bold leading-[1.45] tracking-[-0.01em]";
const input =
  "min-h-11 w-full min-w-0 rounded-lg border border-[#d0d5dd] bg-white px-2.5 py-2 text-[13px] font-semibold leading-[1.45] aria-invalid:border-[#b42318] focus:outline-2 focus:outline-offset-2 focus:outline-teal-700 disabled:opacity-60 sm:min-h-0 pointer-coarse:min-h-11";
const newRole = "__new_role__";
const empty = {
  nome: "",
  celular: "",
  funcaoId: "",
  funcaoNome: "",
  condominioId: "",
  horarioTrabalho: "",
};
type Fields = typeof empty;
const keys = Object.keys(empty) as (keyof Fields)[];
const labels: Fields = {
  nome: "Nome e sobrenome",
  celular: "Celular",
  funcaoId: "Função",
  funcaoNome: "Nome da nova função",
  condominioId: "Condomínio",
  horarioTrabalho: "Horário de trabalho",
};

function displayPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  return formatPhone(
    digits.length === 13 && digits.startsWith("55") ? digits.slice(2) : digits,
  );
}

async function read<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, {
    cache: "no-store",
    credentials: "same-origin",
    signal,
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(
      result.error ?? "Não foi possível carregar os dados. Tente novamente.",
    );
  return result;
}

function EmployeeForm({
  onCancel,
  onSaved,
}: {
  onCancel: () => void;
  onSaved: (item: FuncionarioListItem) => void;
}) {
  const [fields, setFields] = useState<Fields>(empty);
  const [errors, setErrors] = useState<Partial<Fields>>({});
  const [roles, setRoles] = useState<Funcao[]>([]);
  const [condos, setCondos] = useState<Condominium[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);
  const invalidField = useRef<keyof Fields | undefined>(undefined);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setLoadError("");
      await Promise.all([
        read<{ funcoes: Funcao[] }>("/api/funcoes", controller.signal),
        read<{ condominiums: Condominium[] }>(
          "/api/condominiums",
          controller.signal,
        ),
      ])
        .then(([a, b]) => {
          if (controller.signal.aborted) return;
          setRoles(a.funcoes);
          setCondos(b.condominiums);
        })
        .catch((cause: Error) => {
          if (!controller.signal.aborted) setLoadError(cause.message);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }
    void load();
    return () => controller.abort();
  }, [attempt]);
  useEffect(() => {
    if (saving || !invalidField.current) return;
    form.current
      ?.querySelector<HTMLElement>(`[name="${invalidField.current}"]`)
      ?.focus();
    invalidField.current = undefined;
  }, [errors, saving]);
  function invalid(next: Partial<Fields>) {
    invalidField.current = keys.find((key) => next[key]);
    setErrors(next);
  }
  const creatingRole = fields.funcaoId === newRole;
  const ready = !loading && !loadError && condos.length > 0;
  return (
    <form
      ref={form}
      className={`${card} mb-[18px] max-w-[760px]`}
      noValidate
      aria-busy={saving}
      onSubmit={async (event) => {
        event.preventDefault();
        if (pending.current || !ready) return;
        const role = roles.find((item) => item.id === fields.funcaoId);
        const validation = validateCreateFuncionario({
          ...fields,
          funcaoNome: creatingRole ? fields.funcaoNome : role?.nome,
        });
        const next: Partial<Fields> = validation.ok
          ? {}
          : { ...validation.error.details };
        if (!creatingRole) {
          delete next.funcaoNome;
          if (!role) next.funcaoId = "Selecione a função.";
        }
        if (!condos.some((item) => item.id === fields.condominioId))
          next.condominioId = "Selecione o condomínio.";
        if (Object.keys(next).length) {
          invalid(next);
          return;
        }
        pending.current = true;
        setSaving(true);
        setErrors({});
        setError("");
        try {
          const { funcaoId, funcaoNome, ...employee } = fields;
          const payload = creatingRole
            ? { ...employee, funcaoNome }
            : { ...employee, funcaoId };
          const response = await fetch("/api/funcionarios", {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          const result = await response.json();
          if (!response.ok) {
            if (response.status === 409)
              invalid({
                celular:
                  "Esse celular já está cadastrado para outro funcionário.",
              });
            else if (result.details) invalid(result.details);
            else
              setError(
                result.error ?? "Não foi possível salvar. Tente novamente.",
              );
            return;
          }
          onSaved(result.funcionario);
        } catch {
          setError(
            "Não foi possível salvar. Confira sua conexão e tente novamente.",
          );
        } finally {
          pending.current = false;
          setSaving(false);
        }
      }}
    >
      <h2 className={`${heading} mb-3.5 text-lg`}>Novo funcionário</h2>
      {loading ? (
        <p role="status" className="mb-3">
          Carregando funções e condomínios…
        </p>
      ) : loadError ? (
        <div role="alert" className="mb-3">
          <p>{loadError}</p>
          <button
            type="button"
            className={`${secondary} mt-2`}
            onClick={() => setAttempt((n) => n + 1)}
          >
            Tentar novamente
          </button>
        </div>
      ) : (
        <>
          {!roles.length && (
            <div role="status" className="mb-3">
              <p>Nenhuma função disponível nesta carteira.</p>
              <button
                type="button"
                className={`${secondary} mt-2`}
                onClick={() => setAttempt((n) => n + 1)}
              >
                Tentar novamente
              </button>
            </div>
          )}
          {!condos.length && (
            <p role="status" className="mb-3">
              Cadastre um condomínio antes de cadastrar funcionários.{" "}
              <Link
                className="font-semibold text-teal-800 underline"
                href="/condominios?novo=1"
              >
                Ir para Condomínios
              </Link>
            </p>
          )}
        </>
      )}
      <div className="grid gap-x-3 gap-y-3.5 sm:grid-cols-2">
        {keys
          .filter((key) => key !== "funcaoNome")
          .map((key) => (
            <div
              key={key}
              className={`min-w-0 ${key === "horarioTrabalho" ? "sm:col-span-2" : ""}`}
            >
              <label
                htmlFor={`employee-${key}`}
                className="mb-[5px] block text-[13px] font-semibold"
              >
                {labels[key]}
                {key === "horarioTrabalho" && (
                  <span className="ml-2 font-normal text-[#6b7280]">
                    opcional
                  </span>
                )}
              </label>
              {key === "funcaoId" || key === "condominioId" ? (
                <div className="relative">
                  <select
                    id={`employee-${key}`}
                    name={key}
                    className={`${input} appearance-none pr-8`}
                    value={fields[key]}
                    disabled={saving || !ready}
                    required
                    aria-invalid={!!errors[key]}
                    aria-describedby={
                      errors[key] ? `employee-${key}-error` : undefined
                    }
                    onChange={(event) => {
                      const value = event.target.value;
                      setFields({
                        ...fields,
                        [key]: value,
                        ...(key === "funcaoId" ? { funcaoNome: "" } : {}),
                      });
                      if (key === "funcaoId")
                        setErrors((previous) => ({
                          ...previous,
                          funcaoId: undefined,
                          funcaoNome: undefined,
                        }));
                    }}
                  >
                    <option value="">
                      Selecione{" "}
                      {key === "funcaoId" ? "a função" : "o condomínio"}
                    </option>
                    {key === "funcaoId"
                      ? roles.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.nome}
                          </option>
                        ))
                      : condos.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                            {condos.filter((value) => value.name === item.name)
                              .length > 1
                              ? ` · ${item.address} · ${item.id}`
                              : ""}
                          </option>
                        ))}
                    {key === "funcaoId" && (
                      <option value={newRole}>+ Criar nova função</option>
                    )}
                  </select>
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 16 16"
                    fill="none"
                    className="pointer-events-none absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2"
                  >
                    <path
                      d="m3 6 5 5 5-5"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
              ) : key === "celular" ? (
                <PhoneInput
                  id={`employee-${key}`}
                  name={key}
                  className={input}
                  value={fields[key]}
                  onValueChange={(value) =>
                    setFields({ ...fields, celular: value })
                  }
                  required
                  disabled={saving}
                  placeholder="(00) 90000-0000"
                  aria-invalid={!!errors[key]}
                  aria-describedby={`employee-phone-help${errors[key] ? ` employee-${key}-error` : ""}`}
                />
              ) : (
                <input
                  id={`employee-${key}`}
                  name={key}
                  className={input}
                  value={fields[key]}
                  autoFocus={key === "nome"}
                  autoComplete={key === "nome" ? "name" : "off"}
                  maxLength={key === "nome" ? 100 : 200}
                  required={key === "nome"}
                  disabled={saving}
                  placeholder={
                    key === "horarioTrabalho"
                      ? "Ex.: seg a sex, 7h às 16h ou 12x36 noturno"
                      : undefined
                  }
                  aria-invalid={!!errors[key]}
                  aria-describedby={
                    errors[key] ? `employee-${key}-error` : undefined
                  }
                  onChange={(e) =>
                    setFields({ ...fields, [key]: e.target.value })
                  }
                />
              )}
              {errors[key] && (
                <p
                  id={`employee-${key}-error`}
                  className="mt-[5px] text-[12.5px] text-[#b42318]"
                >
                  {errors[key]}
                </p>
              )}
              {key === "funcaoId" && creatingRole && (
                <div className="mt-3">
                  <label
                    htmlFor="employee-funcaoNome"
                    className="mb-[5px] block text-[13px] font-semibold"
                  >
                    Nome da nova função
                  </label>
                  <input
                    id="employee-funcaoNome"
                    name="funcaoNome"
                    className={input}
                    value={fields.funcaoNome}
                    required
                    disabled={saving}
                    autoComplete="off"
                    maxLength={50}
                    placeholder="Ex.: Jardineiro"
                    aria-invalid={!!errors.funcaoNome}
                    aria-describedby={
                      errors.funcaoNome
                        ? "employee-funcaoNome-error"
                        : undefined
                    }
                    onChange={(event) =>
                      setFields({ ...fields, funcaoNome: event.target.value })
                    }
                  />
                  {errors.funcaoNome && (
                    <p
                      id="employee-funcaoNome-error"
                      className="mt-[5px] text-[12.5px] text-[#b42318]"
                    >
                      {errors.funcaoNome}
                    </p>
                  )}
                </div>
              )}
              {key === "celular" && (
                <p
                  id="employee-phone-help"
                  className="mt-[5px] text-xs text-[#6b7280]"
                >
                  Informe um celular com WhatsApp e DDD.
                </p>
              )}
            </div>
          ))}
      </div>
      {error && (
        <p role="alert" className="mt-3 text-[#b42318]">
          {error}
        </p>
      )}
      <div className="mt-3.5 flex flex-wrap gap-2">
        <button className={primary} disabled={!ready || saving}>
          {saving ? "Salvando…" : "Salvar funcionário"}
        </button>
        <button
          type="button"
          className={secondary}
          disabled={saving}
          onClick={onCancel}
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

function DeactivationDialog({
  employee,
  saving,
  error,
  onCancel,
  onConfirm,
}: {
  employee: FuncionarioListItem;
  saving: boolean;
  error: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    node.showModal();
    cancel.current?.focus();
    return () => {
      node.close();
      document.body.style.overflow = previous;
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      tabIndex={-1}
      aria-modal="true"
      aria-labelledby="deactivation-title"
      aria-describedby="deactivation-description deactivation-reactivation"
      onCancel={(event) => {
        event.preventDefault();
        if (!saving) onCancel();
      }}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const buttons = event.currentTarget.querySelectorAll<HTMLButtonElement>(
          "button:not(:disabled)",
        );
        const first = buttons[0];
        const last = buttons[buttons.length - 1];
        if (!first) {
          event.preventDefault();
          event.currentTarget.focus();
        } else if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }}
      className="fixed inset-0 m-auto max-h-[calc(100dvh-32px)] w-[calc(100%-32px)] max-w-[460px] overflow-y-auto rounded-[14px] border border-[#e5e7eb] bg-white p-5 sm:p-[22px] text-[#111827] shadow-xl backdrop:bg-[rgba(17,24,39,0.4)]"
    >
      <h2
        id="deactivation-title"
        className={`${heading} text-xl [overflow-wrap:anywhere]`}
      >
        Desativar {employee.nome}?
      </h2>
      <p id="deactivation-description" className="mt-4 text-[#4b5563]">
        {employee.nome.trim().split(/\s+/)[0]} deixa de aparecer na hora de
        delegar, e os links de tarefa enviados a ele param de funcionar. O
        histórico das ocorrências continua com o nome e as ações registradas.
      </p>
      <p id="deactivation-reactivation" className="mt-2 text-[#4b5563]">
        Dá para reativar depois na mesma lista.
      </p>
      <p role="status" className={saving ? "mt-3" : "sr-only"}>
        {saving ? "Desativando funcionário… Aguarde a confirmação." : ""}
      </p>
      {error && (
        <p role="alert" className="mt-3 text-[#b42318]">
          {error}
        </p>
      )}
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <button
          ref={cancel}
          className={secondary}
          disabled={saving}
          onClick={onCancel}
        >
          Cancelar
        </button>
        <button
          className={`${button} border-[#b42318] bg-[#b42318] text-white hover:bg-[#912018]`}
          disabled={saving}
          onClick={onConfirm}
        >
          {saving ? "Desativando…" : "Desativar"}
        </button>
      </div>
    </dialog>
  );
}

export function Employees() {
  const search = useSearchParams();
  const [creating, setCreating] = useState(search.get("novo") === "1");
  const [items, setItems] = useState<FuncionarioListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [attempt, setAttempt] = useState(0);
  const restoreFocus = useRef(false);
  const [selected, setSelected] = useState<FuncionarioListItem | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const [refreshError, setRefreshError] = useState("");
  const pendingAction = useRef(false);
  const focusId = useRef<string | null>(null);
  const changedId = useRef<string | null>(null);
  const reloadButton = useRef<HTMLButtonElement>(null);
  const actionButtons = useRef(new Map<string, HTMLButtonElement>());
  useEffect(() => {
    if (savingId || !focusId.current || selected) return;
    if (refreshError) reloadButton.current?.focus();
    else actionButtons.current.get(focusId.current)?.focus();
    focusId.current = null;
  }, [items, savingId, selected, refreshError]);
  async function refreshEmployees() {
    const result = await read<{ funcionarios: FuncionarioListItem[] }>(
      "/api/funcionarios",
    );
    setItems(result.funcionarios);
    setRefreshError("");
  }
  async function changeStatus(employee: FuncionarioListItem, ativo: boolean) {
    if (pendingAction.current) return;
    pendingAction.current = true;
    setSavingId(employee.id);
    setActionError("");
    setNotice("");
    try {
      const response = await fetch(`/api/funcionarios/${employee.id}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ativo }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          result.error ?? "Não foi possível salvar. Tente novamente.",
        );
      changedId.current = employee.id;
      setSelected(null);
      setNotice(ativo ? "Funcionário reativado." : "Funcionário desativado.");
      try {
        await refreshEmployees();
      } catch {
        setRefreshError(
          "A alteração foi salva, mas não foi possível atualizar a lista. Recarregue os dados para consultar o estado atual.",
        );
      }
    } catch (cause) {
      setActionError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível salvar. Tente novamente.",
      );
    } finally {
      focusId.current = employee.id;
      pendingAction.current = false;
      setSavingId(null);
    }
  }
  async function retryRefresh() {
    if (pendingAction.current) return;
    focusId.current = changedId.current;
    pendingAction.current = true;
    setSavingId("refresh");
    try {
      await refreshEmployees();
    } catch {
      setRefreshError(
        "A alteração foi salva, mas a lista continua indisponível. Tente recarregar os dados novamente.",
      );
    } finally {
      pendingAction.current = false;
      setSavingId(null);
    }
  }
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setError("");
      await read<{ funcionarios: FuncionarioListItem[] }>(
        "/api/funcionarios",
        controller.signal,
      )
        .then((result) => {
          if (!controller.signal.aborted) setItems(result.funcionarios);
        })
        .catch((cause: Error) => {
          if (!controller.signal.aborted) setError(cause.message);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }
    void load();
    return () => controller.abort();
  }, [attempt]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 5000);
    return () => window.clearTimeout(timer);
  }, [notice]);
  function close() {
    restoreFocus.current = true;
    setCreating(false);
  }
  return (
    <div className="mx-auto max-w-[1080px]">
      <div className="mb-[18px] flex flex-wrap items-end justify-between gap-x-3.5 gap-y-2">
        <div>
          <h1 className={`${heading} text-2xl`}>Funcionários</h1>
          <p className="mt-1 max-w-[66ch] text-[#4b5563]">
            Quem trabalha em cada prédio: zelador, porteiro, limpeza ou outra
            função. É para eles que você delega pelo WhatsApp, e eles recebem só
            o link da tarefa, sem login.
          </p>
        </div>
        {!creating && (
          <button
            ref={(node) => {
              if (node && restoreFocus.current) {
                restoreFocus.current = false;
                node.focus();
              }
            }}
            className={primary}
            disabled={savingId !== null}
            onClick={() => {
              setNotice("");
              setCreating(true);
            }}
          >
            Novo funcionário
          </button>
        )}
      </div>
      <p
        role="status"
        className={notice ? "mb-3 text-xs text-[#6b7280]" : "sr-only"}
      >
        {notice}
      </p>
      {creating && (
        <EmployeeForm
          onCancel={close}
          onSaved={() => {
            close();
            setNotice("Funcionário cadastrado.");
            setAttempt((n) => n + 1);
          }}
        />
      )}
      {!selected && savingId && (
        <p role="status" className="mb-3">
          {savingId === "refresh"
            ? "Atualizando a lista…"
            : "Atualizando funcionário…"}
        </p>
      )}
      {selected && (
        <DeactivationDialog
          employee={selected}
          saving={savingId === selected.id}
          error={actionError}
          onCancel={() => {
            focusId.current = selected.id;
            setSelected(null);
            setActionError("");
          }}
          onConfirm={() => void changeStatus(selected, false)}
        />
      )}
      {actionError && !selected && (
        <p role="alert" className="mb-3 text-[#b42318]">
          {actionError} Tente reativar novamente.
        </p>
      )}
      {refreshError && (
        <div role="alert" className="mb-3">
          <p>{refreshError}</p>
          <button
            ref={reloadButton}
            className={`${secondary} mt-2`}
            disabled={savingId !== null}
            onClick={() => void retryRefresh()}
          >
            {savingId === "refresh" ? "Recarregando…" : "Recarregar dados"}
          </button>
        </div>
      )}
      {loading ? (
        <p role="status">Carregando funcionários…</p>
      ) : error ? (
        <div role="alert">
          <p>{error}</p>
          <button
            className={`${secondary} mt-3`}
            onClick={() => setAttempt((n) => n + 1)}
          >
            Tentar novamente
          </button>
        </div>
      ) : !items.length ? (
        <p className={`${card} text-center`}>
          Nenhum funcionário cadastrado nesta carteira.
        </p>
      ) : (
        <div className="rounded-[10px] border border-[#e5e7eb] bg-white">
          <div
            className="hidden grid-cols-[1.2fr_1fr_minmax(224px,1.4fr)_minmax(212px,1.2fr)_minmax(136px,1fr)_184px] gap-3 border-b border-[#e5e7eb] px-4 py-3 text-xs font-semibold text-[#6b7280] lg:grid"
            aria-hidden="true"
          >
            {["Nome", "Função", "Condomínio", "Horário", "Celular"].map(
              (label) => (
                <span key={label}>{label}</span>
              ),
            )}
            <span />
          </div>
          <ul className="divide-y divide-[#e5e7eb]">
            {items.map((item) => (
              <li
                key={item.id}
                className={`min-w-0 p-4 lg:py-2 [overflow-wrap:anywhere] ${!item.ativo ? "bg-[#f9fafb] text-[#4b5563]" : ""}`}
              >
                <dl className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-[1.2fr_1fr_minmax(224px,1.4fr)_minmax(212px,1.2fr)_minmax(136px,1fr)_184px] lg:items-center lg:gap-3">
                  {[
                    ["Nome", item.nome],
                    ["Função", item.funcao ?? "—"],
                    ["Condomínio", item.condominio ?? "—"],
                    ["Horário", item.horarioTrabalho ?? "—"],
                    ["Celular", displayPhone(item.celular)],
                  ].map(([label, value]) => (
                    <div key={label} className="min-w-0">
                      <dt className="mb-0.5 text-xs text-[#6b7280] lg:sr-only">
                        {label}
                      </dt>
                      <dd
                        title={
                          label === "Horário" || label === "Condomínio"
                            ? value
                            : undefined
                        }
                        className={
                          label === "Nome"
                            ? "font-semibold"
                            : label === "Celular"
                              ? "whitespace-nowrap font-[family-name:var(--font-condominium-code)] text-[12.5px]"
                              : label === "Horário" || label === "Condomínio"
                                ? `lg:truncate ${value === "—" ? "text-[#6b7280]" : ""}`
                                : value === "—"
                                  ? "text-[#6b7280]"
                                  : ""
                        }
                      >
                        {value}
                      </dd>
                    </div>
                  ))}
                  <div>
                    <dt className="sr-only">Ações</dt>
                    <dd className="flex flex-wrap items-center gap-2 lg:justify-end">
                      {!item.ativo && (
                        <span className="rounded-full border border-[#e5e7eb] bg-[#f5f6f8] px-2 py-1 text-xs font-semibold text-[#4b5563]">
                          Desativado
                        </span>
                      )}
                      <button
                        ref={(node) => {
                          if (node) actionButtons.current.set(item.id, node);
                          else actionButtons.current.delete(item.id);
                        }}
                        className={`${button} border-[0.5px] border-[#d0d5dd] bg-white hover:border-[#6b7280]`}
                        aria-label={`${item.ativo ? "Desativar" : "Reativar"} ${item.nome}`}
                        disabled={
                          savingId !== null || !!refreshError || creating
                        }
                        onClick={() => {
                          setActionError("");
                          if (item.ativo) setSelected(item);
                          else void changeStatus(item, true);
                        }}
                      >
                        {savingId === item.id
                          ? "Salvando…"
                          : item.ativo
                            ? "Desativar"
                            : "Reativar"}
                      </button>
                    </dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
