import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { Employees } from "@/components/employees";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));
const employee = {
  id: "synthetic-id",
  nome: "Pessoa Sintética",
  celular: "11900000001",
  ativo: true,
  funcao: "Zelador",
  condominio: "Prédio sintético",
  horarioTrabalho: "Escala livre",
};
function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status });
}
beforeEach(() => {
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: {
      configurable: true,
      value: function (this: HTMLDialogElement) {
        this.setAttribute("open", "");
      },
    },
    close: {
      configurable: true,
      value: function (this: HTMLDialogElement) {
        this.removeAttribute("open");
      },
    },
  });
});
afterEach(() => {
  cleanup();
  Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
  Reflect.deleteProperty(HTMLDialogElement.prototype, "close");
  vi.unstubAllGlobals();
});
async function open() {
  render(<Employees />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Desativar Pessoa Sintética" }),
  );
  return screen.getByRole("dialog", { name: "Desativar Pessoa Sintética?" });
}
test("names the confirmation, focuses cancel, traps both directions and cancels without writing", async () => {
  const fetcher = vi.fn(async () => json({ funcionarios: [employee] }));
  vi.stubGlobal("fetch", fetcher);
  const dialog = await open();
  const cancel = within(dialog).getByRole("button", { name: "Cancelar" });
  const confirm = within(dialog).getByRole("button", { name: "Desativar" });
  expect(cancel).toHaveFocus();
  expect(dialog).toHaveAccessibleDescription(
    "Pessoa deixa de aparecer na hora de delegar, e os links de tarefa enviados a ele param de funcionar. O histórico das ocorrências continua com o nome e as ações registradas. Dá para reativar depois na mesma lista.",
  );
  fireEvent.keyDown(cancel, { key: "Tab", shiftKey: true });
  expect(confirm).toHaveFocus();
  fireEvent.keyDown(confirm, { key: "Tab" });
  expect(cancel).toHaveFocus();
  fireEvent.click(cancel);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Desativar Pessoa Sintética" }),
  ).toHaveFocus();
  expect(fetcher).toHaveBeenCalledTimes(1);
});
test("retains the active state and exposes retry after a rejected deactivation", async () => {
  let writes = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, options?: RequestInit) => {
      if (options?.method === "PATCH") {
        writes++;
        return json({ error: "Operação indisponível" }, 503);
      }
      return json({ funcionarios: [employee] });
    }),
  );
  const dialog = await open();
  const confirm = within(dialog).getByRole("button", { name: "Desativar" });
  fireEvent.click(confirm);
  expect(await within(dialog).findByRole("alert")).toHaveTextContent(
    "Operação indisponível",
  );
  expect(screen.queryByText("Desativado")).not.toBeInTheDocument();
  fireEvent.click(confirm);
  await waitFor(() => expect(writes).toBe(2));
});
test("blocks duplicate writes and Escape during pending deactivation, then focuses the updated action", async () => {
  let release!: (response: Response) => void;
  let active = true;
  const fetcher = vi.fn(async (_url: string, options?: RequestInit) => {
    if (options?.method === "PATCH") {
      expect(JSON.parse(options.body as string)).toEqual({ ativo: false });
      return new Promise<Response>((resolve) => {
        release = resolve;
      });
    }
    return json({ funcionarios: [{ ...employee, ativo: active }] });
  });
  vi.stubGlobal("fetch", fetcher);
  const dialog = await open();
  const confirm = within(dialog).getByRole("button", { name: "Desativar" });
  fireEvent.click(confirm);
  fireEvent.click(confirm);
  expect(
    within(dialog).getByRole("button", { name: "Cancelar" }),
  ).toBeDisabled();
  fireEvent(dialog, new Event("cancel", { cancelable: true }));
  expect(dialog).toBeInTheDocument();
  expect(
    fetcher.mock.calls.filter(([, options]) => options?.method === "PATCH"),
  ).toHaveLength(1);
  active = false;
  release(json({ funcionario: { ...employee, ativo: false } }));
  const reactivate = await screen.findByRole("button", {
    name: "Reativar Pessoa Sintética",
  });
  await waitFor(() => expect(reactivate).toHaveFocus());
  expect(screen.getByText("Desativado")).toBeVisible();
});
test("reactivates directly, retains inactive state on failure and retries without a dialog", async () => {
  let active = false;
  let failed = true;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, options?: RequestInit) => {
      if (options?.method === "PATCH") {
        expect(JSON.parse(options.body as string)).toEqual({ ativo: true });
        if (failed) return json({ error: "Falha temporária" }, 503);
        active = true;
        return json({ funcionario: { ...employee, ativo: active } });
      }
      return json({ funcionarios: [{ ...employee, ativo: active }] });
    }),
  );
  render(<Employees />);
  const reactivate = await screen.findByRole("button", {
    name: "Reativar Pessoa Sintética",
  });
  fireEvent.click(reactivate);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Falha temporária",
  );
  expect(screen.getByText("Desativado")).toBeVisible();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  failed = false;
  fireEvent.click(reactivate);
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Desativar Pessoa Sintética" }),
    ).toHaveFocus(),
  );
  expect(screen.queryByText("Desativado")).not.toBeInTheDocument();
});
test("distinguishes a saved change from refresh failure and retries only the read", async () => {
  let saved = false;
  let failed = true;
  const fetcher = vi.fn(async (_url: string, options?: RequestInit) => {
    if (options?.method === "PATCH") {
      saved = true;
      return json({ funcionario: { ...employee, ativo: false } });
    }
    if (saved && failed) return json({ error: "List unavailable" }, 503);
    return json({ funcionarios: [{ ...employee, ativo: !saved }] });
  });
  vi.stubGlobal("fetch", fetcher);
  const dialog = await open();
  fireEvent.click(within(dialog).getByRole("button", { name: "Desativar" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "A alteração foi salva",
  );
  const reload = screen.getByRole("button", { name: "Recarregar dados" });
  expect(reload).toHaveFocus();
  expect(
    screen.getByRole("button", { name: "Desativar Pessoa Sintética" }),
  ).toBeDisabled();
  failed = false;
  fireEvent.click(reload);
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Reativar Pessoa Sintética" }),
    ).toHaveFocus(),
  );
  expect(
    fetcher.mock.calls.filter(([, options]) => options?.method === "PATCH"),
  ).toHaveLength(1);
});
