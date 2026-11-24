"use client";

import { useEffect, useRef, useState } from "react";

const variants = {
  secondary:
    "min-h-11 rounded-lg border border-[#cfd5df] bg-white px-4 py-2 text-sm font-semibold text-[#111827] hover:bg-[#f0f2f5]",
  link: "min-h-9 rounded text-sm font-semibold text-[#0b5e58] underline underline-offset-2 hover:text-[#0f766e]",
};

export function CopyTrackingLink({
  link,
  label,
  variant = "secondary",
  className = "",
}: {
  link: string;
  label: string;
  variant?: keyof typeof variants;
  className?: string;
}) {
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function copy() {
    try {
      if (!navigator.clipboard) throw new Error("Clipboard unavailable.");
      await navigator.clipboard.writeText(link);
    } catch {
      setStatus("error");
      return;
    }
    setStatus("copied");
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setStatus("idle"), 4000);
  }

  return (
    <span
      className={`inline-flex min-w-0 flex-wrap items-center gap-2 ${className}`}
    >
      <button
        type="button"
        onClick={() => void copy()}
        className={`${variants[variant]} cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f766e]`}
      >
        {label}
      </button>
      {status !== "idle" && (
        <span role="status" className="text-sm font-medium">
          {status === "copied" ? (
            <span className="text-[#0b5e58]">Link copiado</span>
          ) : (
            <span className="text-[#b42318]">
              Não foi possível copiar. Selecione o link.
            </span>
          )}
        </span>
      )}
    </span>
  );
}
