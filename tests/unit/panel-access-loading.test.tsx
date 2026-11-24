import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { PanelAccessLoading } from "@/components/panel-access-loading";

test("uses a public light shell while access is pending without private controls or data", () => {
  render(<PanelAccessLoading title="Fila de ocorrências" />);
  const status = screen.getByRole("status");
  expect(status).toHaveTextContent("Carregando painel…");
  expect(status).toHaveAttribute("aria-live", "polite");
  expect(status).toHaveClass(
    "min-h-screen",
    "bg-[#f6f7f9]",
    "text-[#111827]",
    "[color-scheme:light]",
  );
  expect(
    screen.getByText("Sindicondo").closest('[aria-hidden="true"]'),
  ).toBeInTheDocument();
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
  expect(screen.queryByRole("heading")).not.toBeInTheDocument();
  expect(status).not.toHaveAttribute("tabindex");
});
