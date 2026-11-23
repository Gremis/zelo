"use client";

import Link from "next/link";
import { useSignupFlow } from "@/components/signup-flow";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { BrandMark } from "@/components/brand-mark";
import type { PanelOperations, PanelUser } from "@/lib/panel/contract";
import { createPanelOperations } from "@/lib/panel/operations";

const button =
  "cursor-pointer rounded-lg border border-[#d0d5dd] bg-white px-2.5 py-[5px] text-[13px] font-semibold leading-[1.45] hover:border-[#6b7280] active:bg-[#e3f1ef] disabled:cursor-wait disabled:opacity-60";
const navigation = [
  {
    group: "Dia a dia",
    items: [
      { title: "Fila de ocorrências", href: "/fila" },
      { title: "Histórico de ocorrências", href: null },
    ],
  },
  {
    group: "Cadastros",
    items: [
      { title: "Condomínios", href: null },
      { title: "Funcionários", href: null },
    ],
  },
];

function Brand() {
  return (
    <span className="flex shrink-0 items-center gap-[9px] font-[family-name:var(--font-panel-heading)] text-[17px] font-bold">
      <BrandMark className="size-[26px] shrink-0" />
      Sindicondo
    </span>
  );
}

function Avatar({ user }: { user: PanelUser | null }) {
  return (
    <span
      title={user?.name}
      aria-label={user ? `Usuário: ${user.name}` : "Usuário"}
      className="grid size-[34px] shrink-0 place-items-center rounded-full bg-[#e3f1ef] text-[13px] font-bold text-[#0b5e58]"
    >
      {user?.initials ?? ""}
    </span>
  );
}

export function PanelShell({
  title,
  currentPath,
  children,
  operations,
}: {
  title: string;
  currentPath: string;
  children: ReactNode;
  operations?: PanelOperations;
}) {
  const router = useRouter();
  const {
    setConfirmationComplete,
    setDraft,
    setRegistrationId,
    setRecoveryEmail,
  } = useSignupFlow();
  const [service] = useState(() => operations ?? createPanelOperations());
  const [user, setUser] = useState<PanelUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [signedOut, setSignedOut] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const result = await service.loadUser();
        if (active) {
          if (result.ok) setUser(result.data);
          else setError("Não foi possível carregar os dados do painel.");
        }
      } catch {
        if (active) setError("Não foi possível carregar os dados do painel.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [service, attempt]);

  useEffect(() => {
    if (!open) return;
    const node = dialog.current;
    if (!node) return;
    const opener = trigger.current;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    node.showModal();
    return () => {
      node.close();
      document.body.style.overflow = previous;
      opener?.focus();
    };
  }, [open]);

  async function logout() {
    setLeaving(true);
    setError(null);
    try {
      const result = await service.logout();
      if (result.ok) {
        setConfirmationComplete(false);
        setDraft({ fullName: "", email: "", phone: "" });
        setRegistrationId(null);
        setRecoveryEmail("");
        setUser(null);
        setOpen(false);
        setSignedOut(true);
        router.replace("/login");
        router.refresh();
      } else setError("Não foi possível sair. Tente novamente.");
    } catch {
      setError("Não foi possível sair. Tente novamente.");
    } finally {
      setLeaving(false);
    }
  }

  if (signedOut) return null;

  return (
    <>
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-[#e5e7eb] bg-white px-4 py-2.5">
        <button
          ref={trigger}
          type="button"
          aria-label={open ? "Fechar menu" : "Abrir menu"}
          aria-expanded={open}
          aria-controls="panel-menu"
          aria-haspopup="dialog"
          onClick={() => setOpen((value) => !value)}
          className="grid size-10 shrink-0 cursor-pointer place-items-center rounded-[10px] border border-[#d0d5dd] hover:border-[#6b7280] active:bg-[#e3f1ef]"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M3 5h14M3 10h14M3 15h14" />
          </svg>
        </button>
        <Brand />
        <span className="hidden min-w-0 truncate min-[561px]:block border-l border-[#e5e7eb] pl-3 font-medium text-[#4b5563]">
          {title}
        </span>
        <span className="flex-1" />
        <Avatar user={user} />
      </header>
      <main className="px-4 pt-[22px] pb-10">
        <div className="mx-auto max-w-[1320px]">{children}</div>
      </main>
      <dialog
        ref={dialog}
        id="panel-menu"
        aria-labelledby="panel-menu-title"
        aria-modal="true"
        onKeyDown={(event) => {
          if (event.key !== "Tab") return;
          const items = event.currentTarget.querySelectorAll<HTMLElement>(
            "button:not(:disabled), a[href], [tabindex='0']",
          );
          const first = items[0];
          const last = items[items.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }}
        onCancel={() => setOpen(false)}
        onClose={() => setOpen(false)}
        onClick={(event) => {
          if (event.target !== event.currentTarget) return;
          const rect = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < rect.left ||
            event.clientX > rect.right ||
            event.clientY < rect.top ||
            event.clientY > rect.bottom
          )
            setOpen(false);
        }}
        className="fixed inset-y-0 left-0 m-0 h-dvh max-h-none w-[min(300px,86%)] max-w-none border-0 bg-white px-3 py-3.5 text-[#111827] shadow-[12px_0_32px_rgba(17,24,39,0.14)] backdrop:cursor-pointer backdrop:bg-[rgba(17,24,39,0.32)] open:flex open:flex-col open:gap-1"
      >
        <div className="flex items-center justify-between gap-2 px-1.5 pb-2.5">
          <span id="panel-menu-title">
            <Brand />
          </span>
          <button
            type="button"
            autoFocus
            className={button}
            onClick={() => setOpen(false)}
          >
            Fechar
          </button>
        </div>
        <div
          aria-busy={loading}
          className="mb-2 flex min-h-[65px] items-center gap-2.5 rounded-[10px] bg-[#f6f7f9] px-2.5 py-3"
        >
          <Avatar user={user} />
          <div className="min-w-0">
            {loading ? (
              <p role="status">Carregando usuário…</p>
            ) : user ? (
              <>
                <p className="break-words font-bold">{user.name}</p>
                <p className="text-xs text-[#6b7280]">
                  Síndico profissional · {user.condominiumCount}{" "}
                  {user.condominiumCount === 1 ? "condomínio" : "condomínios"}
                </p>
              </>
            ) : (
              <p className="text-xs text-[#6b7280]">Dados indisponíveis</p>
            )}
          </div>
        </div>
        {error && (
          <div role="alert" className="px-2.5 text-xs text-[#b42318]">
            <p>{error}</p>
            {!user && (
              <button
                type="button"
                onClick={() => setAttempt((value) => value + 1)}
                className={`${button} mt-2`}
              >
                Tentar novamente
              </button>
            )}
          </div>
        )}
        <nav aria-label="Menu principal">
          {navigation.map((group) => (
            <div key={group.group}>
              <h2 className="px-2.5 pt-3 pb-1 text-[11px] font-semibold tracking-[.06em] text-[#6b7280] uppercase">
                {group.group}
              </h2>
              {group.items.map((item) =>
                item.href ? (
                  <Link
                    key={item.title}
                    href={item.href}
                    aria-current={
                      currentPath === item.href ? "page" : undefined
                    }
                    onClick={() => setOpen(false)}
                    className="flex w-full cursor-pointer items-center rounded-lg p-2.5 font-medium hover:bg-[#f6f7f9] active:bg-[#e3f1ef] aria-[current=page]:bg-[#e3f1ef] aria-[current=page]:font-semibold aria-[current=page]:text-[#0b5e58]"
                  >
                    {item.title}
                  </Link>
                ) : (
                  <button
                    key={item.title}
                    type="button"
                    disabled
                    aria-describedby="panel-destination-unavailable"
                    title="Esta tela ainda não está disponível."
                    className="flex w-full cursor-not-allowed items-center rounded-lg p-2.5 text-left font-medium text-[#6b7280]"
                  >
                    {item.title}
                  </button>
                ),
              )}
            </div>
          ))}
        </nav>
        <p id="panel-destination-unavailable" className="sr-only">
          Esta tela ainda não está disponível.
        </p>
        <button
          type="button"
          disabled={!user || leaving}
          onClick={logout}
          className="mt-auto flex min-h-10 w-full cursor-pointer items-center rounded-lg p-2.5 text-left font-medium text-[#b42318] hover:bg-[#f6f7f9] active:bg-[#fee4e2] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {leaving ? "Saindo…" : "Sair"}
        </button>
      </dialog>
    </>
  );
}
