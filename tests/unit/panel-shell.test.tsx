import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { SignupFlowProvider } from "@/components/signup-flow";
import { PanelShell } from "@/components/panel-shell";
import type { PanelOperations } from "@/lib/panel/contract";

const navigation = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));

test("retries rejected user loading without inventing a user", async () => {
  const operations: PanelOperations = {
    loadUser: vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue({
        ok: true,
        data: { name: "Pessoa Exemplo", initials: "PE", condominiumCount: 1 },
      }),
    logout: vi.fn(),
  };
  render(
    <SignupFlowProvider>
      <PanelShell
        title="Fila de ocorrências"
        currentPath="/fila"
        operations={operations}
      >
        Conteúdo
      </PanelShell>
    </SignupFlowProvider>,
  );
  expect(
    await screen.findByText("Não foi possível carregar os dados do painel."),
  ).toBeInTheDocument();
  expect(screen.queryByText("Pessoa Exemplo")).not.toBeInTheDocument();
  fireEvent.click(screen.getByText("Tentar novamente"));
  expect(await screen.findByText("Pessoa Exemplo")).toBeInTheDocument();
  expect(
    screen.getByText("Síndico profissional · 1 condomínio"),
  ).toBeInTheDocument();
});

test("retains context after logout failure and redirects only after successful retry", async () => {
  navigation.replace.mockClear();
  const operations: PanelOperations = {
    loadUser: vi.fn().mockResolvedValue({
      ok: true,
      data: { name: "Pessoa Exemplo", initials: "PE", condominiumCount: 0 },
    }),
    logout: vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue({ ok: true, data: null }),
  };
  render(
    <SignupFlowProvider>
      <PanelShell
        title="Fila de ocorrências"
        currentPath="/fila"
        operations={operations}
      >
        Conteúdo
      </PanelShell>
    </SignupFlowProvider>,
  );
  await screen.findByText("Pessoa Exemplo");
  fireEvent.click(screen.getByText("Sair"));
  expect(
    await screen.findByText("Não foi possível sair. Tente novamente."),
  ).toBeInTheDocument();
  expect(navigation.replace).not.toHaveBeenCalled();
  expect(screen.getByText("Pessoa Exemplo")).toBeInTheDocument();
  fireEvent.click(screen.getByText("Sair"));
  await vi.waitFor(() =>
    expect(navigation.replace).toHaveBeenCalledWith("/login"),
  );
  expect(screen.queryByText("Conteúdo")).not.toBeInTheDocument();
});
