import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { Condominiums } from "@/components/condominiums";

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  useSearchParams: () => new URLSearchParams(),
}));
const router = { replace: vi.fn(), refresh: vi.fn() };
afterEach(() => vi.unstubAllGlobals());

test("loading, unavailable and retry states remain actionable", async () => {
  const fetcher = vi
    .fn()
    .mockRejectedValueOnce(new Error("Offline"))
    .mockResolvedValue(new Response(JSON.stringify({ condominiums: [] })));
  vi.stubGlobal("fetch", fetcher);
  render(<Condominiums />);
  expect(screen.getByText("Carregando condomínios…")).toBeInTheDocument();
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Não foi possível carregar",
  );
  fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
  expect(
    await screen.findByText(/Nenhum condomínio por enquanto/),
  ).toBeInTheDocument();
});

test("validates fields, blocks duplicate submission and retains values after failure", async () => {
  let finish!: (value: Response) => void;
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ condominiums: [] })))
    .mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
  vi.stubGlobal("fetch", fetcher);
  render(<Condominiums />);
  await screen.findByText(/Nenhum condomínio por enquanto/);
  fireEvent.click(screen.getByRole("button", { name: "Novo condomínio" }));
  fireEvent.click(screen.getByRole("button", { name: "Salvar e gerar link" }));
  const name = screen.getByLabelText("Nome");
  expect(name).toHaveFocus();
  expect(name).toHaveAccessibleDescription("Dê um nome ao condomínio.");
  fireEvent.change(name, { target: { value: "Nome sintético" } });
  fireEvent.change(screen.getByLabelText("Endereço"), {
    target: { value: "Endereço sintético" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Salvar e gerar link" }));
  fireEvent.submit(name.closest("form")!);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(screen.getByRole("button", { name: "Salvando…" })).toBeDisabled();
  finish(
    new Response(JSON.stringify({ error: "Falha temporária" }), {
      status: 503,
    }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Falha temporária",
  );
  vi.useFakeTimers();
  try {
    act(() => vi.advanceTimersByTime(10000));
    expect(screen.getByRole("alert")).toHaveTextContent("Falha temporária");
  } finally {
    vi.useRealTimers();
  }
  expect(name).toHaveValue("Nome sintético");
  expect(screen.getByLabelText("Endereço")).toHaveValue("Endereço sintético");
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Salvar e gerar link" }),
    ).toBeEnabled(),
  );
});

const fixture = {
  id: "synthetic-condominium",
  name: "Condomínio sintético",
  address: "Endereço sintético",
  slug: "sintetico-ab12",
  url: "http://127.0.0.1:3100/c/sintetico-ab12",
};

async function renderCard() {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockImplementation(
        async (_path, options) =>
          new Response(
            JSON.stringify(
              options?.method
                ? { condominium: fixture }
                : { condominiums: [fixture] },
            ),
          ),
      ),
  );
  const result = render(<Condominiums />);
  await screen.findByRole("article");
  return result;
}

test("edit feedback stays in its card and expires without moving focus", async () => {
  await renderCard();
  fireEvent.click(screen.getByRole("button", { name: "Editar" }));
  fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
  const message = await screen.findByText(
    "Condomínio atualizado. O link não mudou.",
  );
  expect(message.closest("article")).toBe(screen.getByRole("article"));
  expect(message).toHaveAttribute("role", "status");
  expect(message).toHaveAttribute("aria-live", "polite");
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Editar" })).toHaveFocus(),
  );
  vi.useFakeTimers();
  try {
    fireEvent.click(screen.getByRole("button", { name: "Editar" }));
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await act(async () => {});
    expect(
      screen.getByText("Condomínio atualizado. O link não mudou."),
    ).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(4999));
    expect(
      screen.getByText("Condomínio atualizado. O link não mudou."),
    ).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(
      screen.queryByText("Condomínio atualizado. O link não mudou."),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Editar" })).toHaveFocus();
  } finally {
    vi.useRealTimers();
  }
});

test("clipboard successes restart their deadline, preserve focus and clean up on unmount", async () => {
  const view = await renderCard();
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
  vi.useFakeTimers();
  try {
    const copy = screen.getByRole("button", { name: "Copiar link" });
    copy.focus();
    await act(async () => fireEvent.click(copy));
    expect(screen.getByText("Link copiado")).toHaveAttribute(
      "aria-live",
      "polite",
    );
    act(() => vi.advanceTimersByTime(4000));
    await act(async () => fireEvent.click(copy));
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByText("Link copiado")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(4000));
    expect(screen.queryByText("Link copiado")).not.toBeInTheDocument();
    expect(copy).toHaveFocus();
    await act(async () => fireEvent.click(copy));
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});

test("clipboard errors and validation errors do not expire", async () => {
  await renderCard();
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn().mockRejectedValue(new Error("Denied")) },
  });
  vi.useFakeTimers();
  try {
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Copiar link" })),
    );
    act(() => vi.advanceTimersByTime(10000));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Não foi possível copiar.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Editar" }));
    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: " " } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    act(() => vi.advanceTimersByTime(10000));
    expect(screen.getByText("Dê um nome ao condomínio.")).toBeInTheDocument();
  } finally {
    vi.useRealTimers();
  }
});

test("a delayed initial list preserves records created while it was loading", async () => {
  router.refresh.mockClear();
  let finishLoad!: (value: Response) => void;
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            finishLoad = resolve;
          }),
      )
      .mockResolvedValue(
        new Response(JSON.stringify({ condominium: fixture }), { status: 201 }),
      ),
  );
  render(<Condominiums />);
  fireEvent.click(screen.getByRole("button", { name: "Novo condomínio" }));
  fireEvent.change(screen.getByLabelText("Nome"), {
    target: { value: fixture.name },
  });
  fireEvent.change(screen.getByLabelText("Endereço"), {
    target: { value: fixture.address },
  });
  fireEvent.click(screen.getByRole("button", { name: "Salvar e gerar link" }));
  await waitFor(() => expect(router.refresh).toHaveBeenCalled());
  const existing = {
    ...fixture,
    id: "existing-condominium",
    name: "Condomínio anterior",
  };
  await act(async () => {
    finishLoad(new Response(JSON.stringify({ condominiums: [existing] })));
  });
  expect(
    screen.getByRole("article", { name: fixture.name }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("article", { name: existing.name }),
  ).toBeInTheDocument();
});

test("successful empty consultation has the queue-style empty card and no retry error", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(Response.json({ condominiums: [] })),
  );
  render(<Condominiums />);
  const title = await screen.findByRole("heading", {
    name: "Nenhum condomínio por enquanto",
  });
  expect(title).toBeVisible();
  expect(
    screen.getByText("Cadastre seu primeiro condomínio para começar."),
  ).toBeVisible();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Tentar novamente" }),
  ).not.toBeInTheDocument();
});

test("an HTTP backend failure remains an error and retries to a successful empty state", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({ error: "Synthetic backend failure" }, { status: 503 }),
    )
    .mockResolvedValueOnce(Response.json({ condominiums: [] }));
  vi.stubGlobal("fetch", fetcher);
  render(<Condominiums />);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Não foi possível carregar os condomínios.",
  );
  expect(
    screen.queryByRole("heading", { name: "Nenhum condomínio por enquanto" }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
  expect(
    await screen.findByRole("heading", {
      name: "Nenhum condomínio por enquanto",
    }),
  ).toBeVisible();
});
