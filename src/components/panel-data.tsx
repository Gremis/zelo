"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { loadPanel } from "@/lib/panel/request";
import { createFirstStepsOperations } from "@/lib/first-steps/operations";

type PanelResult = Awaited<ReturnType<typeof loadPanel>>;
type PanelData = Extract<PanelResult, { ok: true }>["data"];
type PanelContext = {
  sessionKey: string;
  data: PanelData | null;
  loading: boolean;
  error: boolean;
  refresh: () => void;
  clear: () => void;
  changeSession: (key: string) => void;
  dismiss: ReturnType<typeof createFirstStepsOperations>["dismiss"];
};

const Context = createContext<PanelContext | null>(null);

export function usePanelData() {
  return useContext(Context);
}

export function PanelDataProvider({
  sessionKey: initialSessionKey,
  children,
}: {
  sessionKey: string;
  children: ReactNode;
}) {
  const [sessionKey, setSessionKey] = useState(initialSessionKey);
  const [data, setData] = useState<PanelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const generation = useRef(0);
  const sessionVersion = useRef(0);
  const dismissed = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const [service] = useState(createFirstStepsOperations);

  const cancel = useCallback(() => {
    generation.current++;
    controller.current?.abort();
  }, []);

  const clear = useCallback(() => {
    cancel();
    sessionVersion.current++;
    dismissed.current = false;
    setData(null);
    setError(false);
    setLoading(false);
  }, [cancel]);

  const refresh = useCallback(() => {
    const revision = ++generation.current;
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    setLoading(true);
    setError(false);
    void loadPanel(request.signal).then((result) => {
      if (request.signal.aborted || revision !== generation.current) return;
      if (result.ok)
        setData({
          ...result.data,
          firstSteps: {
            ...result.data.firstSteps,
            dismissed: dismissed.current || result.data.firstSteps.dismissed,
          },
        });
      else {
        setData(null);
        setError(true);
      }
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) refresh();
    });
    window.addEventListener("condominiums-changed", refresh);
    return () => {
      active = false;
      cancel();
      window.removeEventListener("condominiums-changed", refresh);
    };
  }, [sessionKey, refresh, cancel]);

  const changeSession = useCallback(
    (key: string) => {
      clear();
      setSessionKey(key);
    },
    [clear],
  );

  const dismiss = useCallback(async () => {
    const revision = sessionVersion.current;
    const result = await service.dismiss();
    if (revision !== sessionVersion.current)
      return { ok: false as const, error: "unavailable" as const };
    if (result.ok) {
      dismissed.current = true;
      setData((previous) =>
        previous
          ? {
              ...previous,
              firstSteps: { ...previous.firstSteps, dismissed: true },
            }
          : previous,
      );
    }
    return result;
  }, [service]);

  const value = useMemo(
    () => ({
      sessionKey,
      data,
      loading,
      error,
      refresh,
      clear,
      changeSession,
      dismiss,
    }),
    [sessionKey, data, loading, error, refresh, clear, changeSession, dismiss],
  );

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function PanelSessionBoundary({
  sessionKey,
  children,
}: {
  sessionKey: string;
  children: ReactNode;
}) {
  const panel = usePanelData();
  const currentKey = panel?.sessionKey;
  const changeSession = panel?.changeSession;
  useLayoutEffect(() => {
    if (currentKey !== sessionKey) changeSession?.(sessionKey);
  }, [currentKey, sessionKey, changeSession]);
  return panel === null || currentKey === sessionKey ? children : null;
}
