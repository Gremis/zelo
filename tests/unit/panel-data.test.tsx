import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import {
  PanelDataProvider,
  PanelSessionBoundary,
  usePanelData,
} from "@/components/panel-data";
import { PanelShell } from "@/components/panel-shell";
import { FirstSteps } from "@/components/first-steps";
import { SignupFlowProvider } from "@/components/signup-flow";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));

afterEach(() => vi.unstubAllGlobals());

function payload(name = "Pessoa Sintética", count = 0) {
  return {
    user: { name, initials: "PS", condominiumCount: count },
    firstSteps: { completed: count ? ["condominium"] : [], dismissed: false },
  };
}

test("shares the user and first steps request and refreshes both after condominium changes", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify(payload())));
  vi.stubGlobal("fetch", fetcher);
  render(
    <SignupFlowProvider>
      <PanelDataProvider sessionKey="synthetic-session">
        <PanelShell title="Fila de ocorrências" currentPath="/fila">
          <FirstSteps />
        </PanelShell>
      </PanelDataProvider>
    </SignupFlowProvider>,
  );
  expect(await screen.findByText("Pessoa Sintética")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Dispensar" })).toBeEnabled();
  expect(fetcher).toHaveBeenCalledTimes(1);
  fetcher.mockResolvedValueOnce(
    new Response(JSON.stringify(payload("Pessoa Sintética", 1))),
  );
  act(() => window.dispatchEvent(new Event("condominiums-changed")));
  expect(
    await screen.findByText("Síndico profissional · 1 condomínio"),
  ).toBeInTheDocument();
  expect(
    screen.getByText("Cadastre seu primeiro condomínio").closest("li"),
  ).toHaveClass("line-through");
  expect(fetcher).toHaveBeenCalledTimes(2);
  fetcher.mockResolvedValueOnce(
    new Response(JSON.stringify({ dismissed: true })),
  );
  fireEvent.click(screen.getByRole("button", { name: "Dispensar" }));
  await waitFor(() =>
    expect(
      screen.queryByRole("region", { name: "Primeiros passos" }),
    ).not.toBeInTheDocument(),
  );
  expect(fetcher).toHaveBeenCalledTimes(3);
});

function SessionProbe() {
  const panel = usePanelData()!;
  return (
    <>
      <p>{panel.data?.user.name ?? "Sem usuário"}</p>
      <button onClick={panel.clear}>Limpar sessão</button>
    </>
  );
}

test("keeps first steps dismissed when a condominium refresh returns an older snapshot", async () => {
  let finish!: (response: Response) => void;
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(new Response(JSON.stringify(payload())))
    .mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValueOnce(new Response(JSON.stringify({ dismissed: true })));
  vi.stubGlobal("fetch", fetcher);
  render(
    <PanelDataProvider sessionKey="synthetic-session">
      <FirstSteps />
    </PanelDataProvider>,
  );
  await screen.findByRole("button", { name: "Dispensar" });
  act(() => window.dispatchEvent(new Event("condominiums-changed")));
  fireEvent.click(screen.getByRole("button", { name: "Dispensar" }));
  await waitFor(() =>
    expect(
      screen.queryByRole("region", { name: "Primeiros passos" }),
    ).not.toBeInTheDocument(),
  );
  await act(async () =>
    finish(new Response(JSON.stringify(payload("Pessoa Sintética", 1)))),
  );
  expect(
    screen.queryByRole("region", { name: "Primeiros passos" }),
  ).not.toBeInTheDocument();
});

test("rejects late responses after an account switch and after clearing the session", async () => {
  let finish!: (response: Response) => void;
  let finishSecond!: (response: Response) => void;
  const fetcher = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    )
    .mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          finishSecond = resolve;
        }),
    );
  vi.stubGlobal("fetch", fetcher);
  const view = (key: string) => (
    <PanelDataProvider sessionKey="account-a">
      <SessionProbe />
      <PanelSessionBoundary sessionKey={key}>
        Conteúdo autorizado
      </PanelSessionBoundary>
    </PanelDataProvider>
  );
  const { rerender } = render(view("account-a"));
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  rerender(view("account-b"));
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  await act(async () =>
    finish(new Response(JSON.stringify(payload("Conta anterior")))),
  );
  expect(screen.queryByText("Conta anterior")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Limpar sessão" }));
  await act(async () =>
    finishSecond(new Response(JSON.stringify(payload("Conta encerrada")))),
  );
  expect(screen.queryByText("Conta encerrada")).not.toBeInTheDocument();
  expect(screen.getByText("Sem usuário")).toBeInTheDocument();
});
