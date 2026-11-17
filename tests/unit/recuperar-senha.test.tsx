import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import PasswordRecoveryPage from "@/app/recuperar-senha/page";
import { submitPasswordRecovery } from "@/lib/auth/submit";

vi.mock("@/lib/auth/submit", () => ({
  submitPasswordRecovery: vi.fn(async () => {}),
}));

beforeEach(() => {
  vi.mocked(submitPasswordRecovery).mockReset();
  vi.mocked(submitPasswordRecovery).mockResolvedValue(undefined);
});

afterEach(() => {
  vi.clearAllMocks();
});

test("renders the recovery screen", () => {
  render(<PasswordRecoveryPage />);

  expect(
    screen.getByRole("heading", { level: 1, name: "Recuperar senha" }),
  ).toBeInTheDocument();
  expect(
    screen.getByText(
      "Informe o e-mail da sua conta para receber o link de redefinição de senha.",
    ),
  ).toBeInTheDocument();
  expect(screen.getByLabelText("E-mail")).toHaveAttribute("type", "email");
  expect(
    screen.getByRole("link", { name: "Voltar para o login" }),
  ).toHaveAttribute("href", "/login");
});

test("shows a validation error linked to the e-mail field", () => {
  render(<PasswordRecoveryPage />);

  fireEvent.click(screen.getByRole("button", { name: "Enviar link" }));

  const emailError = screen.getByText("Informe seu e-mail.");
  const emailField = screen.getByLabelText("E-mail");

  expect(emailError).toHaveAttribute("role", "alert");
  expect(emailField).toHaveAttribute("aria-invalid", "true");
  expect(emailField).toHaveAttribute("aria-describedby", emailError.id);
  expect(submitPasswordRecovery).not.toHaveBeenCalled();
});

test("rejects an invalid e-mail", () => {
  render(<PasswordRecoveryPage />);

  fireEvent.change(screen.getByLabelText("E-mail"), {
    target: { value: "not-an-email" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Enviar link" }));

  expect(screen.getByText("Informe um e-mail válido.")).toBeInTheDocument();
  expect(submitPasswordRecovery).not.toHaveBeenCalled();
});

test("disables the submit button while the request is pending", () => {
  vi.mocked(submitPasswordRecovery).mockImplementation(
    () => new Promise(() => {}),
  );

  render(<PasswordRecoveryPage />);

  fireEvent.change(screen.getByLabelText("E-mail"), {
    target: { value: "morador@email.com" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Enviar link" }));

  const pendingButton = screen.getByRole("button", { name: "Enviando..." });

  expect(pendingButton).toBeDisabled();
  expect(submitPasswordRecovery).toHaveBeenCalledTimes(1);
  expect(submitPasswordRecovery).toHaveBeenCalledWith("morador@email.com");

  fireEvent.click(pendingButton);

  expect(submitPasswordRecovery).toHaveBeenCalledTimes(1);
});

test("replaces the form with a confirmation message on success", async () => {
  render(<PasswordRecoveryPage />);

  fireEvent.change(screen.getByLabelText("E-mail"), {
    target: { value: "morador@email.com" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Enviar link" }));

  const confirmation = await screen.findByRole("status");

  expect(confirmation).toHaveTextContent(
    "Se este e-mail estiver cadastrado, enviaremos um link para redefinir sua senha.",
  );
  expect(confirmation).not.toHaveTextContent("morador@email.com");
  expect(
    screen.queryByRole("button", { name: "Enviar link" }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: "Voltar para o login" }),
  ).toBeInTheDocument();
});
