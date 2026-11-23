"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  type Condominium,
  type Fields,
  validateFields,
} from "@/lib/condominiums/validation";

const control =
  "inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border font-semibold leading-[1.45] disabled:opacity-60 sm:min-h-0 pointer-coarse:min-h-11";
const secondary = `${control} border-[#d0d5dd] bg-white px-2.5 py-[5px] text-[13px] hover:border-[#6b7280]`;
const neutral = `${control} border-[#d0d5dd] bg-white px-3.5 py-2 text-sm hover:border-[#6b7280]`;
const primary = `${control} border-[#0f766e] bg-[#0f766e] px-3.5 py-2 text-sm text-white hover:bg-[#0b5e58]`;
const smallPrimary = `${control} border-[#0f766e] bg-[#0f766e] px-2.5 py-[5px] text-[13px] text-white hover:bg-[#0b5e58]`;
const card = "min-w-0 rounded-[10px] border border-[#e5e7eb] bg-white p-4";
const heading =
  "font-[family-name:var(--font-panel-heading)] leading-[1.45] font-bold tracking-[-0.01em] text-balance";

function useTemporaryNotice() {
  const [notice, setNotice] = useState<{ text: string } | null>(null);
  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(null), 5000);
    return () => window.clearTimeout(timeout);
  }, [notice]);
  return [
    notice?.text ?? "",
    (text: string) => setNotice(text ? { text } : null),
  ] as const;
}

function CondominiumForm({
  item,
  onCancel,
  onSaved,
}: {
  item?: Condominium;
  onCancel: () => void;
  onSaved: (item: Condominium) => void;
}) {
  const [fields, setFields] = useState<Fields>({
    name: item?.name ?? "",
    address: item?.address ?? "",
  });
  const [errors, setErrors] = useState<Partial<Fields>>({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);
  const form = useRef<HTMLFormElement>(null);
  const prefix = item?.id ?? "new";
  function invalid(next: Partial<Fields>) {
    setErrors(next);
    const field = next.name ? "name" : "address";
    form.current?.querySelector<HTMLInputElement>(`[name="${field}"]`)?.focus();
  }
  return (
    <form
      ref={form}
      className={
        item
          ? "flex flex-col gap-2.5"
          : `${card} mb-[18px] flex flex-col gap-3.5`
      }
      noValidate
      onSubmit={async (event) => {
        event.preventDefault();
        if (pending.current) return;
        const next = validateFields(fields);
        if (Object.keys(next).length) {
          invalid(next);
          return;
        }
        pending.current = true;
        setSaving(true);
        setErrors({});
        setError("");
        try {
          const response = await fetch(
            `/api/condominiums${item ? `/${item.id}` : ""}`,
            {
              method: item ? "PATCH" : "POST",
              credentials: "same-origin",
              cache: "no-store",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(fields),
            },
          );
          const result = await response.json();
          if (!response.ok) {
            if (result.errors) invalid(result.errors);
            else
              setError(
                result.error ?? "Não foi possível salvar. Tente novamente.",
              );
            return;
          }
          onSaved(result.condominium);
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
      <h2 className={`${heading} ${item ? "text-base" : "text-lg"}`}>
        {item ? "Editar condomínio" : "Novo condomínio"}
      </h2>
      <div className={item ? "grid gap-3" : "grid gap-3 sm:grid-cols-2"}>
        {(["name", "address"] as const).map((key) => (
          <div key={key} className="min-w-0">
            <label
              htmlFor={`${prefix}-${key}`}
              className="mb-[5px] block text-[13px] leading-[1.45] font-semibold"
            >
              {key === "name" ? "Nome" : "Endereço"}
            </label>
            <input
              id={`${prefix}-${key}`}
              name={key}
              autoFocus={key === "name"}
              required
              value={fields[key]}
              disabled={saving}
              aria-invalid={!!errors[key]}
              aria-describedby={
                errors[key] ? `${prefix}-${key}-error` : undefined
              }
              onChange={(event) =>
                setFields({ ...fields, [key]: event.target.value })
              }
              placeholder={
                key === "name"
                  ? "Ex.: Residencial Monte Verde"
                  : "Rua, número · cidade"
              }
              className="min-h-11 w-full min-w-0 rounded-lg border border-[#d0d5dd] bg-white px-2.5 py-2 text-[13px] leading-[1.45] font-semibold aria-invalid:border-[#b42318] focus:outline-2 focus:outline-offset-2 focus:outline-teal-700 sm:min-h-0 pointer-coarse:min-h-11"
            />
            {errors[key] && (
              <p
                id={`${prefix}-${key}-error`}
                className="mt-[5px] text-[12.5px] leading-[1.45] font-medium text-[#b42318]"
              >
                {errors[key]}
              </p>
            )}
          </div>
        ))}
      </div>
      {item && (
        <p className="text-xs leading-[1.45] text-[#6b7280]">
          O link continua o mesmo, porque os moradores já podem ter recebido.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-[#b42318]">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button disabled={saving} className={item ? smallPrimary : primary}>
          {saving ? "Salvando…" : item ? "Salvar" : "Salvar e gerar link"}
        </button>
        <button
          type="button"
          disabled={saving}
          className={item ? secondary : neutral}
          onClick={onCancel}
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

function CondominiumCard({
  item,
  fresh,
  onSaved,
}: {
  item: Condominium;
  fresh: boolean;
  onSaved: (item: Condominium) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [copyMessage, setCopyMessage] = useTemporaryNotice();
  const [updateMessage, setUpdateMessage] = useTemporaryNotice();
  const [copyError, setCopyError] = useState("");
  const edit = useRef<HTMLButtonElement>(null);
  return (
    <article
      className={`${card} [overflow-wrap:anywhere]`}
      aria-label={item.name}
    >
      {editing ? (
        <CondominiumForm
          item={item}
          onCancel={() => {
            setEditing(false);
            requestAnimationFrame(() => edit.current?.focus());
          }}
          onSaved={(value) => {
            onSaved(value);
            setEditing(false);
            setUpdateMessage("Condomínio atualizado. O link não mudou.");
            requestAnimationFrame(() => edit.current?.focus());
          }}
        />
      ) : (
        <>
          <div className="flex items-start justify-between gap-2">
            <h2 className={`${heading} min-w-0 text-base`}>{item.name}</h2>
            <button
              ref={edit}
              type="button"
              className={`${secondary} shrink-0`}
              onClick={() => {
                setCopyMessage("");
                setUpdateMessage("");
                setEditing(true);
              }}
            >
              Editar
            </button>
          </div>
          <p className="mt-0.5 text-[13px] leading-[1.45] text-[#4b5563]">
            {item.address}
          </p>
          <div className="mt-2.5 flex flex-col gap-1.5 rounded-lg border border-[#e5e7eb] bg-[#f6f7f9] p-2.5">
            <p
              role={fresh ? "status" : undefined}
              className="text-xs leading-[1.45] text-[#6b7280]"
            >
              {fresh
                ? "Pronto. Copie e envie este link aos moradores"
                : "Link do formulário de ocorrências"}
            </p>
            <p className="font-[family-name:var(--font-condominium-code)] text-[12.5px] leading-[1.45] font-normal tabular-nums [overflow-wrap:anywhere]">
              {item.url}
            </p>
            <button
              className={`${secondary} self-start`}
              type="button"
              onClick={async () => {
                setCopyMessage("");
                setUpdateMessage("");
                setCopyError("");
                try {
                  if (!navigator.clipboard?.writeText)
                    throw new Error("Clipboard unavailable");
                  await navigator.clipboard.writeText(item.url);
                  setCopyMessage("Link copiado");
                } catch {
                  setCopyError(
                    "Não foi possível copiar. Selecione e copie o link acima.",
                  );
                }
              }}
            >
              Copiar link
            </button>
            <p
              role="status"
              aria-live="polite"
              className={
                copyMessage
                  ? "text-xs leading-[1.45] text-[#6b7280]"
                  : "sr-only"
              }
            >
              {copyMessage}
            </p>
            {copyError && (
              <p role="alert" className="mt-2 text-[#b42318]">
                {copyError}
              </p>
            )}
          </div>
        </>
      )}
      <p
        role="status"
        aria-live="polite"
        className={
          updateMessage
            ? "mt-2.5 text-xs leading-[1.45] text-[#6b7280]"
            : "sr-only"
        }
      >
        {updateMessage}
      </p>
    </article>
  );
}

export function Condominiums() {
  const router = useRouter();
  const search = useSearchParams();
  const [items, setItems] = useState<Condominium[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [creating, setCreating] = useState(search.get("novo") === "1");
  const [fresh, setFresh] = useState<string>();
  const newButton = useRef<HTMLButtonElement>(null);
  const changes = useRef(0);
  useEffect(() => {
    let active = true;
    async function load() {
      const revision = changes.current;
      setLoading(true);
      setError("");
      try {
        const response = await fetch("/api/condominiums", {
          cache: "no-store",
          credentials: "same-origin",
        });
        if (response.status === 401) {
          router.replace("/login");
          return;
        }
        if (!response.ok) throw new Error("Unavailable");
        const result = await response.json();
        if (active && revision === changes.current)
          setItems(result.condominiums);
        else if (active)
          setItems((previous) => {
            const current = new Map(previous.map((item) => [item.id, item]));
            const loaded = new Set<string>(
              result.condominiums.map((item: Condominium) => item.id),
            );
            return [
              ...result.condominiums.map(
                (item: Condominium) => current.get(item.id) ?? item,
              ),
              ...previous.filter((item) => !loaded.has(item.id)),
            ];
          });
      } catch {
        if (active) setError("Não foi possível carregar os condomínios.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [attempt, router]);
  function saved(item: Condominium, created = false) {
    changes.current += 1;
    setItems((previous) =>
      created
        ? [...previous, item]
        : previous.map((value) => (value.id === item.id ? item : value)),
    );
    if (created) {
      setFresh(item.id);
      setCreating(false);
      requestAnimationFrame(() => newButton.current?.focus());
    }
    window.dispatchEvent(new Event("condominiums-changed"));
    router.refresh();
  }
  return (
    <div className="mx-auto max-w-[1080px]">
      <div className="mb-[18px] flex flex-wrap items-end justify-between gap-x-3.5 gap-y-2">
        <div>
          <h1 className={`${heading} text-2xl`}>Condomínios</h1>
          <p className="mt-1 max-w-[66ch] text-[#4b5563]">
            Cada condomínio tem um link próprio para o formulário de
            ocorrências. Basta nome e endereço.
          </p>
        </div>
        {!creating && (
          <button
            ref={newButton}
            className={primary}
            onClick={() => setCreating(true)}
          >
            Novo condomínio
          </button>
        )}
      </div>
      {creating && (
        <CondominiumForm
          onCancel={() => {
            setCreating(false);
            requestAnimationFrame(() => newButton.current?.focus());
          }}
          onSaved={(item) => saved(item, true)}
        />
      )}
      {loading ? (
        <p role="status">Carregando condomínios…</p>
      ) : error ? (
        <div role="alert">
          <p>{error}</p>
          <button
            className={`${secondary} mt-3`}
            onClick={() => setAttempt((value) => value + 1)}
          >
            Tentar novamente
          </button>
        </div>
      ) : !items.length ? (
        <p className={`${card} text-center`}>
          Nenhum condomínio cadastrado. Cadastre seu primeiro condomínio para
          gerar o link.
        </p>
      ) : (
        <div className="grid items-stretch gap-3 min-[560px]:grid-cols-2 min-[820px]:grid-cols-3 min-[1100px]:grid-cols-4">
          {items.map((item) => (
            <CondominiumCard
              key={item.id}
              item={item}
              fresh={item.id === fresh}
              onSaved={saved}
            />
          ))}
        </div>
      )}
    </div>
  );
}
