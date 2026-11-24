import { afterEach, expect, test, vi } from "vitest";
import { submitSignup } from "@/lib/auth/signup";
import {
  submitConfirmationCode,
  submitResendConfirmationCode,
} from "@/lib/auth/submit";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

test("real failures never fall back to mock success", async () => {
  vi.stubEnv("NEXT_PUBLIC_APP_ENV", "production");
  vi.stubEnv("NEXT_PUBLIC_REGISTRATION_DEMO", "enabled");
  const fetch = vi.fn().mockRejectedValue(new Error("Unavailable"));
  vi.stubGlobal("fetch", fetch);
  expect(
    await submitSignup({
      fullName: "Pessoa Exemplo",
      email: "person@example.invalid",
      phone: "21999990000",
      password: "Example123",
      acceptedTerms: true,
    }),
  ).toEqual({ ok: false, error: "network" });
  expect(
    await submitConfirmationCode({
      registrationId: "",
      email: "",
      code: "123456",
    }),
  ).toEqual({ ok: false, error: "network" });
  expect(
    await submitResendConfirmationCode({ registrationId: "", email: "" }),
  ).toEqual({ ok: false, error: "network" });
  expect(fetch.mock.calls.map(([url]) => url)).toEqual([
    "/api/auth/signup",
    "/api/auth/confirm-signup",
    "/api/auth/resend-signup",
  ]);
});

test("maps the existing duplicate API error without accepting the registration", async () => {
  vi.stubEnv("NEXT_PUBLIC_APP_ENV", "production");
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({
        code: "email_already_registered",
        error: "Este e-mail já está cadastrado.",
      }),
    }),
  );
  expect(
    await submitSignup({
      fullName: "Pessoa Exemplo",
      email: "person@example.invalid",
      phone: "21999990000",
      password: "Example123",
      acceptedTerms: true,
    }),
  ).toEqual({ ok: false, error: "already-registered" });
});
