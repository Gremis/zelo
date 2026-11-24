import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { SignupFlowProvider, useSignupFlow } from "@/components/signup-flow";
import { FirstSteps, SignupFirstSteps } from "@/components/first-steps";
import { createFirstStepsMock } from "@/lib/first-steps/mock";
import {
  createFirstStepsOperations,
  isFirstStepsMockEnabled,
} from "@/lib/first-steps/operations";
import type { FirstStepsOperations } from "@/lib/first-steps/contract";

afterEach(() => vi.unstubAllEnvs());

function service(): FirstStepsOperations {
  return {
    load: vi.fn().mockResolvedValue({
      ok: true,
      data: { completed: ["condominium"], dismissed: false },
    }),
    dismiss: vi.fn().mockResolvedValue({
      ok: true,
      data: { completed: ["condominium"], dismissed: true },
    }),
  };
}

test("loads observed progress and never completes steps through a click", async () => {
  render(<FirstSteps operations={service()} />);
  expect(screen.getByRole("status")).toHaveTextContent("Carregando");
  expect(
    await screen.findByText("— Concluído", { exact: false }),
  ).toBeInTheDocument();
  expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  expect(
    screen.getByText("Cadastre seu primeiro condomínio").closest("li"),
  ).toHaveClass("line-through");
  for (const name of [
    "Cadastre zelador e porteiro de cada prédio",
    "Copie o link do formulário e envie aos moradores",
  ]) {
    expect(screen.getByRole("button", { name })).toBeDisabled();
  }
  expect(
    screen.getByRole("link", { name: "Cadastre seu primeiro condomínio" }),
  ).toHaveAttribute("href", "/condominios?novo=1");
});

test("retries loading after a rejected request", async () => {
  const operations = service();
  vi.mocked(operations.load).mockRejectedValueOnce(new Error("offline"));
  render(<FirstSteps operations={operations} />);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Não foi possível carregar",
  );
  fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
  expect(
    await screen.findByText("— Concluído", { exact: false }),
  ).toBeInTheDocument();
});

test("retains the panel on dismissal failure and allows retry", async () => {
  const operations = service();
  vi.mocked(operations.dismiss).mockResolvedValueOnce({
    ok: false,
    error: "network",
  });
  render(<FirstSteps operations={operations} />);
  fireEvent.click(await screen.findByRole("button", { name: "Dispensar" }));
  expect(screen.getByRole("button", { name: "Dispensando…" })).toBeDisabled();
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Não foi possível dispensar",
  );
  fireEvent.click(screen.getByRole("button", { name: "Dispensar" }));
  await waitFor(() =>
    expect(
      screen.queryByRole("heading", { name: "Primeiros passos" }),
    ).not.toBeInTheDocument(),
  );
  expect(screen.getByRole("status")).toHaveTextContent("dispensado");
});

test("mock dismissal belongs only to its instance and does not persist per account", async () => {
  const first = createFirstStepsMock();
  await first.dismiss();
  expect(await first.load()).toEqual({
    ok: true,
    data: { completed: [], dismissed: true },
  });
  expect(await createFirstStepsMock().load()).toEqual({
    ok: true,
    data: { completed: [], dismissed: false },
  });
});

test.each(["production", "preview", "", "local", "development"])(
  "requires explicit activation in a permitted environment: %s",
  async (environment) => {
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", environment);
    vi.stubEnv("NEXT_PUBLIC_FIRST_STEPS_MOCK", "enabled");
    expect(isFirstStepsMockEnabled()).toBe(
      ["local", "development"].includes(environment),
    );
    vi.stubEnv("NEXT_PUBLIC_FIRST_STEPS_MOCK", "");
    expect(isFirstStepsMockEnabled()).toBe(false);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 401 })),
    );
    expect(await createFirstStepsOperations().load()).toEqual({
      ok: false,
      error: "unavailable",
    });
  },
);

function FirstStepsFlow({ operations }: { operations: FirstStepsOperations }) {
  const { setShowFirstSteps } = useSignupFlow();
  return (
    <>
      <button onClick={() => setShowFirstSteps(true)}>Complete signup</button>
      <button onClick={() => setShowFirstSteps(false)}>
        Enter through login
      </button>
      <SignupFirstSteps operations={operations} />
    </>
  );
}

test("shows first steps only after signup and removes them for the login entry", async () => {
  const operations = service();
  render(
    <SignupFlowProvider>
      <FirstStepsFlow operations={operations} />
    </SignupFlowProvider>,
  );
  expect(
    screen.queryByRole("heading", { name: "Primeiros passos" }),
  ).not.toBeInTheDocument();
  expect(operations.load).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText("Complete signup"));
  expect(
    await screen.findByRole("button", { name: "Dispensar" }),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByText("Enter through login"));
  expect(
    screen.queryByRole("heading", { name: "Primeiros passos" }),
  ).not.toBeInTheDocument();
});
