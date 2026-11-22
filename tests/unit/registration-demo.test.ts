import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  isRegistrationDemoEnabled,
  registrationContractStatus,
  submitSignup,
  submitConfirmationCode,
  submitResendConfirmationCode,
} from "@/lib/auth/registration";

const values = {
  fullName: "Pessoa Exemplo",
  email: "person@example.invalid",
  phone: "21999990000",
  password: "Example123",
  acceptedTerms: true,
};

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("NEXT_PUBLIC_APP_ENV", "local");
  vi.stubEnv("NEXT_PUBLIC_REGISTRATION_DEMO", "enabled");
  vi.stubGlobal(
    "fetch",
    vi.fn().mockRejectedValue(new Error("Unavailable backend")),
  );
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function settle<T>(promise: Promise<T>) {
  await vi.advanceTimersByTimeAsync(650);
  return promise;
}

async function register() {
  const result = await settle(submitSignup(values));
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("Expected a demonstration registration.");
  return { registrationId: result.registrationId, email: result.email };
}

test.each(["", "true", "disabled"])(
  "does not activate without the explicit enabled flag: %s",
  async (flag) => {
    vi.stubEnv("NEXT_PUBLIC_REGISTRATION_DEMO", flag);
    expect(isRegistrationDemoEnabled()).toBe(false);
    await expect(submitSignup(values)).resolves.toEqual({
      ok: false,
      error: "network",
    });
  },
);

test.each(["development", "test", "production"] as const)(
  "real application production rejects every simulated operation with NODE_ENV=%s even with the enabled flag",
  async (nodeEnv) => {
    vi.stubEnv("NODE_ENV", nodeEnv);
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "production");
    expect(isRegistrationDemoEnabled()).toBe(false);
    await expect(submitSignup(values)).resolves.toEqual({
      ok: false,
      error: "network",
    });
    await expect(
      submitConfirmationCode({
        registrationId: "demo-registration",
        email: values.email,
        code: "123456",
      }),
    ).resolves.toEqual({ ok: false, error: "network" });
    await expect(
      submitResendConfirmationCode({
        registrationId: "demo-registration",
        email: values.email,
      }),
    ).resolves.toEqual({ ok: false, error: "network" });
  },
);

test("identifies the contract as proposed and simulates loading before accepting a registration", async () => {
  expect(registrationContractStatus).toBe("integrated-ORI-47");
  let settled = false;
  const request = submitSignup(values).then((result) => {
    settled = true;
    return result;
  });
  await vi.advanceTimersByTimeAsync(649);
  expect(settled).toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  expect(await request).toMatchObject({
    ok: true,
    email: values.email,
  });
});

test("supports a simulated signup failure without returning acceptance", async () => {
  vi.stubEnv("NEXT_PUBLIC_REGISTRATION_DEMO_SCENARIO", "signup-failure");
  expect(await settle(submitSignup(values))).toEqual({
    ok: false,
    error: "network",
  });
});

test("correct code completes only a simulated confirmation without session data", async () => {
  const context = await register();
  expect(
    await settle(submitConfirmationCode({ ...context, code: "123456" })),
  ).toEqual({ ok: true });
});

test("rejects wrong codes, blocks on the third failed attempt, and resets after simulated resend", async () => {
  const context = await register();
  for (let attempt = 0; attempt < 2; attempt++)
    expect(
      await settle(submitConfirmationCode({ ...context, code: "000000" })),
    ).toEqual({ ok: false, error: "invalid-code" });
  expect(
    await settle(submitConfirmationCode({ ...context, code: "000000" })),
  ).toEqual({ ok: false, error: "attempt-limit" });
  expect(
    await settle(submitConfirmationCode({ ...context, code: "123456" })),
  ).toEqual({ ok: false, error: "attempt-limit" });
  expect(await settle(submitResendConfirmationCode(context))).toEqual({
    ok: true,
  });
  expect(
    await settle(submitConfirmationCode({ ...context, code: "123456" })),
  ).toEqual({ ok: true });
});

test.each(["expired-code", "confirmation-failure", "attempt-limit"] as const)(
  "supports confirmation scenario %s",
  async (scenario) => {
    const context = await register();
    vi.stubEnv("NEXT_PUBLIC_REGISTRATION_DEMO_SCENARIO", scenario);
    const expected = scenario === "confirmation-failure" ? "network" : scenario;
    expect(
      await settle(submitConfirmationCode({ ...context, code: "123456" })),
    ).toEqual({ ok: false, error: expected });
  },
);

test.each(["resend-failure", "attempt-limit"] as const)(
  "supports resend scenario %s",
  async (scenario) => {
    const context = await register();
    vi.stubEnv("NEXT_PUBLIC_REGISTRATION_DEMO_SCENARIO", scenario);
    expect(await settle(submitResendConfirmationCode(context))).toEqual({
      ok: false,
      error: scenario === "resend-failure" ? "network" : "attempt-limit",
    });
  },
);

test("rejects unknown or mismatched in-memory registration context", async () => {
  const context = await register();
  expect(
    await settle(
      submitConfirmationCode({
        ...context,
        email: "other@example.invalid",
        code: "123456",
      }),
    ),
  ).toEqual({ ok: false, error: "missing-registration" });
  expect(
    await settle(
      submitResendConfirmationCode({ ...context, registrationId: "unknown" }),
    ),
  ).toEqual({ ok: false, error: "missing-registration" });
});

test.each([
  ["local", "development", "development"],
  ["development", "production", "production"],
] as const)(
  "explicit %s application environment supports the full mock flow with NODE_ENV=%s and VERCEL_ENV=%s",
  async (appEnv, nodeEnv, vercelEnv) => {
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", appEnv);
    vi.stubEnv("NODE_ENV", nodeEnv);
    vi.stubEnv("VERCEL_ENV", vercelEnv);
    expect(isRegistrationDemoEnabled()).toBe(true);
    const context = await register();
    expect(await settle(submitResendConfirmationCode(context))).toEqual({
      ok: true,
    });
    expect(
      await settle(submitConfirmationCode({ ...context, code: "123456" })),
    ).toEqual({ ok: true });
  },
);

test.each(["", "preview", "Production", "unknown"])(
  "rejects missing or unsupported application environment %s even with mocks requested",
  async (appEnv) => {
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", appEnv);
    expect(isRegistrationDemoEnabled()).toBe(false);
    await expect(submitSignup(values)).resolves.toEqual({
      ok: false,
      error: "network",
    });
  },
);
