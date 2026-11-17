import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import ConfirmationCodePage from "@/app/confirmar-codigo/page";
import {
  submitConfirmationCode,
  submitResendConfirmationCode,
} from "@/lib/auth/submit";

vi.mock("@/lib/auth/submit", () => ({
  submitConfirmationCode: vi.fn(async () => ({ ok: true })),
  submitResendConfirmationCode: vi.fn(async () => {}),
}));

beforeEach(() => {
  vi.mocked(submitConfirmationCode).mockReset();
  vi.mocked(submitConfirmationCode).mockResolvedValue({ ok: true });
  vi.mocked(submitResendConfirmationCode).mockReset();
  vi.mocked(submitResendConfirmationCode).mockResolvedValue(undefined);
});

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

test("renders the confirmation code screen", () => {
  render(<ConfirmationCodePage />);

  expect(
    screen.getByRole("heading", { level: 1, name: "Confirmar código" }),
  ).toBeInTheDocument();
  expect(
    screen.getByText("Enviamos um código para o seu e-mail."),
  ).toBeInTheDocument();

  const codeField = screen.getByLabelText("Código");

  expect(codeField).toHaveAttribute("inputmode", "numeric");
  expect(codeField).toHaveAttribute("autocomplete", "one-time-code");
  expect(codeField).toHaveAttribute("maxlength", "6");
  expect(
    screen.getByRole("link", { name: "Voltar para o login" }),
  ).toHaveAttribute("href", "/login");
});

test("accepts only digits up to the code length", () => {
  render(<ConfirmationCodePage />);

  const codeField = screen.getByLabelText("Código");

  fireEvent.change(codeField, { target: { value: "12ab34-56" } });

  expect(codeField).toHaveValue("123456");
});

test("shows a validation error linked to the code field", () => {
  render(<ConfirmationCodePage />);

  fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));

  const codeError = screen.getByText("Informe o código recebido.");

  expect(codeError).toHaveAttribute("role", "alert");
  expect(screen.getByLabelText("Código")).toHaveAttribute(
    "aria-describedby",
    codeError.id,
  );
  expect(submitConfirmationCode).not.toHaveBeenCalled();
});

test("rejects a code with fewer digits than required", () => {
  render(<ConfirmationCodePage />);

  fireEvent.change(screen.getByLabelText("Código"), {
    target: { value: "123" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));

  expect(screen.getByText("O código deve ter 6 dígitos.")).toBeInTheDocument();
  expect(submitConfirmationCode).not.toHaveBeenCalled();
});

test("disables the submit button while the request is pending", () => {
  vi.mocked(submitConfirmationCode).mockImplementation(
    () => new Promise(() => {}),
  );

  render(<ConfirmationCodePage />);

  fireEvent.change(screen.getByLabelText("Código"), {
    target: { value: "123456" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));

  const pendingButton = screen.getByRole("button", { name: "Confirmando..." });

  expect(pendingButton).toBeDisabled();
  expect(submitConfirmationCode).toHaveBeenCalledTimes(1);
  expect(submitConfirmationCode).toHaveBeenCalledWith("123456");

  fireEvent.click(pendingButton);

  expect(submitConfirmationCode).toHaveBeenCalledTimes(1);
});

test("shows an error for an invalid code returned by the submit", async () => {
  vi.mocked(submitConfirmationCode).mockResolvedValue({
    ok: false,
    error: "invalid-code",
  });

  render(<ConfirmationCodePage />);

  fireEvent.change(screen.getByLabelText("Código"), {
    target: { value: "123456" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));

  const codeError = await screen.findByRole("alert");

  expect(codeError).toHaveTextContent(
    "Código inválido. Verifique e tente novamente.",
  );
  expect(screen.getByRole("button", { name: "Confirmar" })).toBeEnabled();
});

test("shows an error for an expired code returned by the submit", async () => {
  vi.mocked(submitConfirmationCode).mockResolvedValue({
    ok: false,
    error: "expired-code",
  });

  render(<ConfirmationCodePage />);

  fireEvent.change(screen.getByLabelText("Código"), {
    target: { value: "123456" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));

  expect(
    await screen.findByText("Este código expirou. Solicite um novo código."),
  ).toBeInTheDocument();
});

test("counts down before allowing a new code request", async () => {
  vi.useFakeTimers();

  render(<ConfirmationCodePage />);

  const resendButton = screen.getByRole("button", { name: "Reenviar código" });

  expect(resendButton).toBeEnabled();

  fireEvent.click(resendButton);

  expect(submitResendConfirmationCode).toHaveBeenCalledTimes(1);
  expect(
    screen.getByRole("button", { name: "Reenviar código (30s)" }),
  ).toBeDisabled();

  act(() => {
    vi.advanceTimersByTime(1000);
  });

  expect(
    screen.getByRole("button", { name: "Reenviar código (29s)" }),
  ).toBeDisabled();

  for (let elapsed = 0; elapsed < 29; elapsed += 1) {
    act(() => {
      vi.advanceTimersByTime(1000);
    });
  }

  expect(screen.getByRole("button", { name: "Reenviar código" })).toBeEnabled();
});
