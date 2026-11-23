import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import LoginPage from "@/app/login/page";
import { submitLogin } from "@/lib/auth/submit";

const navigation = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));

vi.mock("@/lib/auth/submit", () => ({
  submitLogin: vi.fn(async () => {}),
}));

beforeEach(() => {
  vi.mocked(submitLogin).mockReset();
  vi.mocked(submitLogin).mockResolvedValue(undefined);
});

afterEach(() => {
  vi.clearAllMocks();
});

test("renders the login screen", () => {
  render(<LoginPage />);

  expect(
    screen.getByRole("heading", { level: 1, name: "Entrar" }),
  ).toBeInTheDocument();
  expect(screen.getByText("Sindicondo")).toBeInTheDocument();
  expect(
    screen.getByText("Painel do síndico profissional."),
  ).toBeInTheDocument();
  expect(screen.getByLabelText("E-mail")).toHaveAttribute("type", "email");
  expect(screen.getByLabelText("E-mail")).toHaveAttribute(
    "autocomplete",
    "username",
  );
  expect(screen.getByLabelText("Senha")).toHaveAttribute(
    "autocomplete",
    "current-password",
  );
  expect(screen.getByLabelText("Manter conectado")).toBeChecked();
  expect(screen.getByRole("link", { name: "Criar conta" })).toHaveAttribute(
    "href",
    "/criar-conta",
  );
});

test("shows validation errors linked to the fields", () => {
  render(<LoginPage />);

  fireEvent.click(screen.getByRole("button", { name: "Entrar" }));

  const emailError = screen.getByText("Informe seu e-mail.");
  const passwordError = screen.getByText("Informe sua senha.");

  expect(emailError).toHaveAttribute("role", "alert");
  expect(passwordError).toHaveAttribute("role", "alert");

  const emailField = screen.getByLabelText("E-mail");
  const passwordField = screen.getByLabelText("Senha");

  expect(emailField).toHaveAttribute("aria-invalid", "true");
  expect(emailField).toHaveAttribute("aria-describedby", emailError.id);
  expect(passwordField).toHaveAttribute("aria-invalid", "true");
  expect(passwordField).toHaveAttribute("aria-describedby", passwordError.id);
  expect(emailField).toHaveFocus();
  expect(submitLogin).not.toHaveBeenCalled();
});

test("rejects an invalid e-mail", () => {
  render(<LoginPage />);

  fireEvent.change(screen.getByLabelText("E-mail"), {
    target: { value: "not-an-email" },
  });
  fireEvent.change(screen.getByLabelText("Senha"), {
    target: { value: "secret" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Entrar" }));

  expect(screen.getByText("Informe um e-mail válido.")).toBeInTheDocument();
  expect(screen.getByLabelText("E-mail")).toHaveFocus();
  expect(screen.queryByText("Informe sua senha.")).not.toBeInTheDocument();
  expect(submitLogin).not.toHaveBeenCalled();
});

test("focuses the password when it is the first invalid field", () => {
  render(<LoginPage />);

  fireEvent.change(screen.getByLabelText("E-mail"), {
    target: { value: "person@example.com" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Entrar" }));

  expect(screen.getByText("Informe sua senha.")).toBeInTheDocument();
  expect(screen.getByLabelText("Senha")).toHaveFocus();
});

test("toggles the password visibility", () => {
  render(<LoginPage />);

  const passwordField = screen.getByLabelText("Senha");
  const toggle = screen.getByRole("button", { name: "Mostrar senha" });

  expect(passwordField).toHaveAttribute("type", "password");
  expect(toggle).toHaveAttribute("aria-pressed", "false");

  fireEvent.click(toggle);

  expect(screen.getByLabelText("Senha")).toHaveAttribute("type", "text");
  expect(screen.getByRole("button", { name: "Ocultar senha" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  fireEvent.click(screen.getByRole("button", { name: "Ocultar senha" }));

  expect(screen.getByLabelText("Senha")).toHaveAttribute("type", "password");
});

test("links to the password recovery screen", () => {
  render(<LoginPage />);

  expect(
    screen.getByRole("link", { name: "Esqueci minha senha" }),
  ).toHaveAttribute("href", "/recuperar-senha");
});

test("shows a generic credential error and keeps focus on e-mail after rejection", async () => {
  vi.mocked(submitLogin).mockRejectedValue(new Error("Invalid credentials"));

  render(<LoginPage />);

  const email = screen.getByLabelText("E-mail");
  fireEvent.change(email, { target: { value: "person@example.com" } });
  fireEvent.change(screen.getByLabelText("Senha"), {
    target: { value: "incorrect" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Entrar" }));

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "E-mail ou senha incorretos. Confira os dados ou recupere a senha.",
  );
  expect(email).toHaveValue("person@example.com");
  expect(email).toHaveFocus();
});

test("submits the credentials once while the request is pending", () => {
  vi.mocked(submitLogin).mockImplementation(() => new Promise(() => {}));

  render(<LoginPage />);

  fireEvent.change(screen.getByLabelText("E-mail"), {
    target: { value: "morador@email.com" },
  });
  fireEvent.change(screen.getByLabelText("Senha"), {
    target: { value: "secret" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Entrar" }));

  const pendingButton = screen.getByRole("button", { name: "Entrando..." });

  expect(pendingButton).toBeDisabled();
  expect(submitLogin).toHaveBeenCalledTimes(1);
  expect(submitLogin).toHaveBeenCalledWith({
    email: "morador@email.com",
    password: "secret",
    keepSignedIn: true,
  });

  fireEvent.click(pendingButton);

  expect(submitLogin).toHaveBeenCalledTimes(1);
});

test("navigates to the protected queue after the real login contract succeeds", async () => {
  render(<LoginPage />);
  fireEvent.change(screen.getByLabelText("E-mail"), {
    target: { value: "person@example.invalid" },
  });
  fireEvent.change(screen.getByLabelText("Senha"), {
    target: { value: "Example123" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Entrar" }));
  await vi.waitFor(() =>
    expect(navigation.replace).toHaveBeenCalledWith("/fila"),
  );
  expect(navigation.refresh).toHaveBeenCalled();
});
