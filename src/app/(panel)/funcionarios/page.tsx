import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { panelAccess } from "@/server/auth/panel-access";
import { Employees } from "@/components/employees";
import { PanelSessionBoundary } from "@/components/panel-data";

export const metadata: Metadata = { title: "Funcionários | Sindicondo" };

async function ProtectedEmployees() {
  await connection();
  let access;
  try {
    access = await panelAccess();
  } catch {
    access = null;
  }
  if (!access) redirect("/login");
  if (!access.permitted)
    return (
      <PanelSessionBoundary sessionKey={access.sessionKey}>
        <main className="m-auto max-w-md p-8 text-center">
          <h1 className="text-2xl font-semibold">Acesso não autorizado</h1>
          <p className="mt-4">
            Esta área está disponível apenas para síndicos.
          </p>
          <a className="mt-6 inline-block underline" href="/login">
            Voltar para o login
          </a>
        </main>
      </PanelSessionBoundary>
    );
  return (
    <PanelSessionBoundary sessionKey={access.sessionKey}>
      <Employees />
    </PanelSessionBoundary>
  );
}

export default function EmployeesPage() {
  return (
    <Suspense fallback={<p role="status">Carregando painel…</p>}>
      <ProtectedEmployees />
    </Suspense>
  );
}
