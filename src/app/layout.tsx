import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { PwaRuntime } from "@/components/pwa-runtime";
import { SignupFlowProvider } from "@/components/signup-flow";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Sindicondo",
  description: "Gestão de condomínios e ocorrências.",
  applicationName: "Sindicondo",
  appleWebApp: {
    capable: true,
    title: "Sindicondo",
    statusBarStyle: "default",
  },
  icons: { apple: "/icons/apple-touch-icon.png" },

};

export const viewport: Viewport = { themeColor: "#0f766e" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <PwaRuntime>
          <SignupFlowProvider>{children}</SignupFlowProvider>
        </PwaRuntime>
      </body>
    </html>
  );
}
