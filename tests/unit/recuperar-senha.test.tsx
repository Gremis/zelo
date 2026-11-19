import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import PasswordRecoveryPage from "@/app/recuperar-senha/page";
import { SignupFlowProvider, useSignupFlow } from "@/components/signup-flow";
import { submitPasswordRecovery } from "@/lib/auth/submit";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

vi.mock("@/lib/auth/submit", () => ({
  submitPasswordRecovery: vi.fn(async () => {}),
}));

beforeEach(() => {
  push.mockReset();
  vi.mocked(submitPasswordRecovery).mockReset();
  vi.mocked(submitPasswordRecovery).mockResolvedValue(undefined);
});

afterEach(() => {
  vi.clearAllMocks();
});

function RecoveryEmailProbe() {
  const { recoveryEmail } = useSignupFlow();
  return <output data-testid="recovery-email">{recoveryEmail}</output>;
}

function renderRecovery() {
  return render(
    <SignupFlowProvider>
      <PasswordRecoveryPage />
      <RecoveryEmailProbe />
    </SignupFlowProvider>,
  );
}

test("renders the recovery screen", () => {
  renderRecovery();

  expect(
    screen.getByRole("heading", { level: 1, name: "Recuperar senha" }),
  ).toBeInTheDocument();
  expect(
    screen.getByText(
      "Informe o e-mail da sua conta. Enviaremos um código para criar uma nova senha.",
    ),
  ).toBeInTheDocument();
  expect(screen.getByLabelText("E-mail")).toHaveAttribute("type", "email");
  expect(
    screen.getByRole("link", { name: "Voltar para entrar" }),
  ).toHaveAttribute("href", "/login");
});

test("shows a validation error linked to the e-mail field", () => {
  renderRecovery();

  fireEvent.click(screen.getByRole("button", { name: "Enviar código" }));

  const emailError = screen.getByText("Informe seu e-mail.");
  const emailField = screen.getByLabelText("E-mail");

  expect(emailError).toHaveAttribute("role", "alert");
  expect(emailField).toHaveAttribute("aria-invalid", "true");
  expect(emailField).toHaveAttribute("aria-describedby", emailError.id);
  expect(submitPasswordRecovery).not.toHaveBeenCalled();
});

test("rejects an invalid e-mail", () => {
  renderRecovery();

  fireEvent.change(screen.getByLabelText("E-mail"), {
    target: { value: "not-an-email" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Enviar código" }));

  expect(screen.getByText("Informe um e-mail válido.")).toBeInTheDocument();
  expect(submitPasswordRecovery).not.toHaveBeenCalled();
});

test("disables the submit button while the request is pending", () => {
  vi.mocked(submitPasswordRecovery).mockImplementation(
    () => new Promise(() => {}),
  );

  renderRecovery();

  fireEvent.change(screen.getByLabelText("E-mail"), {
    target: { value: "morador@email.com" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Enviar código" }));

  const pendingButton = screen.getByRole("button", { name: "Enviando..." });

  expect(pendingButton).toBeDisabled();
  expect(submitPasswordRecovery).toHaveBeenCalledTimes(1);
  expect(submitPasswordRecovery).toHaveBeenCalledWith("morador@email.com");

  fireEvent.click(pendingButton);

  expect(submitPasswordRecovery).toHaveBeenCalledTimes(1);
});

test.each(["conta@example.invalid", "sem-conta@example.invalid"])(
  "advances to the recovery code screen with the e-mail %s",
  async (email) => {
    renderRecovery();

    fireEvent.change(screen.getByLabelText("E-mail"), {
      target: { value: email },
    });
    fireEvent.click(screen.getByRole("button", { name: "Enviar código" }));

    await waitFor(() => {
      expect(push).toHaveBeenCalledWith("/confirmar-codigo/recuperacao");
    });
    expect(submitPasswordRecovery).toHaveBeenCalledWith(email);
    expect(screen.getByTestId("recovery-email")).toHaveTextContent(email);
  },
);

test("keeps the recovery e-mail when returning to the recovery screen", () => {
  renderRecovery();

  fireEvent.change(screen.getByLabelText("E-mail"), {
    target: { value: "pessoa@example.invalid" },
  });

  expect(screen.getByTestId("recovery-email")).toHaveTextContent(
    "pessoa@example.invalid",
  );
});
