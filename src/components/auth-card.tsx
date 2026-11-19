import { BrandMark } from "@/components/brand-mark";
import { signupStyles } from "@/components/signup-styles";
import type { ReactNode } from "react";
import { Inter, Space_Grotesk, JetBrains_Mono } from "next/font/google";

const signupUi = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-signup-ui",
  display: "swap",
  adjustFontFallback: false,
  fallback: ["system-ui", "-apple-system", "Segoe UI", "sans-serif"],
});
const signupHeading = Space_Grotesk({
  subsets: ["latin"],
  weight: "700",
  variable: "--font-signup-heading",
  display: "swap",
  adjustFontFallback: false,
  fallback: ["Inter", "system-ui", "sans-serif"],
});
const signupCode = JetBrains_Mono({
  subsets: ["latin"],
  weight: "600",
  variable: "--font-signup-code",
  display: "swap",
  adjustFontFallback: false,
  fallback: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
});

type AuthCardProps = {
  title: string;
  description: ReactNode;
  children: ReactNode;
  variant?: "default" | "signup";
  focusTitle?: boolean;
};

export function AuthCard({
  title,
  description,
  children,
  variant = "default",
  focusTitle = false,
}: AuthCardProps) {
  if (variant === "signup") {
    return (
      <main
        lang="pt-BR"
        data-slot="screen"
        className={`${signupStyles.screen} ${signupUi.variable} ${signupHeading.variable} ${signupCode.variable}`}
      >
        <div data-slot="card" className={signupStyles.card}>
          <header data-slot="header" className={signupStyles.header}>
            <div data-slot="brand" className={signupStyles.brand}>
              <span
                aria-hidden="true"
                data-slot="brand-mark"
                className={signupStyles["brand-mark"]}
              >
                <BrandMark />
              </span>
              Sindicondo
            </div>
            <h1
              data-slot="title"
              className={signupStyles.title}
              tabIndex={focusTitle ? -1 : undefined}
              ref={
                focusTitle
                  ? (element) => {
                      element?.focus();
                    }
                  : undefined
              }
              aria-live={focusTitle ? "polite" : undefined}
            >
              {title}
            </h1>
            {description != null && (
              <p data-slot="description" className={signupStyles.description}>
                {description}
              </p>
            )}
          </header>
          {children}
        </div>
      </main>
    );
  }
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
