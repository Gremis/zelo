import { afterEach, expect, test, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { EmployeeTaskPage } from "@/components/employee-task-page";

const code = "d".repeat(64);
const task = {
  condominiumName: "Condomínio Sintético",
  number: 105,
  description: "Lâmpada do hall apagada",
  location: "Hall",
  reporterName: "Pessoa Sintética",
  reporterUnitOrRole: "101",
  registeredAt: "2026-11-25T10:00:00Z",
  startedAt: null,
  completedAt: null,
  status: "pending",
};

afterEach(() => vi.unstubAllGlobals());

test("loads only the public task endpoint without credentials and renders the allowed fields", async () => {
  const fetchMock = vi.fn().mockResolvedValue(
    Response.json({
      ...task,
      reporterPhone: "private-phone",
      events: ["private-note"],
      trackingCode: "private-tracking",
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  render(<EmployeeTaskPage code={code} />);
  expect(screen.getByRole("status")).toHaveTextContent("Carregando tarefa");
  expect(
    await screen.findByRole("heading", { name: "Tarefa #105" }),
  ).toBeVisible();
  expect(screen.getByText("Condomínio Sintético")).toBeVisible();
  expect(screen.getByText("Pessoa Sintética · 101")).toBeVisible();
  expect(screen.queryByText(/private-/)).not.toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledWith(
    `/api/public/tasks/${code}`,
    expect.objectContaining({
      cache: "no-store",
      credentials: "omit",
      referrerPolicy: "no-referrer",
    }),
  );
});

test("malformed and unknown codes use the same generic invalid state", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValue(new Response(null, { status: 404 }));
  vi.stubGlobal("fetch", fetchMock);
  const view = render(<EmployeeTaskPage code="invalid" />);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Não encontramos esta tarefa. Confira o link que você recebeu.",
  );
  expect(fetchMock).not.toHaveBeenCalled();
  view.rerender(<EmployeeTaskPage code={code} />);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Não encontramos esta tarefa. Confira o link que você recebeu.",
  );
});

test("temporary failure allows retry and completed tasks have no actions", async () => {
  const fetchMock = vi
    .fn()
    .mockRejectedValueOnce(new Error("Synthetic provider diagnostic"))
    .mockResolvedValueOnce(
      Response.json({
        ...task,
        status: "completed",
        completedAt: "2026-11-25T12:00:00Z",
      }),
    );
  vi.stubGlobal("fetch", fetchMock);
  render(<EmployeeTaskPage code={code} />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Tentar novamente" }),
  );
  expect(
    await screen.findByRole("heading", { name: "Tarefa concluída" }),
  ).toBeVisible();
  expect(screen.getByText(/Concluída em.*Obrigado!/)).toBeVisible();
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
  expect(screen.queryByText(/Synthetic provider/)).not.toBeInTheDocument();
});

test("readable old task explicitly disallows all mutations", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(Response.json({ ...task, canAct: false })),
  );
  render(<EmployeeTaskPage code={code} />);
  expect(
    await screen.findByText(/Este link continua disponível para consulta/),
  ).toBeVisible();
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});
