"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { OccurrenceQueue } from "./occurrence-queue";
import { ManagerOccurrenceForm } from "./manager-occurrence-form";
import {
  loadOccurrenceQueue,
  QueueLoadError,
} from "@/lib/occurrences/queue-request";
import type { PortfolioQueue } from "@/server/occurrences/queue.contract";

type LoadState =
  | { status: "loading" }
  | { status: "success"; data: PortfolioQueue }
  | { status: "error"; message?: string };

export function ConnectedOccurrenceQueue({
  prepareDemo = false,
}: {
  prepareDemo?: boolean;
}) {
  const router = useRouter();
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [openId, setOpenId] = useState<string | null>(null);
  const [registering, setRegistering] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    try {
      const data = await loadOccurrenceQueue();
      if (mounted.current) setState({ status: "success", data });
    } catch (error) {
      if (error instanceof QueueLoadError && error.status === 401)
        router.replace("/login");
    }
  }, [router]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    async function load() {
      setState({ status: "loading" });
      try {
        if (prepareDemo) {
          const response = await fetch("/api/demo/prepare", {
            method: "POST",
            credentials: "same-origin",
            cache: "no-store",
            signal: AbortSignal.any([
              controller.signal,
              AbortSignal.timeout(60_000),
            ]),
          });
          if (!response.ok)
            throw new QueueLoadError(
              response.status === 401
                ? 401
                : response.status === 403
                  ? 403
                  : 503,
            );
          const preparation: unknown = await response.json();
          if (
            !preparation ||
            typeof preparation !== "object" ||
            !("status" in preparation) ||
            !["ready", "disabled"].includes(String(preparation.status))
          )
            throw new QueueLoadError(503);
        }
        const data = await loadOccurrenceQueue(controller.signal);
        if (active) setState({ status: "success", data });
      } catch (error) {
        if (!active) return;
        const status = error instanceof QueueLoadError ? error.status : 503;
        setState({
          status: "error",
          message:
            status === 401
              ? "Sua sessão expirou. Entre novamente."
              : status === 403
                ? "Acesso não autorizado para consultar a fila."
                : prepareDemo
                  ? "Não foi possível preparar os exemplos ou carregar a fila. Tente novamente para retomar com segurança."
                  : undefined,
        });
        if (status === 401) router.replace("/login");
      }
    }
    void load();
    return () => {
      active = false;
      controller.abort();
    };
  }, [attempt, router, prepareDemo]);

  return (
    <>
      <div className="mb-4 flex justify-end">
        <button
          type="button"
          onClick={() => setRegistering(true)}
          className="min-h-11 rounded-lg bg-[#0f766e] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0b5e58]"
        >
          Registrar ocorrência
        </button>
      </div>
      <OccurrenceQueue
        state={
          state.status === "error"
            ? { ...state, onRetry: () => setAttempt((value) => value + 1) }
            : state
        }
        onOpenOccurrence={setOpenId}
        detail={
          openId
            ? {
                id: openId,
                onClose: () => setOpenId(null),
                onChanged: () => void refresh(),
              }
            : null
        }
      />
      {registering && (
        <ManagerOccurrenceForm
          onClose={() => setRegistering(false)}
          onRegistered={() => void refresh()}
        />
      )}
    </>
  );
}
