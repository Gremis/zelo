import type { ReactNode } from "react";

type AuthCardProps = {
  title: string;
  description: string;
  children: ReactNode;
};

export function AuthCard({ title, description, children }: AuthCardProps) {
  return (
    <main className="flex flex-1 items-center justify-center bg-[#0b1210] px-4 py-10">
      <div className="w-full max-w-[336px] rounded-2xl border border-white/10 bg-[#121a18] p-5 shadow-xl sm:p-6">
        <header className="mb-6 flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="flex size-8 items-center justify-center rounded-lg bg-teal-700 text-sm font-semibold text-white"
            >
              Z
            </span>
            <span className="text-sm font-semibold tracking-wide text-zinc-100">
              Zelo
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <h1 className="text-xl font-semibold text-white">{title}</h1>
            <p className="text-sm leading-5 text-zinc-400">{description}</p>
          </div>
        </header>
        {children}
      </div>
    </main>
  );
}
