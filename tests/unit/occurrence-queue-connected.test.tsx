import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ConnectedOccurrenceQueue } from "@/components/occurrence-queue-connected";
import { loadOccurrenceQueue } from "@/lib/occurrences/queue-request";
import { occurrenceDetailFixture } from "../fixtures/occurrence-detail";
import { queueEmptyFixture, queueFixture } from "../fixtures/occurrence-queue";

const router = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
const request = vi.fn();
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("fetch", request);
});
afterEach(() => vi.unstubAllGlobals());

test("requests only the authenticated same-origin endpoint with no-store and no manager parameter", async () => {
  const data = queueFixture("all");
  request.mockResolvedValue(Response.json(data));
  expect(await loadOccurrenceQueue()).toEqual(data);
  expect(request).toHaveBeenCalledTimes(1);
  const [url, options] = request.mock.calls[0];
  expect(url).toBe("/api/occurrences/queue");
  expect(options).toMatchObject({
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
  });
  expect(options.signal).toBeInstanceOf(AbortSignal);
});

test.each([401, 403, 500])(
  "HTTP %s is sanitized and never replaced with fixture data",
  async (status) => {
    request.mockResolvedValue(
      Response.json({ error: "Sensitive provider text" }, { status }),
    );
    await expect(loadOccurrenceQueue()).rejects.toMatchObject({
      status: status === 500 ? 503 : status,
      message: "Occurrence queue could not be loaded.",
    });
  },
);

test.each([null, { columns: {} }])(
  "malformed success payload fails closed %#",
  async (data) => {
    request.mockResolvedValue(Response.json(data));
    await expect(loadOccurrenceQueue()).rejects.toMatchObject({ status: 503 });
  },
);

test("network failures are sanitized", async () => {
  request.mockRejectedValue(new Error("Sensitive transport text"));
  await expect(loadOccurrenceQueue()).rejects.toMatchObject({
    status: 503,
    message: "Occurrence queue could not be loaded.",
  });
});

test("loading transitions to the supplied API cards without changing their order or counts", async () => {
  const data = queueFixture("all");
  let resolve!: (response: Response) => void;
  request.mockReturnValue(
    new Promise<Response>((complete) => {
      resolve = complete;
    }),
  );
  render(<ConnectedOccurrenceQueue />);
  expect(screen.getByRole("status")).toHaveTextContent(
    "Carregando ocorrências",
  );
  expect(screen.queryByRole("article")).not.toBeInTheDocument();
  await act(async () => {
    resolve(Response.json(data));
  });
  expect(screen.getAllByRole("article")).toHaveLength(7);
  expect(screen.getByLabelText("4 em Novo")).toBeInTheDocument();
  expect(
    screen.getByLabelText("Ocorrências abertas por prioridade"),
  ).toHaveTextContent("Urgente1Normal2Baixa2Sem classificação1");
});

test("retry performs a new real request and never falls back after an API failure", async () => {
  request
    .mockResolvedValueOnce(
      Response.json({ error: "Sensitive provider text" }, { status: 503 }),
    )
    .mockResolvedValueOnce(Response.json(queueEmptyFixture));
  render(<ConnectedOccurrenceQueue />);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Não foi possível carregar a fila.",
  );
  expect(screen.queryByRole("article")).not.toBeInTheDocument();
  expect(document.body.textContent).not.toContain("Sensitive");
  fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
  expect(
    await screen.findByRole("heading", {
      name: "Nenhuma ocorrência por enquanto",
    }),
  ).toBeInTheDocument();
  expect(screen.getByLabelText("0 em Novo")).toBeInTheDocument();
  expect(request).toHaveBeenCalledTimes(2);
});

test("an expired session clears the queue and redirects to login", async () => {
  request.mockResolvedValue(Response.json({}, { status: 401 }));
  render(<ConnectedOccurrenceQueue />);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Sua sessão expirou. Entre novamente.",
  );
  expect(router.replace).toHaveBeenCalledExactlyOnceWith("/login");
  expect(screen.queryByRole("article")).not.toBeInTheDocument();
});

test("a forbidden portfolio shows access denial without data or invented cards", async () => {
  request.mockResolvedValue(Response.json({}, { status: 403 }));
  render(<ConnectedOccurrenceQueue />);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Acesso não autorizado para consultar a fila.",
  );
  expect(router.replace).not.toHaveBeenCalled();
  expect(screen.queryByRole("article")).not.toBeInTheDocument();
});

test("unmount aborts the request and ignores a late response", async () => {
  let resolve!: (response: Response) => void;
  request.mockReturnValue(
    new Promise<Response>((complete) => {
      resolve = complete;
    }),
  );
  const view = render(<ConnectedOccurrenceQueue />);
  await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
  const signal = request.mock.calls[0][1].signal as AbortSignal;
  view.unmount();
  expect(signal.aborted).toBe(true);
  await act(async () => {
    resolve(Response.json(queueFixture()));
  });
  expect(screen.queryByRole("article")).not.toBeInTheDocument();
});

test("prepares through an authenticated POST before reading the queue and safely retries failures", async () => {
  request
    .mockResolvedValueOnce(new Response(null, { status: 503 }))
    .mockResolvedValueOnce(Response.json({ status: "ready" }))
    .mockResolvedValueOnce(Response.json(queueFixture("fixtures")));
  render(<ConnectedOccurrenceQueue prepareDemo />);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "retomar com segurança",
  );
  expect(request).toHaveBeenCalledTimes(1);
  expect(request.mock.calls[0]).toMatchObject([
    "/api/demo/prepare",
    { method: "POST", credentials: "same-origin", cache: "no-store" },
  ]);
  fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
  expect(await screen.findAllByRole("article")).toHaveLength(4);
  expect(request.mock.calls[1][0]).toBe("/api/demo/prepare");
  expect(request.mock.calls[2][0]).toBe("/api/occurrences/queue");
});

test("unexpected ineligibility is visible and retry prepares and refreshes cards without a new login", async () => {
  request
    .mockResolvedValueOnce(Response.json({ status: "ineligible" }))
    .mockResolvedValueOnce(Response.json({ status: "ready" }))
    .mockResolvedValueOnce(Response.json(queueFixture("fixtures")));
  render(<ConnectedOccurrenceQueue prepareDemo />);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "retomar com segurança",
  );
  expect(screen.queryByRole("article")).not.toBeInTheDocument();
  expect(request).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
  expect(await screen.findAllByRole("article")).toHaveLength(4);
  expect(router.replace).not.toHaveBeenCalled();
});

test("opening a card loads its detail and a priority change refreshes the queue without a loading flash", async () => {
  const queue = queueFixture("fixtures");
  const detail = occurrenceDetailFixture();
  let queueCalls = 0;
  let resolveRefresh!: (response: Response) => void;
  request.mockImplementation((url: string, init?: RequestInit) => {
    if (url === "/api/occurrences/queue") {
      queueCalls += 1;
      if (queueCalls === 1) return Promise.resolve(Response.json(queue));
      return new Promise<Response>((complete) => {
        resolveRefresh = complete;
      });
    }
    if (url === `/api/occurrences/${detail.id}`)
      return Promise.resolve(Response.json(detail));
    if (url === `/api/occurrences/${detail.id}/priority`) {
      const body = JSON.parse(String(init?.body)) as { priority: string };
      return Promise.resolve(
        Response.json({
          finalPriority: body.priority,
          suggestionPending: false,
          priorityChangeReason: null,
        }),
      );
    }
    return Promise.reject(new Error("Unexpected request"));
  });
  render(<ConnectedOccurrenceQueue />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Abrir ocorrência #7704" }),
  );
  const dialog = await screen.findByRole("dialog");
  expect(
    within(dialog).getByRole("heading", {
      name: /cheiro de gás no hall do quinto andar/,
    }),
  ).toBeInTheDocument();
  fireEvent.change(within(dialog).getByLabelText("Prioridade"), {
    target: { value: "normal" },
  });
  await waitFor(() => expect(queueCalls).toBe(2));
  expect(screen.queryByText("Carregando ocorrências…")).not.toBeInTheDocument();
  expect(screen.getAllByRole("article")).toHaveLength(4);
  await act(async () => {
    resolveRefresh(Response.json(queue));
  });
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  expect(screen.getAllByRole("article")).toHaveLength(4);
});
