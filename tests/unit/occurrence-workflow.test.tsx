import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, afterEach, test, expect, vi } from "vitest";
import { OccurrenceWorkflow } from "@/components/occurrence-workflow";
import { occurrenceDetailFixture } from "../fixtures/occurrence-detail";
import type { OccurrenceDetail } from "@/server/occurrences/detail.contract";
import {
  whatsappUrl,
  type WorkflowCommand,
} from "@/lib/occurrences/workflow-request";
const fetchMock = vi.fn();
const employee = {
  id: "72000000-0000-4000-8000-000000000001",
  nome: "Funcionário Sintético",
  celular: "11900000001",
  funcao: { nome: "Zelador" },
};
let current: OccurrenceDetail;
let commands: WorkflowCommand[];
function Fixture() {
  const [detail, setDetail] = useState(current);
  return (
    <OccurrenceWorkflow
      detail={detail}
      onChanged={setDetail}
      onBusy={() => {}}
    />
  );
}
function handler(input: RequestInfo | URL, init?: RequestInit) {
  const url = String(input);
  if (url.endsWith("eligible-employees"))
    return Response.json({ employees: [employee] });
  if (url.endsWith("commands")) {
    const cmd = JSON.parse(String(init?.body)) as WorkflowCommand;
    commands.push(cmd);
    if (cmd.type === "responsible")
      current = {
        ...current,
        status: "in_progress",
        responsibleKind: cmd.payload.kind as "manager" | "provider",
        responsibleName: cmd.payload.name ?? "Síndico Sintético",
        version: (current.version ?? 0) + 1,
      };
    if (cmd.type === "complete")
      current = {
        ...current,
        status: "completed",
        completedAt: new Date().toISOString(),
        canDecidePriority: false,
        version: (current.version ?? 0) + 1,
      };
    return Response.json(current);
  }
  return Response.json(current);
}
beforeEach(() => {
  current = occurrenceDetailFixture();
  commands = [];
  sessionStorage.clear();
  fetchMock.mockReset();
  fetchMock.mockImplementation(handler);
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());
test("assumes as Eu and saves provider only on changed blur", async () => {
  render(<Fixture />);
  await screen.findByRole("option", { name: /Funcionário Sintético/ });
  expect(
    screen.queryByRole("button", { name: "Concluir ocorrência" }),
  ).toBeNull();
  fireEvent.change(screen.getByLabelText("Responsável"), {
    target: { value: "manager" },
  });
  await screen.findByText("Responsável salvo: Síndico Sintético");
  await waitFor(() =>
    expect(screen.getByLabelText("Responsável")).toBeEnabled(),
  );
  fireEvent.change(screen.getByLabelText("Responsável"), {
    target: { value: "provider" },
  });
  const input = screen.getByLabelText("Nome do prestador ou administradora");
  fireEvent.change(input, { target: { value: "Fornecedor Sintético" } });
  expect(commands).toHaveLength(1);
  fireEvent.blur(input);
  await screen.findByText("Responsável salvo: Fornecedor Sintético");
  await waitFor(() => expect(input).toBeEnabled());
  fireEvent.blur(input);
  expect(commands).toHaveLength(2);
});
test("selection cancellation has no side effects", async () => {
  render(<Fixture />);
  await screen.findByRole("option", { name: /Funcionário Sintético/ });
  fireEvent.change(screen.getByLabelText("Responsável"), {
    target: { value: employee.id },
  });
  expect(
    (screen.getByLabelText("Mensagem de delegação") as HTMLTextAreaElement)
      .value,
  ).toContain("#7704");
  fireEvent.click(screen.getByRole("button", { name: "Cancelar seleção" }));
  expect(commands).toHaveLength(0);
  expect(screen.getByLabelText("Responsável")).toHaveValue("");
});
test("backend failure closes reserved popup without navigating WhatsApp", async () => {
  const popup = {
    opener: {},
    closed: false,
    close: vi.fn(),
    location: { href: "about:blank" },
  };
  vi.spyOn(window, "open").mockReturnValue(popup as unknown as Window);
  fetchMock.mockImplementation((url, init) =>
    String(url).endsWith("commands")
      ? Response.json({}, { status: 503 })
      : handler(url, init),
  );
  render(<Fixture />);
  await screen.findByRole("option", { name: /Funcionário Sintético/ });
  fireEvent.change(screen.getByLabelText("Responsável"), {
    target: { value: employee.id },
  });
  fireEvent.click(screen.getByRole("button", { name: "Enviar pelo WhatsApp" }));
  await screen.findByRole("button", { name: "Recuperar operação" });
  expect(popup.close).toHaveBeenCalled();
  expect(popup.location.href).toBe("about:blank");
  expect(screen.queryByRole("link", { name: "Abrir WhatsApp" })).toBeNull();
});
test("blocked popup exposes explicit URL only after delegation commits", async () => {
  vi.spyOn(window, "open").mockReturnValue(null);
  render(<Fixture />);
  await screen.findByRole("option", { name: /Funcionário Sintético/ });
  fireEvent.change(screen.getByLabelText("Responsável"), {
    target: { value: employee.id },
  });
  fireEvent.change(screen.getByLabelText("Mensagem de delegação"), {
    target: { value: "Texto editado & seguro" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Enviar pelo WhatsApp" }));
  const link = await screen.findByRole("link", { name: "Abrir WhatsApp" });
  expect(link).toHaveAttribute(
    "href",
    whatsappUrl(employee.celular, "Texto editado & seguro"),
  );
  expect(commands[0].payload.message).toBe("Texto editado & seguro");
  expect(screen.getByRole("status")).toHaveTextContent(
    "O envio da mensagem não é confirmado",
  );
});
test("lost response retries the same key and freezes edits", async () => {
  let lost = true;
  fetchMock.mockImplementation((url, init) => {
    if (String(url).endsWith("commands") && lost) {
      lost = false;
      commands.push(JSON.parse(String(init?.body)));
      return Promise.reject(new Error("lost"));
    }
    return handler(url, init);
  });
  render(<Fixture />);
  fireEvent.change(screen.getByLabelText("Responsável"), {
    target: { value: "manager" },
  });
  await screen.findByRole("button", { name: "Recuperar operação" });
  expect(screen.getByLabelText("Responsável")).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Recuperar operação" }));
  await screen.findByText("Responsável salvo: Síndico Sintético");
  expect(commands[0]).toEqual(commands[1]);
});
test("version conflict requires refreshed data before another edit", async () => {
  fetchMock.mockImplementation((url, init) =>
    String(url).endsWith("commands")
      ? Response.json({}, { status: 409 })
      : handler(url, init),
  );
  render(<Fixture />);
  fireEvent.change(screen.getByLabelText("Responsável"), {
    target: { value: "manager" },
  });
  await screen.findByRole("button", { name: "Atualizar dados" });
  expect(screen.getByLabelText("Responsável")).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Atualizar dados" }));
  await waitFor(() =>
    expect(screen.getByLabelText("Responsável")).toBeEnabled(),
  );
});
test("completion without evidence does not prepare uploads", async () => {
  current = occurrenceDetailFixture({
    status: "in_progress",
    responsibleKind: "manager",
    responsibleName: "Síndico",
  });
  render(<Fixture />);
  fireEvent.click(screen.getByRole("button", { name: "Concluir ocorrência" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirmar conclusão" }));
  await waitFor(() =>
    expect(
      screen.queryByRole("button", { name: "Concluir ocorrência" }),
    ).toBeNull(),
  );
  expect(commands[0].payload).toEqual({ comment: "" });
  expect(
    fetchMock.mock.calls.some(([url]) => String(url).includes("/uploads")),
  ).toBe(false);
});
test("completed occurrence has no business controls", () => {
  current = occurrenceDetailFixture({
    status: "completed",
    completedAt: new Date().toISOString(),
    canDecidePriority: false,
  });
  render(<Fixture />);
  expect(screen.queryByRole("combobox")).toBeNull();
  expect(
    screen.queryByRole("button", { name: "Concluir ocorrência" }),
  ).toBeNull();
});

test("storage restrictions do not turn a committed command into a false failure", async () => {
  const write = vi
    .spyOn(Storage.prototype, "setItem")
    .mockImplementation(() => {
      throw new Error("unavailable");
    });
  const remove = vi
    .spyOn(Storage.prototype, "removeItem")
    .mockImplementation(() => {
      throw new Error("unavailable");
    });
  try {
    render(<Fixture />);
    fireEvent.change(screen.getByLabelText("Responsável"), {
      target: { value: "manager" },
    });
    await screen.findByText("Responsável salvo: Síndico Sintético");
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Alteração salva"),
    );
    expect(
      screen.queryByRole("button", { name: "Recuperar operação" }),
    ).toBeNull();
  } finally {
    write.mockRestore();
    remove.mockRestore();
  }
});

test("an interrupted inspection resumes existing evidence without authorizing a new upload", async () => {
  current = occurrenceDetailFixture({
    status: "in_progress",
    responsibleKind: "manager",
    responsibleName: "Síndico",
  });
  const attempt = {
    key: "72000000-0000-4000-8000-000000000002",
    secret: "a".repeat(64),
  };
  sessionStorage.setItem(
    `occurrence-upload:${current.id}`,
    JSON.stringify(attempt),
  );
  let validated = false;
  fetchMock.mockImplementation((input, init) => {
    const url = String(input);
    if (url.endsWith("/validate")) {
      validated = true;
      return Response.json({ state: "valid" });
    }
    if (url.includes("/uploads/"))
      return Response.json({
        id: attempt.key,
        state: "open",
        expiresAt: "2027-01-01T00:00:00Z",
        number: null,
        files: [
          {
            id: employee.id,
            name: "synthetic.png",
            contentType: "image/png",
            size: 100,
            state: validated ? "valid" : "inspecting",
            failure: null,
          },
        ],
      });
    return handler(input, init);
  });
  render(<Fixture />);
  await screen.findByText(/Envio recuperado/);
  fireEvent.click(screen.getByRole("button", { name: "Concluir ocorrência" }));
  fireEvent.click(
    screen.getByRole("button", { name: "Enviar e verificar anexos" }),
  );
  await screen.findByText(
    "Arquivos verificados. A ocorrência ainda não foi concluída.",
  );
  expect(
    fetchMock.mock.calls.some(([url]) => String(url).endsWith("/authorize")),
  ).toBe(false);
  expect(
    screen.getByRole("button", { name: "Confirmar conclusão" }),
  ).toBeEnabled();
});

test("changing a prepared manifest cannot silently complete with the old evidence", async () => {
  current = occurrenceDetailFixture({
    status: "in_progress",
    responsibleKind: "manager",
    responsibleName: "Síndico",
  });
  const attempt = {
    key: "72000000-0000-4000-8000-000000000003",
    secret: "a".repeat(64),
  };
  sessionStorage.setItem(
    `occurrence-upload:${current.id}`,
    JSON.stringify(attempt),
  );
  fetchMock.mockImplementation((input, init) =>
    String(input).includes("/uploads/")
      ? Response.json({
          id: attempt.key,
          state: "open",
          expiresAt: "2027-01-01T00:00:00Z",
          number: null,
          files: [
            {
              id: employee.id,
              name: "original.png",
              contentType: "image/png",
              size: 100,
              state: "valid",
              failure: null,
            },
          ],
        })
      : handler(input, init),
  );
  render(<Fixture />);
  await screen.findByText(/Envio recuperado/);
  fireEvent.click(screen.getByRole("button", { name: "Concluir ocorrência" }));
  fireEvent.click(screen.getByRole("button", { name: "Consultar envio" }));
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Confirmar conclusão" }),
    ).toBeEnabled(),
  );
  fireEvent.change(screen.getByLabelText("Anexos (opcional)"), {
    target: {
      files: [new File(["changed"], "replacement.png", { type: "image/png" })],
    },
  });
  expect(
    screen.getByRole("button", { name: "Confirmar conclusão" }),
  ).toBeDisabled();
  fireEvent.click(
    screen.getByRole("button", { name: "Enviar e verificar anexos" }),
  );
  await screen.findByRole("alert");
  expect(commands).toHaveLength(0);
});

test("invalid local files block completion until explicitly removed", async () => {
  current = occurrenceDetailFixture({
    status: "in_progress",
    responsibleKind: "manager",
    responsibleName: "Síndico",
  });
  render(<Fixture />);
  fireEvent.click(screen.getByRole("button", { name: "Concluir ocorrência" }));
  fireEvent.change(screen.getByLabelText("Anexos (opcional)"), {
    target: {
      files: [
        new File(["invalid"], "unsupported.svg", { type: "image/svg+xml" }),
      ],
    },
  });
  expect(
    screen.getByRole("button", { name: "Confirmar conclusão" }),
  ).toBeDisabled();
  fireEvent.click(
    screen.getByRole("button", { name: "Remover seleção de arquivos" }),
  );
  expect(
    screen.getByRole("button", { name: "Confirmar conclusão" }),
  ).toBeEnabled();
  expect(commands).toHaveLength(0);
});
