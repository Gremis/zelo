import { act, fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { SignupFlowProvider, useSignupFlow } from "@/components/signup-flow";
import { PanelShell } from "@/components/panel-shell";
import type { PanelOperations } from "@/lib/panel/contract";

const navigation = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));
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
  expect(screen.getByText("Sair")).toBeEnabled();
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

function ContextProbe() {
  const flow = useSignupFlow();
  return (
    <>
      <button
        onClick={() => {
          flow.setDraft({
            fullName: "Pessoa Sintética",
            email: "synthetic@example.invalid",
            phone: "11999999999",
          });
          flow.setConfirmationComplete(true);
          flow.setShowFirstSteps(true);
          flow.setRegistrationId("synthetic");
        }}
      >
        Prepare context
      </button>
      <output>
        {flow.draft.fullName ||
        flow.draft.email ||
        flow.draft.phone ||
        flow.confirmationComplete ||
        flow.showFirstSteps ||
        flow.registrationId
          ? "Context retained"
          : "Context cleared"}
      </output>
    </>
  );
}

test("allows logout while panel loading is pending, blocks duplicate requests and clears context only on success", async () => {
  navigation.replace.mockClear();
  navigation.refresh.mockClear();
  let finish!: (result: Awaited<ReturnType<PanelOperations["logout"]>>) => void;
  const pending = new Promise<Awaited<ReturnType<PanelOperations["logout"]>>>(
    (resolve) => {
      finish = resolve;
    },
  );
  const operations: PanelOperations = {
    loadUser: vi.fn(
      () =>
        new Promise<Awaited<ReturnType<PanelOperations["loadUser"]>>>(() => {}),
    ),
    logout: vi
      .fn()
      .mockReturnValueOnce(pending)
      .mockResolvedValue({ ok: true, data: null }),
  };
  render(
    <SignupFlowProvider>
      <ContextProbe />
      <PanelShell
        title="Fila de ocorrências"
        currentPath="/fila"
        operations={operations}
      >
        Private content
      </PanelShell>
    </SignupFlowProvider>,
  );
  fireEvent.click(screen.getByText("Prepare context"));
  expect(screen.getByText("Context retained")).toBeInTheDocument();
  const exit = screen.getByText("Sair");
  expect(exit).toBeEnabled();
  fireEvent.click(exit);
  expect(screen.getByText("Saindo…")).toBeDisabled();
  fireEvent.click(screen.getByText("Saindo…"));
  expect(operations.logout).toHaveBeenCalledTimes(1);
  await act(async () => {
    finish({ ok: false, error: "unavailable" });
  });
  expect(
    screen.getByText("Não foi possível sair. Tente novamente."),
  ).toBeInTheDocument();
  expect(screen.getByText("Context retained")).toBeInTheDocument();
  expect(navigation.replace).not.toHaveBeenCalled();
  expect(navigation.refresh).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText("Sair"));
  await vi.waitFor(() =>
    expect(navigation.replace).toHaveBeenCalledWith("/login"),
  );
  expect(navigation.refresh).toHaveBeenCalledTimes(1);
  expect(screen.getByText("Context cleared")).toBeInTheDocument();
  expect(screen.queryByText("Private content")).not.toBeInTheDocument();
});
