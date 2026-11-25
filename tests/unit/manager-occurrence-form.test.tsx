import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { ManagerOccurrenceForm } from "@/components/manager-occurrence-form";
import type { ManagerOccurrenceOperations } from "@/lib/manager-occurrences/contract";

const trackingCode = "a".repeat(64);

function operations(
  overrides: Partial<ManagerOccurrenceOperations> = {},
): ManagerOccurrenceOperations {
  return {
    loadCondominiums: vi.fn().mockResolvedValue({
      ok: true,
      data: [
        { id: "c1", name: "Cond A" },
        { id: "c2", name: "Cond B" },
      ],
    }),
    register: vi
      .fn()
      .mockResolvedValue({ ok: true, number: 42, trackingCode }),
    ...overrides,
  };
}

test("bloqueia o envio com obrigatórios vazios e não chama a API", async () => {
  const api = operations();
  render(<ManagerOccurrenceForm onClose={() => {}} operations={api} />);
  await screen.findByRole("combobox", { name: "Como chegou" });
  fireEvent.click(screen.getByRole("button", { name: "Registrar na fila" }));
  expect(
    await screen.findByText("Confira os campos indicados."),
  ).toBeVisible();
  expect(api.register).not.toHaveBeenCalled();
});

test("registra, mostra o número e dispara onRegistered", async () => {
  const api = operations();
  const onRegistered = vi.fn();
  render(
    <ManagerOccurrenceForm
      onClose={() => {}}
      onRegistered={onRegistered}
      operations={api}
    />,
  );
  const channel = await screen.findByRole("combobox", { name: "Como chegou" });
  fireEvent.change(screen.getByRole("combobox", { name: "Condomínio" }), {
    target: { value: "c2" },
  });
  fireEvent.change(channel, { target: { value: "whatsapp" } });
  fireEvent.change(
    screen.getByRole("textbox", { name: "Onde fica o problema" }),
    { target: { value: "Garagem" } },
  );
  fireEvent.change(screen.getByRole("textbox", { name: "O que aconteceu" }), {
    target: { value: "Vazamento na garagem" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Registrar na fila" }));
  expect(await screen.findByText("#42")).toBeVisible();
  await waitFor(() => expect(onRegistered).toHaveBeenCalled());
  expect(api.register).toHaveBeenCalledWith(
    expect.objectContaining({
      condominiumId: "c2",
      channel: "whatsapp",
      location: "Garagem",
      description: "Vazamento na garagem",
    }),
  );
});

test("pré-seleciona quando há um único condomínio", async () => {
  const api = operations({
    loadCondominiums: vi
      .fn()
      .mockResolvedValue({ ok: true, data: [{ id: "only", name: "Único Cond" }] }),
  });
  render(<ManagerOccurrenceForm onClose={() => {}} operations={api} />);
  const select = await screen.findByRole("combobox", { name: "Condomínio" });
  expect(select).toHaveValue("only");
});
