"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { OccurrenceQueue } from "./occurrence-queue";
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
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const mounted = useRef(true);
  const initializing = useRef(true);
  const refreshing = useRef<AbortController | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      refreshing.current?.abort();
    };
  }, []);

  const refresh = useCallback(
    async (background = false) => {
      if (!mounted.current || initializing.current || refreshing.current)
        return;
      const controller = new AbortController();
      refreshing.current = controller;
      try {
        const data = await loadOccurrenceQueue(controller.signal);
        if (mounted.current && !controller.signal.aborted) {
          setState({ status: "success", data });
          setRefreshVersion((value) => value + 1);
        }
      } catch (error) {
        if (!mounted.current || controller.signal.aborted) return;
        const expired = error instanceof QueueLoadError && error.status === 401;
        const forbidden =
          error instanceof QueueLoadError && error.status === 403;
        if (expired) router.replace("/login");
        if (!background || expired || forbidden)
          setState({
            status: "error",
            message: expired
              ? "Sua sessão expirou. Entre novamente."
              : forbidden
                ? "Acesso não autorizado para consultar a fila."
                : "Alteração salva, mas não foi possível atualizar a fila. Tente novamente.",
          });
      } finally {
        if (refreshing.current === controller) refreshing.current = null;
      }
    },
    [router],
  );

  useEffect(() => {
    const update = () => {
      if (document.visibilityState === "visible" && navigator.onLine)
        void refresh(true);
    };
    window.addEventListener("focus", update);
    window.addEventListener("online", update);
    document.addEventListener("visibilitychange", update);
    const interval = window.setInterval(update, 15_000);
    return () => {
      window.removeEventListener("focus", update);
      window.removeEventListener("online", update);
      document.removeEventListener("visibilitychange", update);
      window.clearInterval(interval);
    };
  }, [refresh]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    async function load() {
      initializing.current = true;
      refreshing.current?.abort();
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
      } finally {
        if (active) initializing.current = false;
      }
    }
    void load();
    return () => {
      active = false;
      controller.abort();
    };
  }, [attempt, router, prepareDemo]);

  return (
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
              onChanged: refresh,
              refreshVersion,
            }
          : null
      }
    />
  );
}
