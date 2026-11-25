import { render, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";
import { TrackingView } from "@/components/tracking-view";
import { occurrenceTrackingFixture } from "../fixtures/tracking";

function mount(overrides = {}) {
  const tracking = occurrenceTrackingFixture(overrides);
  return render(<TrackingView tracking={tracking} />);
}

test("shows the condominium, report, unit, location and translated situation", () => {
  mount();
  expect(screen.getByText("Edifício Sintético A")).toBeInTheDocument();
  expect(
    screen.getByRole("heading", {
      name: /Ocorrência #1043 · registrada 20\/11\/2026 às 09:00/,
    }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("heading", {
      name: "Infiltração no teto da garagem, pingando em cima do carro.",
    }),
  ).toBeInTheDocument();
  expect(screen.getByText("Bloco B, apto 704")).toBeInTheDocument();
  expect(screen.getByText("Garagem, vaga 22")).toBeInTheDocument();
  const steps = screen.getByRole("list", { name: "Etapas da ocorrência" });
  const items = within(steps).getAllByRole("listitem");
  expect(items).toHaveLength(3);
  expect(items[0]).toHaveTextContent("Recebida pelo síndico");
  expect(items[0]).toHaveAttribute("aria-current", "step");
  expect(items[1]).toHaveTextContent("Em andamento");
  expect(items[2]).toHaveTextContent("Concluída");
  expect(items[0]).toHaveTextContent("Etapa atual");
  expect(items[1]).toHaveTextContent("Etapa futura");
  expect(screen.getByText(/Este link mostra só esta ocorrência/)).toBeVisible();
});

test("marks reached steps and reads the current situation without relying on colour", () => {
  mount({
    situation: { step: "in_progress", label: "Em andamento" },
    updates: [
      {
        occurredAt: "2026-11-21T12:00:00Z",
        text: "O síndico está cuidando da ocorrência.",
      },
      {
        occurredAt: "2026-11-20T12:00:00Z",
        text: "Ocorrência registrada. O síndico já recebeu.",
      },
    ],
  });
  const steps = screen.getByRole("list", { name: "Etapas da ocorrência" });
  const items = within(steps).getAllByRole("listitem");
  expect(items[0]).toHaveTextContent("Etapa cumprida");
  expect(items[1]).toHaveAttribute("aria-current", "step");
  expect(items[1]).toHaveTextContent("Etapa atual");
  expect(items[2]).toHaveTextContent("Etapa futura");
  const updates = screen.getByRole("list", {
    name: "Atualizações da ocorrência",
  });
  const rows = within(updates).getAllByRole("listitem");
  expect(rows[0]).toHaveTextContent("O síndico está cuidando da ocorrência.");
  expect(rows[0]).toHaveTextContent("21/11/2026 às 09:00");
  expect(rows[1]).toHaveTextContent(
    "Ocorrência registrada. O síndico já recebeu.",
  );
});

test("a completed occurrence highlights the last step", () => {
  mount({
    situation: { step: "completed", label: "Concluída" },
    updates: [
      {
        occurredAt: "2026-11-22T22:00:00Z",
        text: "Ocorrência concluída.",
      },
    ],
  });
  const steps = screen.getByRole("list", { name: "Etapas da ocorrência" });
  const items = within(steps).getAllByRole("listitem");
  expect(items[2]).toHaveAttribute("aria-current", "step");
  expect(items[2]).toHaveTextContent("Etapa atual");
});

test("hides optional fields when the occurrence has no unit or location", () => {
  mount({ unit: null, location: null });
  expect(screen.queryByText("Unidade")).not.toBeInTheDocument();
  expect(screen.queryByText("Onde")).not.toBeInTheDocument();
});
