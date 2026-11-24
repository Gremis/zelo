"use client";

import { useEffect, useRef, useState } from "react";
import { useSignupFlow } from "@/components/signup-flow";

export function ConfirmationNotice() {
  const { confirmationComplete, setConfirmationComplete } = useSignupFlow();
  const [announcement, setAnnouncement] = useState(0);
  const [visible, setVisible] = useState(false);
  const timerVersion = useRef({ version: 0 });

  useEffect(() => {
    if (!confirmationComplete) return;
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setConfirmationComplete(false);
      setAnnouncement((value) => value + 1);
      setVisible(true);
    });
    return () => {
      active = false;
    };
  }, [confirmationComplete, setConfirmationComplete]);

  useEffect(() => {
    if (announcement === 0) return;
    const lifetime = timerVersion.current;
    const version = ++lifetime.version;
    let remaining = 8000;
    let started: number | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;

    function pause() {
      if (started !== null) remaining -= performance.now() - started;
      started = null;
      clearTimeout(timer);
    }

    function synchronize() {
      if (document.visibilityState !== "visible") {
        pause();
      } else if (started === null && remaining > 0) {
        started = performance.now();
        timer = setTimeout(() => {
          started = null;
          remaining = 0;
          setVisible(false);
        }, remaining);
      }
    }

    document.addEventListener("visibilitychange", synchronize);
    synchronize();
    return () => {
      pause();
      queueMicrotask(() => {
        if (lifetime.version === version) setVisible(false);
      });
      document.removeEventListener("visibilitychange", synchronize);
    };
  }, [announcement]);

  if (announcement === 0 || !visible) return null;
  return (
    <p
      role="status"
      aria-atomic="true"
      className="mb-[18px] rounded-lg border border-[#abefc6] bg-[#dcfae6] px-4 py-3 text-sm text-[#067647]"
    >
      E-mail confirmado. Conta criada.
    </p>
  );
}
