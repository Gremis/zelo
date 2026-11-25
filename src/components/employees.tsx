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
  function invalid(next: Partial<Fields>) {
    setErrors(next);
    const key = keys.find((key) => next[key]);
    if (key)
      requestAnimationFrame(() =>
        form.current?.querySelector<HTMLElement>(`[name="${key}"]`)?.focus(),
      );
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

export function Employees() {
  const search = useSearchParams();
  const [creating, setCreating] = useState(search.get("novo") === "1");
  const [items, setItems] = useState<FuncionarioListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [attempt, setAttempt] = useState(0);
  const restoreFocus = useRef(false);
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
            Cadastre quem trabalha em cada prédio e consulte função, condomínio,
            horário e celular.
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
            className="hidden grid-cols-[1.2fr_1fr_1.4fr_1.2fr_1fr] gap-4 border-b border-[#e5e7eb] px-4 py-3 text-xs font-semibold text-[#6b7280] lg:grid"
            aria-hidden="true"
          >
            {["Nome", "Função", "Condomínio", "Horário", "Celular"].map(
              (label) => (
                <span key={label}>{label}</span>
              ),
            )}
          </div>
          <ul className="divide-y divide-[#e5e7eb]">
            {items.map((item) => (
              <li
                key={item.id}
                className="min-w-0 p-4 [overflow-wrap:anywhere]"
              >
                <dl className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-[1.2fr_1fr_1.4fr_1.2fr_1fr] lg:items-center lg:gap-4">
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
                        className={
                          label === "Nome"
                            ? "font-semibold"
                            : label === "Celular"
                              ? "font-[family-name:var(--font-condominium-code)] text-[12.5px]"
                              : value === "—"
                                ? "text-[#6b7280]"
                                : ""
                        }
                      >
                        {value}
                        {label === "Nome" && !item.ativo && (
                          <span className="ml-2 rounded border border-[#d0d5dd] px-1.5 py-0.5 text-xs font-normal text-[#6b7280]">
                            Inativo
                          </span>
                        )}
                      </dd>
                    </div>
                  ))}
                </dl>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
