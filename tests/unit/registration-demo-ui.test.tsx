import { act, fireEvent, render, screen } from "@testing-library/react";
import { Activity, useEffect, useState } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import SignupPage from "@/app/criar-conta/page";
import ConfirmationCodePage from "@/app/confirmar-codigo/page";
import { SignupFlowProvider } from "@/components/signup-flow";

const navigation = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: navigation.push }),
}));

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("NEXT_PUBLIC_APP_ENV", "local");
  vi.stubEnv("NEXT_PUBLIC_REGISTRATION_DEMO", "enabled");
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  navigation.push.mockReset();
});

function ReviewFlow() {
  const [route, setRoute] = useState("/criar-conta");
  useEffect(() => {
    navigation.push.mockImplementation(setRoute);
  }, []);
  return (
    <div
      onClickCapture={(event) => {
        const link = (event.target as HTMLElement).closest("a");
        if (link?.getAttribute("href") === "/criar-conta") {
          event.preventDefault();
          setRoute("/criar-conta");
        }
      }}
    >
      <Activity mode={route === "/criar-conta" ? "visible" : "hidden"}>
        <SignupPage />
      </Activity>
      <Activity mode={route === "/confirmar-codigo" ? "visible" : "hidden"}>
        <ConfirmationCodePage />
      </Activity>
    </div>
  );
}

function openFlow() {
  render(
    <SignupFlowProvider>
      <ReviewFlow />
    </SignupFlowProvider>,
  );
}
function fillSignup() {
  fireEvent.change(screen.getByLabelText("Nome completo"), {
    target: { value: "Pessoa Exemplo" },
  });
  fireEvent.change(screen.getByLabelText("E-mail"), {
    target: { value: "pessoa@example.invalid" },
  });
  fireEvent.change(screen.getByLabelText("Celular"), {
    target: { value: "21999990000" },
  });
  fireEvent.change(screen.getByLabelText("Senha"), {
    target: { value: "Example123" },
  });
  fireEvent.click(screen.getByRole("checkbox"));
}
async function finishOperation() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(650);
  });
}
async function register() {
  fillSignup();
  if (!(screen.getByRole("checkbox") as HTMLInputElement).checked)
    fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "Criar conta" }));
  await finishOperation();
}
function choose(value: string) {
  vi.stubEnv("NEXT_PUBLIC_REGISTRATION_DEMO_SCENARIO", value);
}
async function confirm(code: string) {
  fireEvent.change(screen.getByLabelText("Código"), {
    target: { value: code },
  });
  fireEvent.click(screen.getByRole("button", { name: "Confirmar e entrar" }));
  await finishOperation();
}

test("reviews signup, correction and simulated success without a real session or queue", async () => {
  openFlow();
  expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  fillSignup();
  if (!(screen.getByRole("checkbox") as HTMLInputElement).checked)
    fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "Criar conta" }));
  expect(screen.getByRole("button", { name: "Enviando..." })).toBeDisabled();
  expect(screen.getByLabelText("Senha")).toHaveValue("");
  expect(navigation.push).not.toHaveBeenCalled();
  fireEvent.submit(screen.getByLabelText("Nome completo").closest("form")!);
  await finishOperation();
  expect(navigation.push).toHaveBeenCalledTimes(1);
  expect(
    screen.getByRole("heading", { name: "Confirme seu e-mail" }),
  ).toBeInTheDocument();
  expect(screen.getByText("pessoa@example.invalid")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("link", { name: "Corrigir e-mail" }));
  expect(screen.getByLabelText("Nome completo")).toHaveValue("Pessoa Exemplo");
  expect(screen.getByLabelText("Celular")).toHaveValue("(21) 99999-0000");
  expect(screen.getByLabelText("Senha")).toHaveValue("");
  expect(screen.getByRole("checkbox")).not.toBeChecked();
  fireEvent.change(screen.getByLabelText("E-mail"), {
    target: { value: "corrigido@example.invalid" },
  });
  fireEvent.change(screen.getByLabelText("Senha"), {
    target: { value: "Example123" },
  });
  if (!(screen.getByRole("checkbox") as HTMLInputElement).checked)
    fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "Criar conta" }));
  await finishOperation();
  expect(screen.getByText("corrigido@example.invalid")).toBeInTheDocument();
  await confirm("123456");
  expect(
    screen.getByRole("heading", { level: 1, name: "Conta criada." }),
  ).toHaveFocus();
  expect(navigation.push).toHaveBeenCalledTimes(2);
  expect(navigation.push).toHaveBeenLastCalledWith("/confirmar-codigo");
  expect(screen.queryByRole("link", { name: /fila/i })).not.toBeInTheDocument();
});

test("reviews wrong and expired codes, the simulated attempt limit and resend recovery", async () => {
  openFlow();
  await register();
  await confirm("000000");
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Código incorreto ou expirado",
  );
  choose("expired-code");
  await confirm("123456");
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Código incorreto ou expirado",
  );
  choose("standard");
  await confirm("000000");
  await confirm("000000");
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Limite de tentativas atingido",
  );
  expect(screen.getByLabelText("Código")).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Reenviar código" }));
  expect(screen.getByRole("button", { name: "Reenviando..." })).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "Confirmar e entrar" }),
  ).toBeDisabled();
  await finishOperation();
  expect(screen.getByRole("status")).toHaveTextContent("Código reenviado");
  expect(screen.getByLabelText("Código")).toBeEnabled();
  await confirm("123456");
  expect(
    screen.getByRole("heading", { level: 1, name: "Conta criada." }),
  ).toBeInTheDocument();
});

test("reviews signup, confirmation and resend failures without simulated success fallback", async () => {
  openFlow();
  choose("signup-failure");
  await register();
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Não foi possível criar sua conta",
  );
  expect(navigation.push).not.toHaveBeenCalled();
  choose("standard");
  fireEvent.change(screen.getByLabelText("Senha"), {
    target: { value: "Example123" },
  });
  if (!(screen.getByRole("checkbox") as HTMLInputElement).checked)
    fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "Criar conta" }));
  await finishOperation();
  choose("confirmation-failure");
  await confirm("123456");
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Não foi possível confirmar o código",
  );
  expect(screen.getByLabelText("Código")).toHaveValue("123456");
  choose("resend-failure");
  fireEvent.click(screen.getByRole("button", { name: "Reenviar código" }));
  await finishOperation();
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Não foi possível reenviar o código",
  );
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  choose("attempt-limit");
  fireEvent.click(screen.getByRole("button", { name: "Reenviar código" }));
  await finishOperation();
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Limite de reenvios atingido",
  );
});
