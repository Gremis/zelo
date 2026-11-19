import { act, fireEvent, render, screen } from "@testing-library/react";
import { Activity, useEffect, useState } from "react";
import { beforeEach, expect, test, vi } from "vitest";
import ConfirmationCodePage from "@/app/confirmar-codigo/page";
import SignupPage from "@/app/criar-conta/page";
import { SignupFlowProvider, useSignupFlow } from "@/components/signup-flow";
import {
  submitConfirmationCode,
  submitResendConfirmationCode,
} from "@/lib/auth/submit";

vi.mock("@/lib/auth/submit", () => ({
  submitConfirmationCode: vi.fn(async () => {
    throw new Error("Unavailable");
  }),
  submitResendConfirmationCode: vi.fn(async () => {
    throw new Error("Unavailable");
  }),
}));

beforeEach(() => {
  vi.mocked(submitConfirmationCode).mockReset();
  vi.mocked(submitConfirmationCode).mockRejectedValue(new Error("Unavailable"));
  vi.mocked(submitResendConfirmationCode).mockReset();
  vi.mocked(submitResendConfirmationCode).mockRejectedValue(
    new Error("Unavailable"),
  );
});

function TestFlow() {
  const { setDraft } = useSignupFlow();
  const [page, setPage] = useState("confirmation");
  useEffect(() => {
    setDraft({
      fullName: "Pessoa Exemplo",
      email: "pessoa@example.invalid",
      phone: "31999990000",
    });
  }, [setDraft]);
  return (
    <>
      <button
        onClick={() =>
          setPage(page === "confirmation" ? "signup" : "confirmation")
        }
      >
        Change test screen
      </button>
      <Activity mode={page === "confirmation" ? "visible" : "hidden"}>
        <ConfirmationCodePage />
      </Activity>
      <Activity mode={page === "signup" ? "visible" : "hidden"}>
        <SignupPage />
      </Activity>
    </>
  );
}

function renderConfirmation() {
  render(
    <SignupFlowProvider>
      <TestFlow />
    </SignupFlowProvider>,
  );
}

function submitCode() {
  fireEvent.change(screen.getByLabelText("Código"), {
    target: { value: "123456" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Confirmar e entrar" }));
}

test("handles direct access and missing context without enabling confirmation", () => {
  render(
    <SignupFlowProvider>
      <ConfirmationCodePage />
    </SignupFlowProvider>,
  );
  expect(screen.getByRole("status")).toHaveTextContent(
    "Não encontramos os dados",
  );
  expect(screen.getByLabelText("Código")).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "Confirmar e entrar" }),
  ).toBeDisabled();
  expect(screen.getByRole("link", { name: "Criar conta" })).toHaveAttribute(
    "href",
    "/criar-conta",
  );
});

test("shows the email in memory, filters code input and focuses linked validation", () => {
  renderConfirmation();
  expect(screen.getByText("pessoa@example.invalid")).toBeInTheDocument();
  expect(
    screen.getByText(
      "Não chegou? Confira a caixa de spam. A conta só é liberada depois da confirmação.",
    ),
  ).toBeInTheDocument();
  const code = screen.getByLabelText("Código");
  expect(code).toHaveAttribute("inputmode", "numeric");
  expect(code).toHaveAttribute("autocomplete", "one-time-code");
  fireEvent.change(code, { target: { value: "12ab3" } });
  expect(code).toHaveValue("123");
  fireEvent.click(screen.getByRole("button", { name: "Confirmar e entrar" }));
  expect(code).toHaveFocus();
  expect(code).toHaveAccessibleDescription("Digite o código de 6 dígitos.");
  expect(submitConfirmationCode).not.toHaveBeenCalled();
  fireEvent.change(code, { target: { value: "12ab34-567" } });
  expect(code).toHaveValue("123456");
});

test.each(["invalid-code", "expired-code"] as const)(
  "shows the agreed message for %s without announcing success",
  async (error) => {
    vi.mocked(submitConfirmationCode).mockResolvedValue({ ok: false, error });
    renderConfirmation();
    submitCode();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Código incorreto ou expirado. Confira ou peça um novo.",
    );
    expect(screen.getByLabelText("Código")).toHaveValue("");
  },
);

test("reports unavailable confirmation and does not navigate", async () => {
  renderConfirmation();
  submitCode();
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "confirmação de e-mail está temporariamente indisponível",
  );
  expect(
    screen.getByRole("heading", { name: "Confirme seu e-mail" }),
  ).toBeInTheDocument();
});

test("does not redirect a confirmation without a valid session outside mock mode", async () => {
  vi.mocked(submitConfirmationCode).mockResolvedValue({ ok: true });
  renderConfirmation();
  submitCode();
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Não foi possível iniciar sua sessão",
  );
  expect(
    screen.queryByRole("heading", { name: "Conta criada." }),
  ).not.toBeInTheDocument();
});

test("locks confirmation and resend during a pending request", async () => {
  let rejectRequest!: (reason: Error) => void;
  vi.mocked(submitConfirmationCode).mockImplementation(
    () =>
      new Promise((_, reject) => {
        rejectRequest = reject;
      }),
  );
  renderConfirmation();
  submitCode();
  expect(screen.getByRole("button", { name: "Confirmando..." })).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "Reenviar código" }),
  ).toBeDisabled();
  fireEvent.submit(screen.getByLabelText("Código").closest("form")!);
  expect(submitConfirmationCode).toHaveBeenCalledTimes(1);
  await act(async () => {
    rejectRequest(new Error("Unavailable"));
  });
  expect(
    screen.getByRole("button", { name: "Confirmar e entrar" }),
  ).toBeEnabled();
});

test("reports resend failure without an invented countdown or success", async () => {
  renderConfirmation();
  fireEvent.click(screen.getByRole("button", { name: "Reenviar código" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Não foi possível reenviar o código",
  );
  expect(submitResendConfirmationCode).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("button", { name: "Reenviar código" })).toBeEnabled();
  expect(screen.queryByText(/30s|15 minutos/)).not.toBeInTheDocument();
});

test("preserves only non-secret draft fields between screens and loses them on reload", () => {
  const view = render(
    <SignupFlowProvider>
      <TestFlow />
    </SignupFlowProvider>,
  );
  expect(screen.getByRole("link", { name: "Corrigir e-mail" })).toHaveAttribute(
    "href",
    "/criar-conta",
  );
  fireEvent.click(screen.getByRole("button", { name: "Change test screen" }));
  expect(screen.getByLabelText("Nome completo")).toHaveValue("Pessoa Exemplo");
  expect(screen.getByLabelText("E-mail")).toHaveValue("pessoa@example.invalid");
  expect(screen.getByLabelText("Celular")).toHaveValue("(31) 99999-0000");
  expect(screen.getByLabelText("Senha")).toHaveValue("");
  expect(screen.getByRole("checkbox")).not.toBeChecked();
  fireEvent.change(screen.getByLabelText("Senha"), {
    target: { value: "Example123" },
  });
  fireEvent.change(screen.getByLabelText("E-mail"), {
    target: { value: "corrected@example.invalid" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Change test screen" }));
  expect(screen.getByText("corrected@example.invalid")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Change test screen" }));
  expect(screen.getByLabelText("E-mail")).toHaveValue(
    "corrected@example.invalid",
  );
  expect(screen.getByLabelText("Senha")).toHaveValue("");
  view.unmount();
  render(
    <SignupFlowProvider>
      <ConfirmationCodePage />
    </SignupFlowProvider>,
  );
  expect(screen.getByRole("status")).toHaveTextContent(
    "Não encontramos os dados",
  );
});

test("clears a code when its cached screen is hidden and shown again", () => {
  renderConfirmation();
  fireEvent.change(screen.getByLabelText("Código"), {
    target: { value: "123456" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Change test screen" }));
  fireEvent.click(screen.getByRole("button", { name: "Change test screen" }));
  expect(screen.getByLabelText("Código")).toHaveValue("");
});

test("prevents duplicate resend and confirmation while resend is pending", async () => {
  let rejectRequest!: (reason: Error) => void;
  vi.mocked(submitResendConfirmationCode).mockImplementation(
    () =>
      new Promise<never>((_, reject) => {
        rejectRequest = reject;
      }),
  );
  renderConfirmation();
  fireEvent.click(screen.getByRole("button", { name: "Reenviar código" }));
  const button = screen.getByRole("button", { name: "Reenviando..." });
  expect(button).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "Confirmar e entrar" }),
  ).toBeDisabled();
  fireEvent.click(button);
  expect(submitResendConfirmationCode).toHaveBeenCalledTimes(1);
  await act(async () => {
    rejectRequest(new Error("Unavailable"));
  });
  expect(screen.getByRole("button", { name: "Reenviar código" })).toBeEnabled();
});

test.each(["confirmation", "resend"])(
  "retains the code for retry after a temporary %s failure",
  async (operation) => {
    renderConfirmation();
    fireEvent.change(screen.getByLabelText("Código"), {
      target: { value: "123456" },
    });
    fireEvent.click(
      screen.getByRole("button", {
        name:
          operation === "confirmation"
            ? "Confirmar e entrar"
            : "Reenviar código",
      }),
    );
    await screen.findByRole("alert");
    expect(screen.getByLabelText("Código")).toHaveValue("123456");
  },
);

test("ignores a pending confirmation result after navigating to correct the email", async () => {
  let finishRequest!: (result: { ok: false; error: "invalid-code" }) => void;
  vi.mocked(submitConfirmationCode).mockImplementation(
    () =>
      new Promise((resolve) => {
        finishRequest = resolve;
      }),
  );
  renderConfirmation();
  submitCode();
  fireEvent.click(screen.getByRole("button", { name: "Change test screen" }));
  fireEvent.change(screen.getByLabelText("E-mail"), {
    target: { value: "corrected@example.invalid" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Change test screen" }));
  await act(async () => {
    finishRequest({ ok: false, error: "invalid-code" });
  });
  expect(screen.getByText("corrected@example.invalid")).toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.getByLabelText("Código")).toHaveValue("");
  expect(
    screen.getByRole("button", { name: "Confirmar e entrar" }),
  ).toBeEnabled();
});
