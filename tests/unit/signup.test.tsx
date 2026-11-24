import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { Activity, useState } from "react";
import SignupPage from "@/app/criar-conta/page";
import { SignupFlowProvider } from "@/components/signup-flow";
import { submitSignup, validateSignup } from "@/lib/auth/signup";

vi.mock("@/lib/auth/signup", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/signup")>()),
  submitSignup: vi.fn(async () => {
    throw new Error("Unavailable");
  }),
}));

beforeEach(() => {
  vi.mocked(submitSignup).mockReset();
  vi.mocked(submitSignup).mockRejectedValue(new Error("Unavailable"));
});

function renderSignup() {
  render(
    <SignupFlowProvider>
      <SignupPage />
    </SignupFlowProvider>,
  );
}

function fillValidForm() {
  fireEvent.change(screen.getByLabelText("Nome completo"), {
    target: { value: "  Pessoa Exemplo  " },
  });
  fireEvent.change(screen.getByLabelText("E-mail"), {
    target: { value: "  pessoa@example.invalid  " },
  });
  fireEvent.change(screen.getByLabelText("Celular"), {
    target: { value: "(31) 99999-0000" },
  });
  fireEvent.change(screen.getByLabelText("Senha"), {
    target: { value: "Example123" },
  });
  fireEvent.click(screen.getByRole("checkbox"));
}

test("shows accessible required errors and focuses the first invalid field", () => {
  renderSignup();
  expect(screen.getByRole("main")).toHaveAttribute("lang", "pt-BR");
  expect(screen.getByLabelText("Celular")).toHaveAttribute(
    "placeholder",
    "(00) 90000-0000",
  );
  fireEvent.click(screen.getByRole("button", { name: "Criar conta" }));
  expect(screen.getByLabelText("Nome completo")).toHaveFocus();
  expect(screen.getAllByRole("alert")).toHaveLength(5);
  for (const label of ["Nome completo", "E-mail", "Celular", "Senha"]) {
    const field = screen.getByLabelText(label);
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field).toHaveAccessibleDescription();
  }
  expect(submitSignup).not.toHaveBeenCalled();
});

test("accepts Unicode names and formatted phones while rejecting malformed input", () => {
  const values = {
    fullName: "李 明",
    email: "person@example.invalid",
    phone: "(31) 9999-0000",
    password: "Árvore123",
    acceptedTerms: true,
  };
  expect(validateSignup(values)).toEqual({});
  expect(
    validateSignup({
      ...values,
      fullName: "D’Ávila Exemplo",
      phone: "31999990000",
    }),
  ).toEqual({});
  expect(
    validateSignup({
      ...values,
      fullName: "Pessoa",
      email: "invalid",
      phone: "123",
      password: "abcdefgh",
      acceptedTerms: true,
    }),
  ).toHaveProperty("fullName");
  expect(
    validateSignup({
      ...values,
      fullName: "Pessoa",
      email: "invalid",
      phone: "123",
      password: "abcdefgh",
      acceptedTerms: true,
    }),
  ).toMatchObject({
    email: expect.any(String),
    phone: expect.any(String),
    password: expect.any(String),
  });
  expect(validateSignup({ ...values, password: "12345678" })).toHaveProperty(
    "password",
  );
  expect(validateSignup({ ...values, password: "abc123" })).toHaveProperty(
    "password",
  );
  expect(validateSignup({ ...values, phone: "123456789012" })).toHaveProperty(
    "phone",
  );
});

test("updates password requirements and supports showing and hiding the password", () => {
  renderSignup();
  const requirements = screen.getByRole("list", {
    name: "Requisitos da senha",
  });
  expect(within(requirements).getAllByText(/Pendente:/)).toHaveLength(3);
  fireEvent.change(screen.getByLabelText("Senha"), {
    target: { value: "Árvore123" },
  });
  expect(within(requirements).getAllByText(/Atendido:/)).toHaveLength(3);
  fireEvent.click(screen.getByRole("button", { name: "Mostrar" }));
  expect(screen.getByLabelText("Senha")).toHaveAttribute("type", "text");
  fireEvent.click(screen.getByRole("button", { name: "Ocultar" }));
  expect(screen.getByLabelText("Senha")).toHaveAttribute("type", "password");
});

test("requires consent without adding legal links", () => {
  renderSignup();
  fillValidForm();
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "Criar conta" }));
  expect(screen.getByRole("checkbox")).toHaveFocus();
  expect(screen.getByRole("checkbox")).toBeRequired();
  expect(screen.getByRole("alert")).toHaveTextContent("aceite os termos");
  expect(submitSignup).not.toHaveBeenCalled();
  expect(
    screen.queryByRole("link", { name: /termos|privacidade/i }),
  ).not.toBeInTheDocument();
});

test("reports unavailable signup honestly, clears the password and retains non-secret fields", async () => {
  renderSignup();
  fillValidForm();
  fireEvent.click(screen.getByRole("button", { name: "Criar conta" }));
  const error = await screen.findByRole("alert");
  expect(error).toHaveTextContent(
    "O cadastro está temporariamente indisponível. Não foi possível criar sua conta. Tente novamente mais tarde.",
  );
  expect(error).not.toHaveTextContent(/links|termos|privacidade/i);
  expect(submitSignup).toHaveBeenCalledWith({
    fullName: "Pessoa Exemplo",
    email: "pessoa@example.invalid",
    phone: "31999990000",
    password: "Example123",
    acceptedTerms: true,
  });
  expect(screen.getByLabelText("Senha")).toHaveValue("");
  expect(screen.getByLabelText("Nome completo")).toHaveValue(
    "  Pessoa Exemplo  ",
  );
  expect(
    screen.getByRole("heading", { name: "Criar conta" }),
  ).toBeInTheDocument();
  expect(screen.queryByText("Conta criada.")).not.toBeInTheDocument();
});

test("prevents repeated submissions while pending and recovers after failure", async () => {
  let rejectRequest!: (reason: Error) => void;
  vi.mocked(submitSignup).mockImplementation(
    () =>
      new Promise<never>((_, reject) => {
        rejectRequest = reject;
      }),
  );
  renderSignup();
  fillValidForm();
  const form = screen
    .getByRole("button", { name: "Criar conta" })
    .closest("form")!;
  fireEvent.submit(form);
  expect(screen.getByRole("button", { name: "Enviando..." })).toBeDisabled();
  fireEvent.submit(form);
  expect(submitSignup).toHaveBeenCalledTimes(1);
  await act(async () => {
    rejectRequest(new Error("Unavailable"));
  });
  expect(screen.getByRole("button", { name: "Criar conta" })).toBeEnabled();
});

function CachedSignup() {
  const [visible, setVisible] = useState(true);
  return (
    <SignupFlowProvider>
      <button onClick={() => setVisible((current) => !current)}>
        Toggle cached screen
      </button>
      <Activity mode={visible ? "visible" : "hidden"}>
        <SignupPage />
      </Activity>
    </SignupFlowProvider>
  );
}

test("ignores an old signup failure after the cached form is hidden", async () => {
  let rejectRequest!: (reason: Error) => void;
  vi.mocked(submitSignup).mockImplementation(
    () =>
      new Promise<never>((_, reject) => {
        rejectRequest = reject;
      }),
  );
  render(<CachedSignup />);
  fillValidForm();
  fireEvent.click(screen.getByRole("button", { name: "Criar conta" }));
  fireEvent.click(screen.getByRole("button", { name: "Toggle cached screen" }));
  fireEvent.click(screen.getByRole("button", { name: "Toggle cached screen" }));
  await act(async () => {
    rejectRequest(new Error("Unavailable"));
  });
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.getByLabelText("Nome completo")).toHaveValue(
    "  Pessoa Exemplo  ",
  );
  expect(screen.getByLabelText("Senha")).toHaveValue("");
  expect(screen.getByRole("button", { name: "Criar conta" })).toBeEnabled();
});

test("retains the password when other fields fail local validation", () => {
  renderSignup();
  fireEvent.change(screen.getByLabelText("Senha"), {
    target: { value: "Example123" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Criar conta" }));
  expect(screen.getByLabelText("Senha")).toHaveValue("Example123");
  expect(submitSignup).not.toHaveBeenCalled();
});

test("reports the existing duplicate contract without navigating or retaining the password", async () => {
  vi.mocked(submitSignup).mockResolvedValue({
    ok: false,
    error: "already-registered",
  });
  renderSignup();
  fillValidForm();
  fireEvent.click(screen.getByRole("button", { name: "Criar conta" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Este e-mail já está cadastrado. Entre ou recupere sua senha.",
  );
  expect(screen.getByLabelText("Senha")).toHaveValue("");
  expect(
    screen.getByRole("heading", { name: "Criar conta" }),
  ).toBeInTheDocument();
});
