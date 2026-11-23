import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, expect, test, vi } from "vitest";
import { PasswordRecovery } from "@/components/password-recovery";
import {
  RecoveryFlowProvider,
  useRecoveryFlow,
} from "@/components/recovery-flow";
import { submitNewPassword, submitPasswordRecovery } from "@/lib/auth/submit";
import { AuthRequestError } from "@/lib/auth/request";

const navigation = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));
vi.mock("@/lib/auth/submit", () => ({
  submitPasswordRecovery: vi.fn(),
  submitNewPassword: vi.fn(),
}));
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(submitPasswordRecovery).mockResolvedValue(undefined);
  vi.mocked(submitNewPassword).mockResolvedValue(undefined);
});

function CodeFixture() {
  const flow = useRecoveryFlow();
  const [ready, setReady] = useState(false);
  return ready ? (
    <PasswordRecovery initialStep="code" />
  ) : (
    <button
      onClick={() => {
        flow?.setState({
          email: "person@example.invalid",
          code: "",
          passwordChanged: false,
        });
        setReady(true);
      }}
    >
      Start
    </button>
  );
}
function renderCode() {
  render(
    <RecoveryFlowProvider>
      <CodeFixture />
    </RecoveryFlowProvider>,
  );
  fireEvent.click(screen.getByText("Start"));
}
function advance() {
  fireEvent.change(screen.getByLabelText("Código"), {
    target: { value: "123456" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
}
function save() {
  fireEvent.change(screen.getByLabelText("Nova senha"), {
    target: { value: "Example123" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Salvar nova senha" }));
}

test("validates email, focuses the error and requests recovery before navigation", async () => {
  render(
    <RecoveryFlowProvider>
      <PasswordRecovery />
    </RecoveryFlowProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Enviar código" }));
  expect(screen.getByLabelText("E-mail")).toHaveFocus();
  expect(screen.getByLabelText("E-mail")).toHaveAccessibleDescription(
    "Informe seu e-mail.",
  );
  expect(submitPasswordRecovery).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("E-mail"), {
    target: { value: "person@example.invalid" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Enviar código" }));
  await waitFor(() =>
    expect(navigation.push).toHaveBeenCalledWith(
      "/confirmar-codigo/recuperacao",
    ),
  );
  expect(submitPasswordRecovery).toHaveBeenCalledWith("person@example.invalid");
});

test("reports request failures without navigating", async () => {
  vi.mocked(submitPasswordRecovery).mockRejectedValue(
    new AuthRequestError("network", "Falha de conexão."),
  );
  render(
    <RecoveryFlowProvider>
      <PasswordRecovery />
    </RecoveryFlowProvider>,
  );
  fireEvent.change(screen.getByLabelText("E-mail"), {
    target: { value: "person@example.invalid" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Enviar código" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Falha de conexão.",
  );
  expect(navigation.push).not.toHaveBeenCalled();
});

test("checks only code format before the password step and sends both once", async () => {
  renderCode();
  fireEvent.change(screen.getByLabelText("Código"), {
    target: { value: "12a3" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
  expect(screen.getByLabelText("Código")).toHaveValue("123");
  expect(screen.getByLabelText("Código")).toHaveFocus();
  advance();
  expect(submitNewPassword).not.toHaveBeenCalled();
  expect(screen.getByText(/serão conferidos juntos/)).toBeVisible();
  save();
  await waitFor(() =>
    expect(navigation.replace).toHaveBeenCalledWith("/login"),
  );
  expect(submitNewPassword).toHaveBeenCalledExactlyOnceWith({
    email: "person@example.invalid",
    code: "123456",
    password: "Example123",
  });
});

test.each(["update_failed", "network", "unknown"])(
  "discards consumed or uncertain codes after %s and requires a new send",
  async (code) => {
    vi.mocked(submitNewPassword).mockRejectedValue(
      new AuthRequestError(code, "Solicite um novo código."),
    );
    renderCode();
    advance();
    save();
    await screen.findByRole("alert");
    expect(screen.getByLabelText("Código")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Continuar" })).toBeDisabled();
    expect(navigation.replace).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Reenviar código" }));
    await screen.findByRole("status");
    expect(screen.getByRole("button", { name: "Continuar" })).toBeEnabled();
    expect(submitPasswordRecovery).toHaveBeenCalledWith(
      "person@example.invalid",
    );
  },
);

test("prevents duplicate password updates and clears data when changing email", async () => {
  vi.mocked(submitNewPassword).mockImplementation(() => new Promise(() => {}));
  renderCode();
  advance();
  save();
  expect(screen.getByRole("button", { name: "Salvando..." })).toBeDisabled();
  fireEvent.submit(screen.getByLabelText("Nova senha").closest("form")!);
  expect(submitNewPassword).toHaveBeenCalledTimes(1);
});

test("handles missing context without accepting a code", () => {
  render(
    <RecoveryFlowProvider>
      <PasswordRecovery initialStep="code" />
    </RecoveryFlowProvider>,
  );
  expect(screen.queryByLabelText("Código")).not.toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: "Solicitar código" }),
  ).toHaveAttribute("href", "/recuperar-senha");
});
