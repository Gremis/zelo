import { afterEach, expect, test, vi } from "vitest";
import { createPanelMock } from "@/lib/panel/mock";
import { createPanelOperations } from "@/lib/panel/operations";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

test("mock accepts typed identity, returns copies and clears only its own context on logout", async () => {
  vi.useFakeTimers();
  const identity = {
    name: "Pessoa Exemplo",
    initials: "PE",
    condominiumCount: 2,
  };
  const operations = createPanelMock(identity);
  const request = operations.loadUser();
  await vi.runAllTimersAsync();
  const result = await request;
  expect(result).toEqual({ ok: true, data: identity });
  if (result.ok) result.data.name = "Modified";
  const second = operations.loadUser();
  await vi.runAllTimersAsync();
  expect(await second).toEqual({ ok: true, data: identity });
  const logout = operations.logout();
  await vi.runAllTimersAsync();
  expect(await logout).toEqual({ ok: true, data: null });
  const after = operations.loadUser();
  await vi.runAllTimersAsync();
  expect(await after).toEqual({ ok: false, error: "network" });
  const fresh = createPanelMock(identity).loadUser();
  await vi.runAllTimersAsync();
  expect(await fresh).toEqual({ ok: true, data: identity });
});

test.each(["load", "logout"] as const)(
  "mock exposes %s failures",
  async (failure) => {
    vi.useFakeTimers();
    const operations = createPanelMock(undefined, failure);
    const request =
      failure === "load" ? operations.loadUser() : operations.logout();
    await vi.runAllTimersAsync();
    expect(await request).toEqual({ ok: false, error: "network" });
  },
);

test.each(["production", "preview", ""])(
  "never enables a panel mock in %s",
  async (environment) => {
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", environment);
    vi.stubEnv("NEXT_PUBLIC_FIRST_STEPS_MOCK", "enabled");
    const operations = createPanelOperations();
    expect(await operations.loadUser()).toEqual({
      ok: false,
      error: "unavailable",
    });
    expect(await operations.logout()).toEqual({
      ok: false,
      error: "unavailable",
    });
  },
);
