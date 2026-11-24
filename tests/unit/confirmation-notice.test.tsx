import { act, fireEvent, render, screen } from "@testing-library/react";
import { Activity, StrictMode, useState } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ConfirmationNotice } from "@/components/confirmation-notice";
import { PanelPageTitle } from "@/components/panel-page-title";
import { SignupFlowProvider, useSignupFlow } from "@/components/signup-flow";

const message = "E-mail confirmado. Conta criada.";

function Flow({ cached = false }: { cached?: boolean }) {
  const { setConfirmationComplete } = useSignupFlow();
  const [queue, setQueue] = useState(true);
  const [menu, setMenu] = useState(false);
  return (
    <>
      <button onClick={() => setConfirmationComplete(true)}>Confirm</button>
      <button onClick={() => setQueue((value) => !value)}>Navigate</button>
      <button onClick={() => setMenu((value) => !value)}>Menu</button>
      {menu && <p>Menu content</p>}
      {cached ? (
        <Activity mode={queue ? "visible" : "hidden"}>
          <ConfirmationNotice />
          <PanelPageTitle>Fila de ocorrências</PanelPageTitle>
        </Activity>
      ) : (
        queue && (
          <>
            <ConfirmationNotice />
            <PanelPageTitle>Fila de ocorrências</PanelPageTitle>
          </>
        )
      )}
      <p role="alert">Falha de carregamento</p>
    </>
  );
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_APP_ENV", "local");
  vi.stubEnv("NEXT_PUBLIC_REGISTRATION_DEMO", "enabled");
  vi.useFakeTimers();
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

function open() {
  render(
    <SignupFlowProvider>
      <Flow />
    </SignupFlowProvider>,
  );
}
function advance(time: number) {
  act(() => {
    vi.advanceTimersByTime(time);
  });
}
async function confirm() {
  await act(async () => {
    fireEvent.click(screen.getByText("Confirm"));
  });
}

test("announces only after completion and expires at eight visible seconds without moving focus or dismissing errors", async () => {
  open();
  expect(screen.queryByText(message)).not.toBeInTheDocument();
  expect(
    screen.getByRole("heading", { name: "Fila de ocorrências" }),
  ).toHaveFocus();
  await confirm();
  expect(screen.getByRole("status")).toHaveTextContent(message);
  expect(screen.getByRole("status")).not.toHaveFocus();
  screen.getByText("Menu").focus();
  advance(7999);
  expect(screen.getByText(message)).toBeVisible();
  advance(1);
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  expect(screen.queryByText(message)).not.toBeInTheDocument();
  expect(screen.getByText("Menu")).toHaveFocus();
  expect(screen.getByRole("alert")).toHaveTextContent("Falha de carregamento");
});

test("pauses the countdown while the page is hidden", async () => {
  open();
  await confirm();
  advance(3000);
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
  fireEvent(document, new Event("visibilitychange"));
  advance(60000);
  expect(screen.getByText(message)).toBeVisible();
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  fireEvent(document, new Event("visibilitychange"));
  advance(4999);
  expect(screen.getByText(message)).toBeVisible();
  advance(1);
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});

test("does not replay on menu changes or a new queue visit, and permits a new completion", async () => {
  open();
  await confirm();
  advance(4000);
  fireEvent.click(screen.getByText("Menu"));
  advance(4000);
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  fireEvent.click(screen.getByText("Menu"));
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  fireEvent.click(screen.getByText("Navigate"));
  fireEvent.click(screen.getByText("Navigate"));
  expect(screen.queryByText(message)).not.toBeInTheDocument();
  await confirm();
  expect(screen.getByText(message)).toBeVisible();
  fireEvent.click(screen.getByText("Navigate"));
  fireEvent.click(screen.getByText("Navigate"));
  expect(screen.queryByText(message)).not.toBeInTheDocument();
});

test("announces a completed real confirmation in production", async () => {
  vi.stubEnv("NEXT_PUBLIC_APP_ENV", "production");
  open();
  await confirm();
  expect(screen.getByRole("status")).toHaveTextContent(message);
});

test("does not replay a cached queue and gives a new completion its own eight seconds", async () => {
  render(
    <SignupFlowProvider>
      <Flow cached />
    </SignupFlowProvider>,
  );
  await confirm();
  advance(3000);
  await act(async () => {
    fireEvent.click(screen.getByText("Navigate"));
  });
  await act(async () => {
    fireEvent.click(screen.getByText("Navigate"));
  });
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  await confirm();
  advance(7999);
  expect(screen.getByRole("status")).toHaveTextContent(message);
  advance(1);
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});

test("announces once and expires normally under StrictMode", async () => {
  render(
    <StrictMode>
      <SignupFlowProvider>
        <Flow />
      </SignupFlowProvider>
    </StrictMode>,
  );
  await confirm();
  expect(screen.getAllByRole("status")).toHaveLength(1);
  advance(8000);
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});
