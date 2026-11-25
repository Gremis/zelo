import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { Employees } from "@/components/employees";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));
afterEach(() => vi.unstubAllGlobals());
const role = { id: "11111111-1111-4111-8111-111111111111", nome: "Porteiro" };
const condominium = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Prédio sintético",
  address: "Endereço sintético",
};
function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status });
}
function setup(
  create?: (body: Record<string, string>) => Promise<Response>,
  initialRoles = [role],
) {
  const roles = [...initialRoles];
  const items: unknown[] = [];
  const fetcher = vi.fn(async (url: string, options?: RequestInit) => {
    if (options?.method === "POST") {
      const body = JSON.parse(options.body as string);
      if (create) return create(body);
      const official = body.funcaoId
        ? role
        : { id: "33333333-3333-4333-8333-333333333333", nome: "Jardineira" };
      if (!roles.some((item) => item.id === official.id)) roles.push(official);
      const employee = {
        id: "employee",
        nome: body.nome,
        celular: body.celular,
        funcao: official.nome,
        condominio: condominium.name,
        horarioTrabalho: null,
        ativo: true,
      };
      items.push(employee);
      return json({ funcionario: employee }, 201);
    }
    if (url === "/api/funcionarios") return json({ funcionarios: items });
    if (url === "/api/funcoes") return json({ funcoes: roles });
    if (url === "/api/condominiums")
      return json({ condominiums: [condominium] });
    throw new Error("Unexpected request");
  });
  vi.stubGlobal("fetch", fetcher);
  render(<Employees />);
  return fetcher;
}
async function open() {
  fireEvent.click(screen.getByRole("button", { name: "Novo funcionário" }));
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Salvar funcionário" }),
    ).toBeEnabled(),
  );
}
function fillEmployee() {
  fireEvent.change(screen.getByLabelText("Nome e sobrenome"), {
    target: { value: "Funcionário Sintético" },
  });
  fireEvent.change(screen.getByLabelText("Celular"), {
    target: { value: "11900000001" },
  });
  fireEvent.change(screen.getByLabelText("Condomínio"), {
    target: { value: condominium.id },
  });
}
function chooseNew() {
  fireEvent.change(screen.getByLabelText("Função"), {
    target: {
      value: screen.getByRole<HTMLOptionElement>("option", {
        name: "+ Criar nova função",
      }).value,
    },
  });
}
function posts(fetcher: ReturnType<typeof setup>) {
  return fetcher.mock.calls.filter(([, options]) => options?.method === "POST");
}

test("requires a new name only in creation mode, with accessible error and form-order focus", async () => {
  const fetcher = setup();
  await open();
  expect(
    screen.queryByLabelText("Nome da nova função"),
  ).not.toBeInTheDocument();
  const select = screen.getByLabelText("Função");
  expect(select.tagName).toBe("SELECT");
  expect(select.lastElementChild).toHaveTextContent("+ Criar nova função");
  chooseNew();
  const name = screen.getByLabelText("Nome da nova função");
  expect(name).toBeRequired();
  expect(name).toHaveAttribute("placeholder", "Ex.: Jardineiro");
  fireEvent.click(screen.getByRole("button", { name: "Salvar funcionário" }));
  await waitFor(() =>
    expect(screen.getByLabelText("Nome e sobrenome")).toHaveFocus(),
  );
  fillEmployee();
  fireEvent.change(screen.getByLabelText("Condomínio"), {
    target: { value: "" },
  });
  fireEvent.change(name, { target: { value: "   " } });
  fireEvent.click(screen.getByRole("button", { name: "Salvar funcionário" }));
  await waitFor(() => expect(name).toHaveFocus());
  expect(name).toHaveAttribute("aria-invalid", "true");
  expect(name).toHaveAccessibleDescription("Informe a função.");
  expect(posts(fetcher)).toHaveLength(0);
  fireEvent.change(select, { target: { value: role.id } });
  expect(
    screen.queryByLabelText("Nome da nova função"),
  ).not.toBeInTheDocument();
  expect(screen.queryByText("Informe a função.")).not.toBeInTheDocument();
});

test("sends existing roles only by ID after discarding an unsubmitted new name", async () => {
  const fetcher = setup();
  await open();
  fillEmployee();
  chooseNew();
  fireEvent.change(screen.getByLabelText("Nome da nova função"), {
    target: { value: "Não persistir" },
  });
  fireEvent.blur(screen.getByLabelText("Nome da nova função"));
  expect(posts(fetcher)).toHaveLength(0);
  fireEvent.change(screen.getByLabelText("Função"), {
    target: { value: role.id },
  });
  fireEvent.click(screen.getByRole("button", { name: "Salvar funcionário" }));
  await screen.findByText("Funcionário cadastrado.");
  const payload = JSON.parse(posts(fetcher)[0][1]!.body as string);
  expect(payload.funcaoId).toBe(role.id);
  expect(payload).not.toHaveProperty("funcaoNome");
});

test("creates in the employee request and reloads official role options on the next form", async () => {
  const fetcher = setup();
  await open();
  fillEmployee();
  chooseNew();
  fireEvent.change(screen.getByLabelText("Nome da nova função"), {
    target: { value: "Jardineira" },
  });
  expect(posts(fetcher)).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: "Salvar funcionário" }));
  await screen.findByText("Funcionário cadastrado.");
  const payload = JSON.parse(posts(fetcher)[0][1]!.body as string);
  expect(payload.funcaoNome).toBe("Jardineira");
  expect(payload).not.toHaveProperty("funcaoId");
  await screen.findByText("Jardineira");
  await open();
  expect(screen.getByRole("option", { name: "Jardineira" })).toHaveValue(
    "33333333-3333-4333-8333-333333333333",
  );
  expect(screen.getAllByRole("option", { name: "Jardineira" })).toHaveLength(1);
});

test("cancel discards a new role without any write, including in an empty role portfolio", async () => {
  const fetcher = setup(undefined, []);
  await open();
  chooseNew();
  fireEvent.change(screen.getByLabelText("Nome da nova função"), {
    target: { value: "Descartada" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
  await open();
  chooseNew();
  expect(screen.getByLabelText("Nome da nova função")).toHaveValue("");
  expect(posts(fetcher)).toHaveLength(0);
  expect(
    screen.queryByRole("option", { name: "Descartada" }),
  ).not.toBeInTheDocument();
});

test("retains new role data after a failed save and blocks repeated submission while pending", async () => {
  let finish!: (value: Response) => void;
  const fetcher = setup(
    () =>
      new Promise<Response>((resolve) => {
        finish = resolve;
      }),
  );
  await open();
  fillEmployee();
  chooseNew();
  fireEvent.change(screen.getByLabelText("Nome da nova função"), {
    target: { value: "Jardineira" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Salvar funcionário" }));
  fireEvent.submit(screen.getByLabelText("Nome e sobrenome").closest("form")!);
  expect(posts(fetcher)).toHaveLength(1);
  expect(screen.getByRole("button", { name: "Salvando…" })).toBeDisabled();
  finish(json({ error: "Falha temporária" }, 503));
  await screen.findByText("Falha temporária");
  expect(screen.getByLabelText("Nome da nova função")).toHaveValue(
    "Jardineira",
  );
  expect(screen.getByLabelText("Nome e sobrenome")).toHaveValue(
    "Funcionário Sintético",
  );
  expect(
    screen.getByRole("button", { name: "Salvar funcionário" }),
  ).toBeEnabled();
});

test("maps backend role-name errors to the new field without discarding its value", async () => {
  setup(async () =>
    json(
      { details: { funcaoNome: "A função deve ter até 50 caracteres." } },
      400,
    ),
  );
  await open();
  fillEmployee();
  chooseNew();
  fireEvent.change(screen.getByLabelText("Nome da nova função"), {
    target: { value: "Jardineira" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Salvar funcionário" }));
  await waitFor(() =>
    expect(screen.getByLabelText("Nome da nova função")).toHaveFocus(),
  );
  expect(
    screen.getByLabelText("Nome da nova função"),
  ).toHaveAccessibleDescription("A função deve ter até 50 caracteres.");
  expect(screen.getByLabelText("Nome da nova função")).toHaveValue(
    "Jardineira",
  );
});
