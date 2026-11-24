import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { PublicOccurrenceForm } from "@/components/public-occurrence-form";
import type {
  CondominiumResult,
  PublicOccurrenceOperations,
  RegistrationResult,
} from "@/lib/public-occurrences/contract";
import {
  normalizeRegistration,
  validateRegistration,
} from "@/lib/public-occurrences/validation";
import {
  publicCondominiumFixture,
  publicRegistrationFixture,
} from "../fixtures/public-occurrence";
import { trackingCodeFixture } from "../fixtures/tracking";

function operations(): PublicOccurrenceOperations {
  return {
    load: vi
      .fn()
      .mockResolvedValue({ ok: true, data: publicCondominiumFixture }),
    register: vi.fn().mockResolvedValue({
      ok: true,
      number: 123,
      trackingCode: trackingCodeFixture,
    }),
  };
}

async function fill() {
  await screen.findByRole("textbox", { name: "Seu nome" });
  for (const [label, value] of [
    ["Seu nome", "Ana"],
    ["Sua unidade", "Porteiro"],
    ["Celular", "(11) 90000-0000"],
    ["Onde fica o problema", "Hall de entrada"],
    ["O que aconteceu", "Lâmpada apagada"],
  ])
    fireEvent.change(screen.getByRole("textbox", { name: label }), {
      target: { value },
    });
}

function send() {
  fireEvent.click(screen.getByRole("button", { name: "Enviar ocorrência" }));
}

test("shows loading and a recoverable lookup failure without a fictitious form", async () => {
  const api = operations();
  let finish!: (value: CondominiumResult) => void;
  vi.mocked(api.load).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  render(<PublicOccurrenceForm slug="review-abcd" operations={api} />);
  expect(screen.getByRole("status")).toHaveTextContent("Carregando condomínio");
  expect(screen.queryByRole("form")).not.toBeInTheDocument();
  finish({ ok: false, error: "unavailable" });
  fireEvent.click(
    await screen.findByRole("button", { name: "Tentar novamente" }),
  );
  expect(
    await screen.findByRole("heading", { name: publicCondominiumFixture.name }),
  ).toBeVisible();
  expect(api.load).toHaveBeenCalledTimes(2);
});

test("missing links never render a functional form", async () => {
  const api = operations();
  vi.mocked(api.load).mockResolvedValue({ ok: false, error: "not_found" });
  render(<PublicOccurrenceForm slug="missing-abcd" operations={api} />);
  expect(
    await screen.findByRole("heading", { name: "Link não encontrado" }),
  ).toBeVisible();
  expect(screen.queryByRole("form")).not.toBeInTheDocument();
});

test("validates empty fields in visual order without moving focus while typing", async () => {
  const api = operations();
  render(<PublicOccurrenceForm slug="review-abcd" operations={api} />);
  const name = await screen.findByRole("textbox", { name: "Seu nome" });
  send();
  expect(name).toHaveFocus();
  expect(name).toHaveAttribute("aria-invalid", "true");
  expect(name).toHaveAccessibleDescription("Digite seu nome.");
  fireEvent.change(name, { target: { value: "A" } });
  expect(name).toHaveFocus();
  fireEvent.change(name, { target: { value: "Ana" } });
  send();
  expect(screen.getByRole("textbox", { name: "Sua unidade" })).toHaveFocus();
  expect(api.register).not.toHaveBeenCalled();
});

test("uses the confirmed number and a new attempt only after Registrar outra", async () => {
  const api = operations();
  render(<PublicOccurrenceForm slug="review-abcd" operations={api} />);
  await fill();
  send();
  const title = await screen.findByRole("heading", {
    name: "Ocorrência registrada",
  });
  expect(title).toHaveFocus();
  expect(screen.getByText("#123")).toBeVisible();
  expect(
    screen.getByRole("heading", { name: "Acompanhe por este link" }),
  ).toBeVisible();
  expect(
    screen.getByText(
      "Guarde o link. É por ele que você vê o andamento, sem precisar de conta.",
    ),
  ).toBeVisible();
  expect(
    screen.getByText(`https://sindicondo.app/o/${trackingCodeFixture}`),
  ).toBeVisible();
  expect(screen.getByRole("button", { name: "Copiar" })).toBeVisible();
  expect(
    screen.getByRole("link", { name: "Abrir acompanhamento" }),
  ).toHaveAttribute("href", `https://sindicondo.app/o/${trackingCodeFixture}`);
  const firstAttempt = vi.mocked(api.register).mock.calls[0][1];
  expect(firstAttempt.fields).toEqual(publicRegistrationFixture);
  expect(firstAttempt.key).toMatch(/^[0-9a-f-]{36}$/i);
  fireEvent.click(screen.getByRole("button", { name: "Registrar outra" }));
  expect(screen.getByRole("textbox", { name: "Seu nome" })).toHaveValue("");
  expect(screen.getByRole("textbox", { name: "Seu nome" })).toHaveFocus();
  expect(
    screen.getByRole("heading", { name: publicCondominiumFixture.name }),
  ).toBeVisible();
  await fill();
  send();
  await screen.findByRole("heading", { name: "Ocorrência registrada" });
  expect(vi.mocked(api.register).mock.calls[1][1].key).not.toBe(
    firstAttempt.key,
  );
});

test("prevents duplicate processing and maps server field errors without losing input", async () => {
  const api = operations();
  let finish!: (value: RegistrationResult) => void;
  vi.mocked(api.register).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  render(<PublicOccurrenceForm slug="review-abcd" operations={api} />);
  await fill();
  send();
  expect(
    screen.getByRole("button", { name: "Enviando ocorrência…" }),
  ).toBeDisabled();
  fireEvent.submit(screen.getByRole("form"));
  expect(api.register).toHaveBeenCalledTimes(1);
  expect(screen.queryByText("Ocorrência registrada")).not.toBeInTheDocument();
  finish({
    ok: false,
    error: "invalid_input",
    fields: { location: "Confira o local informado." },
  });
  const location = screen.getByRole("textbox", {
    name: "Onde fica o problema",
  });
  await waitFor(() => expect(location).toHaveFocus());
  expect(location).toHaveAccessibleDescription("Confira o local informado.");
  expect(screen.getByRole("textbox", { name: "Seu nome" })).toHaveValue("Ana");
  expect(location).toHaveValue("Hall de entrada");
  send();
  await screen.findByRole("heading", { name: "Ocorrência registrada" });
  expect(vi.mocked(api.register).mock.calls[1][1].key).not.toBe(
    vi.mocked(api.register).mock.calls[0][1].key,
  );
});

test("recovers an uncertain result using exactly the same key and payload and freezes edits", async () => {
  const api = operations();
  vi.mocked(api.register).mockResolvedValueOnce({
    ok: false,
    error: "uncertain",
  });
  render(<PublicOccurrenceForm slug="review-abcd" operations={api} />);
  await fill();
  send();
  await screen.findByRole("heading", {
    name: "Precisamos confirmar seu envio",
  });
  expect(
    screen.getByRole("textbox", { name: "O que aconteceu" }),
  ).toBeDisabled();
  expect(screen.getByText(/Se recarregar ou fechar/)).toBeVisible();
  expect(screen.queryByText("Ocorrência registrada")).not.toBeInTheDocument();
  fireEvent.click(
    screen.getByRole("button", { name: "Recuperar envio original" }),
  );
  await screen.findByRole("heading", { name: "Ocorrência registrada" });
  expect(vi.mocked(api.register).mock.calls[1]).toEqual(
    vi.mocked(api.register).mock.calls[0],
  );
});

test("409 never silently changes keys and requires explicit abandonment before another report", async () => {
  const api = operations();
  vi.mocked(api.register).mockResolvedValueOnce({
    ok: false,
    error: "conflict",
  });
  render(<PublicOccurrenceForm slug="review-abcd" operations={api} />);
  await fill();
  send();
  await screen.findByRole("heading", {
    name: "Não foi possível confirmar esta tentativa",
  });
  expect(api.register).toHaveBeenCalledTimes(1);
  fireEvent.click(
    screen.getByRole("button", { name: "Iniciar outro registro" }),
  );
  expect(screen.getByText(/pode duplicar a ocorrência/)).toBeVisible();
  fireEvent.click(
    screen.getByRole("button", { name: "Manter tentativa original" }),
  );
  expect(screen.getByRole("textbox", { name: "Seu nome" })).toHaveValue("Ana");
  fireEvent.click(
    screen.getByRole("button", { name: "Iniciar outro registro" }),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Descartar e iniciar outro" }),
  );
  expect(screen.getByRole("textbox", { name: "Seu nome" })).toHaveValue("");
  expect(api.register).toHaveBeenCalledTimes(1);
});

describe("validation compatibility", () => {
  test("accepts one name and Porteiro, normalizing only whitespace and phone formatting", () => {
    expect(validateRegistration(publicRegistrationFixture)).toEqual({});
    expect(
      normalizeRegistration({
        ...publicRegistrationFixture,
        reporterName: " Ana ",
        reporterPhone: "(11) 90000-0000",
      }),
    ).toEqual(publicRegistrationFixture);
  });
  test("enforces backend limits without truncation and rejects missing DDD", () => {
    for (const field of [
      "reporterName",
      "reporterUnitOrRole",
      "location",
      "description",
    ] as const) {
      const limit = field === "description" ? 10000 : 200;
      expect(
        validateRegistration({
          ...publicRegistrationFixture,
          [field]: "x".repeat(limit + 1),
        }),
      ).toHaveProperty(field);
    }
    expect(
      validateRegistration({
        ...publicRegistrationFixture,
        reporterPhone: "900000000",
      }),
    ).toEqual({ reporterPhone: "Digite o celular com DDD." });
    expect(
      validateRegistration({
        ...publicRegistrationFixture,
        description: "x\0y",
      }),
    ).toHaveProperty("description");
  });
});
