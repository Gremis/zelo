import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { CopyTrackingLink } from "@/components/copy-tracking-link";

const link = `https://sindicondo.app/o/${"a".repeat(64)}`;

afterEach(() => vi.restoreAllMocks());

function clipboard(writeText: (value: string) => Promise<void>) {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
}

test("copies the tracking link and shows the success message", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  clipboard(writeText);
  render(
    <CopyTrackingLink link={link} label="Copiar link de acompanhamento" />,
  );
  const button = screen.getByRole("button", {
    name: "Copiar link de acompanhamento",
  });
  expect(button.tagName).toBe("BUTTON");
  button.focus();
  expect(button).toHaveFocus();
  fireEvent.click(button);
  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent("Link copiado"),
  );
  expect(writeText).toHaveBeenCalledExactlyOnceWith(link);
});

test("explains a clipboard failure without claiming success", async () => {
  clipboard(vi.fn().mockRejectedValue(new Error("denied")));
  render(<CopyTrackingLink link={link} label="Copiar" />);
  fireEvent.click(screen.getByRole("button", { name: "Copiar" }));
  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent(
      "Não foi possível copiar. Selecione o link.",
    ),
  );
});
