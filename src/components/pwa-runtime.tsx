"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { FormEvent, ReactNode } from "react";

function subscribe(listener: () => void) {
  window.addEventListener("online", listener);
  window.addEventListener("offline", listener);
  return () => {
    window.removeEventListener("online", listener);
    window.removeEventListener("offline", listener);
  };
}

export function useOnlineStatus() {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
}

export function PwaRuntime({ children }: { children: ReactNode }) {
  const online = useOnlineStatus();

  useEffect(() => {
    if (
      process.env.NODE_ENV !== "production" ||
      !window.isSecureContext ||
      !("serviceWorker" in navigator)
    )
      return;
    let registration: ServiceWorkerRegistration | undefined;
    let active = true;
    const update = () => {
      if (document.visibilityState === "visible")
        void registration?.update().catch(() => undefined);
    };
    void navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then((result) => {
        if (active) registration = result;
      })
      .catch(() => undefined);
    document.addEventListener("visibilitychange", update);
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", update);
    };
  }, []);

  function preventOfflineSubmission(event: FormEvent) {
    if (!navigator.onLine) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  return (
    <div className="contents" onSubmitCapture={preventOfflineSubmission}>
      {!online && (
        <p
          role="status"
          className="m-0 border-b border-teal-200 bg-teal-50 px-4 py-3 text-sm leading-5 text-teal-950"
        >
          Você está sem conexão. Conecte-se à internet para enviar formulários e
          continuar.
        </p>
      )}
      {children}
    </div>
  );
}
