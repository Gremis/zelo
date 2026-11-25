import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import {
  OccurrenceCard,
  OccurrenceQueue,
  formatQueueDate,
} from "@/components/occurrence-queue";
import { queueFixture, queueEmptyFixture } from "../fixtures/occurrence-queue";
import { parsePortfolioQueue } from "@/server/occurrences/queue.contract";

const success = (data = queueFixture()) => ({
  status: "success" as const,
  data,
});

test.each(["fixtures", "all", "stress"] as const)(
  "visual fixture %s satisfies the actual response contract",
  (variant) => {
    expect(parsePortfolioQueue(queueFixture(variant))).toEqual(
      queueFixture(variant),
    );
  },
);

test("shows four status columns, their supplied counts and open-priority totals", () => {
  render(<OccurrenceQueue state={success(queueFixture("all"))} />);
  for (const title of ["Novo", "Em andamento", "Delegado", "Concluído"])
    expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
  expect(screen.getByLabelText("4 em Novo")).toBeInTheDocument();
  expect(screen.getByLabelText("1 em Em andamento")).toBeInTheDocument();
  expect(screen.getByLabelText("1 em Delegado")).toBeInTheDocument();
  expect(screen.getByLabelText("1 em Concluído")).toBeInTheDocument();
  const summary = screen.getByLabelText("Ocorrências abertas por prioridade");
  expect(summary).toHaveTextContent("Urgente1Normal2Baixa2Sem classificação1");
  expect(screen.getAllByRole("article")).toHaveLength(7);
});

test("preserves supplied order and counts rather than sorting or recomputing", () => {
  const data = queueFixture();
  data.columns.new.items.reverse();
  data.columns.new.count = 99;
  data.openByPriority.urgent = 42;
  render(<OccurrenceQueue state={success(data)} />);
  expect(
    screen
      .getAllByRole("article")
      .map((node) => within(node).getByText(/^#\d+$/).textContent),
  ).toEqual(["#7702", "#7703", "#7701", "#7704"]);
  expect(screen.getByLabelText("99 em Novo")).toBeInTheDocument();
  expect(
    screen.getByLabelText("Ocorrências abertas por prioridade"),
  ).toHaveTextContent("Urgente42");
});

test("uses effective priority and only the received pending flag, without inventing optional values", () => {
  const data = queueFixture("all");
  render(<OccurrenceCard item={data.columns.in_progress.items[0]} />);
  expect(screen.getByText("Baixa")).toBeInTheDocument();
  expect(screen.queryByText("sugerida")).not.toBeInTheDocument();
  expect(
    screen.queryByText(data.columns.in_progress.items[0].suggestionReason!),
  ).not.toBeInTheDocument();
  expect(screen.getByText(/Pessoa Sintética Um/)).toBeInTheDocument();
});

test("new cards show the unchanged reason and accessible relative date in Brazilian time", () => {
  const item = queueFixture().columns.new.items[0];
  render(<OccurrenceCard item={item} now={new Date("2026-11-22T16:00:00Z")} />);
  expect(screen.getByText("Urgente")).toBeInTheDocument();
  expect(screen.getByText("sugerida")).toBeInTheDocument();
  expect(screen.getByText(item.suggestionReason!)).toBeInTheDocument();
  expect(screen.getByText(/Pessoa Sintética Um/)).toBeInTheDocument();
  expect(screen.getByText("hoje 09:05").closest("time")).toHaveAttribute(
    "datetime",
    item.registeredAt,
  );
});

test("legacy card stays unclassified and omits absent unit, location, reason and reporter", () => {
  const item = {
    ...queueFixture("all").columns.delegated.items[0],
    status: "new" as const,
    reporterUnitOrRole: null,
  };
  render(<OccurrenceCard item={item} />);
  expect(screen.getByText("Sem classificação")).toBeInTheDocument();
  expect(screen.queryByText("Normal")).not.toBeInTheDocument();
  expect(screen.queryByText("sugerida")).not.toBeInTheDocument();
  expect(screen.queryByText(/não informad/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/Pessoa Sintética/)).not.toBeInTheDocument();
});

test("has no detail button or clickable article without a functional callback", () => {
  render(<OccurrenceCard item={queueFixture().columns.new.items[0]} />);
  expect(
    screen.queryByRole("button", { name: /Abrir ocorrência/ }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("article")).not.toHaveAttribute("tabindex");
  expect(screen.getByRole("article")).not.toHaveAttribute("role", "button");
});

test("exposes a real detail callback only when provided", () => {
  const onOpen = vi.fn();
  const item = queueFixture().columns.new.items[0];
  render(<OccurrenceCard item={item} onOpen={onOpen} />);
  fireEvent.click(
    screen.getByRole("button", { name: "Abrir ocorrência #7704" }),
  );
  expect(onOpen).toHaveBeenCalledExactlyOnceWith(item.id);
});

test("empty portfolio shows zeros, all columns and accurate empty messages", () => {
  render(<OccurrenceQueue state={success(queueEmptyFixture)} />);
  expect(
    screen.getByRole("heading", { name: "Nenhuma ocorrência por enquanto" }),
  ).toBeInTheDocument();
  expect(screen.getByText("Nenhuma ocorrência delegada.")).toBeInTheDocument();
  expect(screen.getByText("Nenhuma ocorrência concluída.")).toBeInTheDocument();
  expect(screen.queryByText("Sem classificação")).not.toBeInTheDocument();
  expect(screen.getByLabelText("0 em Novo")).toBeInTheDocument();
});

test("loading does not invent counts and error retries invoke only the supplied callback", () => {
  const view = render(<OccurrenceQueue state={{ status: "loading" }} />);
  expect(screen.getByRole("status")).toHaveTextContent(
    "Carregando ocorrências",
  );
  expect(
    screen.queryByLabelText("Ocorrências abertas por prioridade"),
  ).not.toBeInTheDocument();
  expect(screen.getByLabelText("Carregando em Novo")).toHaveTextContent("—");
  const onRetry = vi.fn();
  view.rerender(<OccurrenceQueue state={{ status: "error", onRetry }} />);
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Não foi possível carregar a fila.",
  );
  fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
  expect(onRetry).toHaveBeenCalledTimes(1);
});

test.each([
  ["2026-11-23T12:05:00Z", "2026-11-23T17:00:00Z", "hoje 09:05"],
  ["2026-11-22T19:40:00Z", "2026-11-23T17:00:00Z", "ontem 16:40"],
  ["2026-11-20T21:10:00Z", "2026-11-23T17:00:00Z", "20/11 18:10"],
  ["2026-11-23T01:05:00Z", "2026-11-23T02:00:00Z", "hoje 22:05"],
  ["2026-11-23T01:05:00Z", "2026-11-23T03:01:00Z", "ontem 22:05"],
  ["2026-01-01T02:30:00Z", "2026-01-01T15:00:00Z", "ontem 23:30"],
  ["2025-12-30T12:00:00Z", "2026-01-01T15:00:00Z", "30/12/2025 09:00"],
  ["2024-02-29T12:00:00Z", "2024-03-01T15:00:00Z", "ontem 09:00"],
])(
  "formats %s relative to %s in the Sao Paulo calendar",
  (value, now, expected) => {
    expect(formatQueueDate(value, new Date(now))).toBe(expected);
  },
);

test("server-safe dates retain an absolute value until the browser clock is available", () => {
  expect(formatQueueDate("2026-11-23T01:05:00Z")).toBe("22/11/2026 22:05");
});

test("labels demo cards from explicit backend metadata", () => {
  const item = { ...queueFixture().columns.new.items[0], isDemo: true };
  render(<OccurrenceCard item={item} />);
  expect(screen.getByText("Dados de demonstração")).toBeInTheDocument();
  expect(screen.getByText("Demo")).toBeVisible();
  expect(screen.queryByText(item.location!)).not.toBeInTheDocument();
  expect(item.location).toBe("Hall sintético do quinto andar");
  const time = screen.getByLabelText("22/11/2026, 09:05 — Horário de Brasília");
  expect(time).toHaveAttribute("datetime", item.registeredAt);
  expect(time).toHaveAttribute(
    "title",
    "22/11/2026, 09:05 — Horário de Brasília",
  );
});

test("relative dates update across midnight without reloading the queue", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-23T02:59:30Z"));
  const view = render(<OccurrenceQueue state={success()} />);
  try {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(
      within(screen.getAllByRole("article")[0]).getByText("hoje 09:05"),
    ).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(
      within(screen.getAllByRole("article")[0]).getByText("ontem 09:05"),
    ).toBeInTheDocument();
  } finally {
    view.unmount();
    vi.useRealTimers();
  }
});

test("mobile tabs support keyboard selection and retain it through data and viewport updates", () => {
  let mobile = true;
  const listeners = new Set<() => void>();
  vi.stubGlobal("matchMedia", () => ({
    matches: mobile,
    addEventListener: (_event: string, listener: () => void) =>
      listeners.add(listener),
    removeEventListener: (_event: string, listener: () => void) =>
      listeners.delete(listener),
  }));
  const view = render(<OccurrenceQueue state={success(queueFixture("all"))} />);
  try {
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      "Novo4",
      "Andamento1",
      "Delegado1",
      "Concluído1",
    ]);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    tabs[0].focus();
    fireEvent.keyDown(tabs[0], { key: "ArrowLeft" });
    expect(tabs[3]).toHaveFocus();
    expect(tabs[3]).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(tabs[3], { key: "Home" });
    expect(tabs[0]).toHaveFocus();
    fireEvent.keyDown(tabs[0], { key: "End" });
    expect(tabs[3]).toHaveFocus();
    fireEvent.keyDown(tabs[3], { key: "ArrowRight" });
    expect(tabs[0]).toHaveFocus();
    fireEvent.click(tabs[2]);
    view.rerender(<OccurrenceQueue state={{ status: "loading" }} />);
    view.rerender(<OccurrenceQueue state={success(queueEmptyFixture)} />);
    expect(tabs[2]).toHaveAttribute("aria-selected", "true");
    expect(tabs[2]).toHaveTextContent("Delegado0");
    const panel = document.getElementById(
      tabs[2].getAttribute("aria-controls")!,
    )!;
    expect(panel).toHaveAttribute("role", "tabpanel");
    expect(panel).toHaveAttribute("aria-labelledby", tabs[2].id);
    expect(panel).toHaveTextContent("Nenhuma ocorrência delegada.");
    act(() => {
      mobile = false;
      listeners.forEach((listener) => listener());
    });
    expect(panel).not.toHaveAttribute("role");
    act(() => {
      mobile = true;
      listeners.forEach((listener) => listener());
    });
    expect(tabs[2]).toHaveAttribute("aria-selected", "true");
    expect(panel).toHaveAttribute("role", "tabpanel");
  } finally {
    view.unmount();
    vi.unstubAllGlobals();
  }
});
