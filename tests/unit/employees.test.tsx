import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { Employees } from "@/components/employees";

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  useSearchParams: () => new URLSearchParams(),
}));
const router = { refresh: vi.fn() };
afterEach(() => vi.unstubAllGlobals());
function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status });
}

test("keeps form closed initially and discards cancellation without writing", async () => {
  const fetcher = vi.fn(async (url: string, options?: RequestInit) =>
    json(
      options?.method
        ? {}
        : url === "/api/funcionarios"
          ? { funcionarios: [] }
          : url === "/api/funcoes"
            ? { funcoes: [] }
            : { condominiums: [] },
    ),
  );
  vi.stubGlobal("fetch", fetcher);
  render(<Employees />);
  await screen.findByText("Nenhum funcionário cadastrado nesta carteira.");
  expect(screen.queryByLabelText("Nome e sobrenome")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Novo funcionário" }));
  await screen.findByText("Nenhuma função disponível nesta carteira.");
  expect(
    screen.getByRole("link", { name: "Ir para Condomínios" }),
  ).toHaveAttribute("href", "/condominios?novo=1");
  fireEvent.change(screen.getByLabelText("Nome e sobrenome"), {
    target: { value: "Descartado" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Novo funcionário" }),
    ).toHaveFocus(),
  );
  fireEvent.click(screen.getByRole("button", { name: "Novo funcionário" }));
  expect(screen.getByLabelText("Nome e sobrenome")).toHaveValue("");
  expect(
    fetcher.mock.calls.every(
      (call) => !(call[1] as RequestInit | undefined)?.method,
    ),
  ).toBe(true);
});

test("exposes role loading failures with a working retry and never invents options", async () => {
  let failed = true;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url === "/api/funcoes")
        return failed
          ? json({ error: "Funções indisponíveis" }, 503)
          : json({ funcoes: [] });
      return json(
        url === "/api/funcionarios"
          ? { funcionarios: [] }
          : { condominiums: [] },
      );
    }),
  );
  render(<Employees />);
  fireEvent.click(screen.getByRole("button", { name: "Novo funcionário" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Funções indisponíveis",
  );
  expect(
    screen.getByRole("button", { name: "Salvar funcionário" }),
  ).toBeDisabled();
  failed = false;
  fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
  await screen.findByText("Nenhuma função disponível nesta carteira.");
  expect(screen.getByLabelText("Função").children).toHaveLength(2);
});

test("identifies inactive employees without status controls and preserves labels", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      json({
        funcionarios: [
          {
            id: "synthetic",
            nome: "Funcionário Sintético",
            ativo: false,
            celular: "(11) 90000-0001",
            funcao: "Zelador",
            condominio: "Prédio sintético",
            horarioTrabalho: null,
          },
        ],
      }),
    ),
  );
  render(<Employees />);
  await screen.findByText("Funcionário Sintético");
  expect(screen.getByText("Inativo")).toBeVisible();
  expect(
    screen.queryByRole("button", { name: /[Rr]eativar|[Dd]esativar/ }),
  ).not.toBeInTheDocument();
  expect(screen.getByText("—")).toBeInTheDocument();
});
