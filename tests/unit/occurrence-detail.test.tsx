import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { OccurrenceDetailPanel } from "@/components/occurrence-detail";
import { occurrenceDetailFixture } from "../fixtures/occurrence-detail";

const router = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const request = vi.fn();
let calls: { url: string; init: RequestInit }[] = [];

function respond(
  handler: (url: string, init: RequestInit) => Response | Promise<Response>,
) {
  request.mockImplementation(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const options = init ?? {};
      calls.push({ url, init: options });
      return handler(url, options);
    },
  );
}

function mount(
  detail = occurrenceDetailFixture(),
  onClose = vi.fn(),
  onChanged = vi.fn(),
) {
  render(
    <OccurrenceDetailPanel
      occurrenceId={detail.id}
      onClose={onClose}
      onChanged={onChanged}
    />,
  );
  return { detail, onClose, onChanged };
}

beforeEach(() => {
  vi.resetAllMocks();
  calls = [];
  vi.stubGlobal("fetch", request);
});

afterEach(() => vi.unstubAllGlobals());

test("renders the header, priority suggestion, reporter and activity", async () => {
  const detail = occurrenceDetailFixture();
  respond(() => Response.json(detail));
  mount(detail);
  expect(
    await screen.findByRole("heading", { name: detail.description }),
  ).toBeInTheDocument();
  expect(screen.getByText("#7704")).toBeInTheDocument();
  expect(screen.getByText("Edifício Sintético A")).toBeInTheDocument();
  expect(screen.getByText("Novo")).toBeInTheDocument();
  expect(screen.getByText("Unidade Apto sintético 501")).toBeInTheDocument();
  expect(
    screen.getByText("Onde Hall sintético do quinto andar"),
  ).toBeInTheDocument();
  expect(screen.getByLabelText("Prioridade")).toHaveValue("urgent");
  expect(screen.getByText("Sugerida pelo Sindicondo")).toBeInTheDocument();
  const caseData = screen.getByLabelText("Dados do caso");
  expect(
    within(caseData).getByText(/Menciona gás: risco à segurança\./),
  ).toBeInTheDocument();
  expect(
    within(caseData).getByText(/Categoria:/).parentElement,
  ).toHaveTextContent("Gás");
  expect(within(caseData).getByText("Registrada por")).toBeInTheDocument();
  expect(within(caseData).getByText("Pessoa Sintética Um")).toBeInTheDocument();
  expect(within(caseData).getByText("(31) 99812-4410")).toBeInTheDocument();
  expect(
    within(caseData).getByRole("button", {
      name: "Copiar link de acompanhamento",
    }),
  ).toBeInTheDocument();
  expect(screen.getByText("Pessoa Síndica Sintética")).toBeInTheDocument();
  expect(screen.getByText(/síndico, você/)).toBeInTheDocument();
  expect(screen.getByText(/\(quem registrou\)/)).toBeInTheDocument();
  expect(
    screen.getByText("Zelador olhou o portão. Motor queimado, pedi orçamento."),
  ).toBeInTheDocument();
  expect(
    screen.getByText("Só você vê. O morador não vê as atualizações."),
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Adicionar" })).toBeInTheDocument();
});

test("closes through the accessible close button and Escape", async () => {
  const detail = occurrenceDetailFixture();
  respond(() => Response.json(detail));
  const { onClose } = mount(detail);
  await screen.findByRole("heading", { name: detail.description });
  expect(screen.getByRole("button", { name: "Fechar" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
  expect(onClose).toHaveBeenCalledTimes(1);
  fireEvent.keyDown(document, { key: "Escape" });
  expect(onClose).toHaveBeenCalledTimes(2);
});

test("changing the priority saves immediately and reveals the reason list", async () => {
  const detail = occurrenceDetailFixture();
  respond((url, init) =>
    init.method === "PATCH"
      ? Response.json({
          finalPriority: "normal",
          suggestionPending: false,
          priorityChangeReason: null,
        })
      : Response.json(detail),
  );
  const { onChanged } = mount(detail);
  await screen.findByRole("heading", { name: detail.description });
  fireEvent.change(screen.getByLabelText("Prioridade"), {
    target: { value: "normal" },
  });
  await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
  expect(screen.getByLabelText("Prioridade")).toHaveValue("normal");
  expect(screen.getByText("Sugerida: Urgente")).toBeInTheDocument();
  expect(
    screen.getByLabelText("Por que mudou? (opcional)"),
  ).toBeInTheDocument();
  expect(screen.getAllByRole("listitem")).toHaveLength(2);
  const patch = calls.find(({ init }) => init.method === "PATCH");
  expect(patch?.url).toBe(`/api/occurrences/${detail.id}/priority`);
  expect(JSON.parse(String(patch?.init.body))).toEqual({
    priority: "normal",
    reason: null,
  });
});

test("the change reason saves as soon as it is selected", async () => {
  const detail = occurrenceDetailFixture({
    finalPriority: "normal",
    effectivePriority: "normal",
    suggestionPending: false,
    priorityDecidedAt: "2026-11-22T12:30:00Z",
  });
  respond((url, init) =>
    init.method === "PATCH"
      ? Response.json({
          finalPriority: "normal",
          suggestionPending: false,
          priorityChangeReason: "greater_risk",
        })
      : Response.json(detail),
  );
  mount(detail);
  const reason = await screen.findByLabelText("Por que mudou? (opcional)");
  fireEvent.change(reason, { target: { value: "greater_risk" } });
  await waitFor(() =>
    expect(screen.getByLabelText("Por que mudou? (opcional)")).toHaveValue(
      "greater_risk",
    ),
  );
  const patch = calls.find(({ init }) => init.method === "PATCH");
  expect(JSON.parse(String(patch?.init.body))).toEqual({
    priority: "normal",
    reason: "greater_risk",
  });
});

test("a failed priority change keeps the previous value and explains the error", async () => {
  const detail = occurrenceDetailFixture();
  respond((url, init) =>
    init.method === "PATCH"
      ? Response.json({ error: "Synthetic failure" }, { status: 503 })
      : Response.json(detail),
  );
  mount(detail);
  await screen.findByRole("heading", { name: detail.description });
  fireEvent.change(screen.getByLabelText("Prioridade"), {
    target: { value: "normal" },
  });
  expect(
    await screen.findByText("Não foi possível salvar a prioridade."),
  ).toBeInTheDocument();
  expect(screen.getByLabelText("Prioridade")).toHaveValue("urgent");
  expect(screen.queryByText("Sugerida: Urgente")).not.toBeInTheDocument();
});

test("a completed occurrence locks the priority and hides the update form", async () => {
  const detail = occurrenceDetailFixture({
    status: "completed",
    completedAt: "2026-11-22T22:00:00Z",
    finalPriority: "normal",
    effectivePriority: "normal",
    suggestionPending: false,
    priorityDecidedAt: "2026-11-22T12:30:00Z",
    canDecidePriority: false,
  });
  respond(() => Response.json(detail));
  mount(detail);
  await screen.findByRole("heading", { name: detail.description });
  expect(screen.getByLabelText("Prioridade")).toBeDisabled();
  expect(screen.getByLabelText("Por que mudou? (opcional)")).toBeDisabled();
  expect(screen.queryByRole("button", { name: "Adicionar" })).toBeNull();
  expect(
    screen.queryByText("Só você vê. O morador não vê as atualizações."),
  ).toBeNull();
});

test("an empty update is rejected without touching the history", async () => {
  const detail = occurrenceDetailFixture();
  respond(() => Response.json(detail));
  mount(detail);
  await screen.findByRole("heading", { name: detail.description });
  fireEvent.click(screen.getByRole("button", { name: "Adicionar" }));
  expect(screen.getByRole("alert")).toHaveTextContent("Escreva a atualização.");
  expect(
    screen.getByRole("textbox", { name: "Escreva uma atualização" }),
  ).toHaveAttribute("aria-invalid", "true");
  expect(screen.getAllByRole("listitem")).toHaveLength(2);
  expect(calls.some(({ init }) => init.method === "POST")).toBe(false);
});

test("adding an update clears the box and puts the new row first", async () => {
  const detail = occurrenceDetailFixture();
  const updated = occurrenceDetailFixture({
    events: [
      {
        id: 3,
        type: "manager_update",
        occurredAt: "2026-11-22T22:10:00Z",
        authorType: "manager",
        authorName: "Pessoa Síndica Sintética",
        authorPhone: "31999990000",
        authorRole: "manager",
        authorIsViewer: true,
        text: "Zelador olhou o portão. Motor queimado, pedi orçamento.",
      },
      ...detail.events,
    ],
  });
  let reads = 0;
  respond((url, init) => {
    if (init.method === "POST")
      return Response.json({ eventId: 3 }, { status: 201 });
    reads += 1;
    return Response.json(reads > 1 ? updated : detail);
  });
  mount(detail);
  await screen.findByRole("heading", { name: detail.description });
  const box = screen.getByRole("textbox", {
    name: "Escreva uma atualização",
  });
  fireEvent.change(box, {
    target: {
      value: "Zelador olhou o portão. Motor queimado, pedi orçamento.",
    },
  });
  fireEvent.click(screen.getByRole("button", { name: "Adicionar" }));
  expect(
    await screen.findByText("Atualização adicionada."),
  ).toBeInTheDocument();
  expect(box).toHaveValue("");
  const history = screen.getByRole("list", {
    name: "Histórico da ocorrência",
  });
  expect(within(history).getAllByRole("listitem")[0]).toHaveTextContent(
    "Zelador olhou o portão. Motor queimado, pedi orçamento.",
  );
  const post = calls.find(({ init }) => init.method === "POST");
  expect(post?.url).toBe(`/api/occurrences/${detail.id}/updates`);
  expect(JSON.parse(String(post?.init.body))).toEqual({
    text: "Zelador olhou o portão. Motor queimado, pedi orçamento.",
  });
});

test("another portfolio is presented as a missing occurrence", async () => {
  const detail = occurrenceDetailFixture();
  respond(() =>
    Response.json({ error: "Ocorrência não encontrada." }, { status: 404 }),
  );
  mount(detail);
  expect(
    await screen.findByText("Ocorrência não encontrada."),
  ).toBeInTheDocument();
  expect(screen.queryByText(detail.description)).toBeNull();
  expect(screen.queryByRole("button", { name: "Tentar novamente" })).toBeNull();
});

test("a temporary failure offers a retry", async () => {
  const detail = occurrenceDetailFixture();
  let attempts = 0;
  respond(() => {
    attempts += 1;
    return attempts === 1
      ? Response.json({ error: "Synthetic failure" }, { status: 503 })
      : Response.json(detail);
  });
  mount(detail);
  expect(
    await screen.findByText("Não foi possível carregar a ocorrência."),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
  expect(
    await screen.findByRole("heading", { name: detail.description }),
  ).toBeInTheDocument();
  expect(attempts).toBe(2);
});

test("an expired session redirects to login", async () => {
  const detail = occurrenceDetailFixture();
  respond(() => Response.json({ error: "Synthetic" }, { status: 401 }));
  mount(detail);
  expect(
    await screen.findByText("Sua sessão expirou. Entre novamente."),
  ).toBeInTheDocument();
  expect(router.replace).toHaveBeenCalledWith("/login");
});
