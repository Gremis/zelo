import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import manifest from "@/app/manifest";
import { PwaRuntime } from "@/components/pwa-runtime";

let online = true;
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test("uses the existing login entry with standalone metadata and separate maskable icons", () => {
  expect(manifest()).toMatchObject({
    name: "Sindicondo",
    lang: "pt-BR",
    start_url: "/login",
    scope: "/",
    display: "standalone",
    theme_color: "#0f766e",
  });
  expect(manifest().icons).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ sizes: "192x192", purpose: "any" }),
      expect.objectContaining({ sizes: "512x512", purpose: "maskable" }),
    ]),
  );
});

test("blocks offline submissions without invoking the existing form handler or moving focus", () => {
  online = true;
  vi.spyOn(navigator, "onLine", "get").mockImplementation(() => online);
  const submit = vi.fn((event) => event.preventDefault());
  render(
    <PwaRuntime>
      <form onSubmit={submit}>
        <button type="submit">Enviar</button>
      </form>
    </PwaRuntime>,
  );
  const button = screen.getByRole("button", { name: "Enviar" });
  button.focus();
  act(() => {
    online = false;
    window.dispatchEvent(new Event("offline"));
  });
  expect(screen.getByRole("status")).toHaveTextContent("sem conexão");
  fireEvent.click(button);
  expect(submit).not.toHaveBeenCalled();
  expect(button).toHaveFocus();
  act(() => {
    online = true;
    window.dispatchEvent(new Event("online"));
  });
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  expect(submit).not.toHaveBeenCalled();
  fireEvent.click(button);
  expect(submit).toHaveBeenCalledOnce();
});

test("registers a worker only in secure production contexts and checks updates when visible", async () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubGlobal("isSecureContext", true);
  const update = vi.fn().mockResolvedValue(undefined);
  const register = vi.fn().mockResolvedValue({ update });
  vi.stubGlobal("navigator", { onLine: true, serviceWorker: { register } });
  render(
    <PwaRuntime>
      <p>Conteúdo existente</p>
    </PwaRuntime>,
  );
  await act(async () => {});
  expect(register).toHaveBeenCalledWith("/sw.js", {
    scope: "/",
    updateViaCache: "none",
  });
  fireEvent(document, new Event("visibilitychange"));
  expect(update).toHaveBeenCalledOnce();
});

test.each([
  ["development", true],
  ["production", false],
] as const)(
  "does not register a worker in %s with secure context %s",
  (nodeEnv, secure) => {
    vi.stubEnv("NODE_ENV", nodeEnv);
    vi.stubGlobal("isSecureContext", secure);
    const register = vi.fn();
    vi.stubGlobal("navigator", { onLine: true, serviceWorker: { register } });
    render(
      <PwaRuntime>
        <p>Conteúdo existente</p>
      </PwaRuntime>,
    );
    expect(register).not.toHaveBeenCalled();
    expect(screen.getByText("Conteúdo existente")).toBeInTheDocument();
  },
);
