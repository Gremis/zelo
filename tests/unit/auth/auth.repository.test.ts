import { createClient, type User } from "@supabase/supabase-js";
import { expect, it, vi } from "vitest";
import { createAuthRepository } from "@/server/auth/auth.repository";

function setup() {
  const client = createClient("http://127.0.0.1:54321", "test-public-key", {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const user: User = {
    id: "user",
    email: "person@example.invalid",
    email_confirmed_at: "2026-11-19T00:00:00Z",
    app_metadata: {},
    user_metadata: {},
    aud: "authenticated",
    created_at: "2026-11-19T00:00:00Z",
  };
  return { client, user, repository: createAuthRepository(client) };
}

it("forwards the phone as metadata without creating an authenticated signup session", async () => {
  const { client, user, repository } = setup();
  const signup = vi
    .spyOn(client.auth, "signUp")
    .mockResolvedValue({ data: { user, session: null }, error: null });
  const input = {
    fullName: "Pessoa Exemplo",
    email: user.email!,
    phone: "21999990000",
    password: "Example123",
    acceptedTerms: true,
  };
  await repository.signUp(input);
  expect(signup).toHaveBeenCalledWith({
    email: input.email,
    password: input.password,
    options: {
      data: { full_name: input.fullName, phone: input.phone, is_sindico: true },
    },
  });
});

it("verifies signup rather than recovery and rejects success without a session", async () => {
  const { client, user, repository } = setup();
  const verify = vi
    .spyOn(client.auth, "verifyOtp")
    .mockResolvedValue({ data: { user, session: null }, error: null });
  expect(
    await repository.confirmSignup({ email: user.email!, code: "123456" }),
  ).toEqual({ status: "error", reason: "unknown" });
  expect(verify).toHaveBeenCalledWith({
    email: user.email,
    token: "123456",
    type: "signup",
  });
});

it("requires the server-validated email confirmation instead of profile metadata", async () => {
  const { client, user, repository } = setup();
  const getUser = vi.spyOn(client.auth, "getUser").mockResolvedValue({
    data: {
      user: {
        ...user,
        email_confirmed_at: undefined,
        user_metadata: { email_verified: true, is_sindico: true },
      },
    },
    error: null,
  });
  expect(await repository.getConfirmedUser()).toBeNull();
  getUser.mockResolvedValue({ data: { user }, error: null });
  expect(await repository.getConfirmedUser()).toEqual({
    id: user.id,
    email: user.email,
  });
});

it("uses signup resend without calling recovery or passwordless signup", async () => {
  const { client, user, repository } = setup();
  const resend = vi
    .spyOn(client.auth, "resend")
    .mockResolvedValue({ data: { user: null, session: null }, error: null });
  expect(await repository.resendSignup(user.email!)).toEqual({ status: "ok" });
  expect(resend).toHaveBeenCalledWith({ type: "signup", email: user.email });
});

it("uses the recovery purpose and rejects a missing provider session", async () => {
  const { client, user, repository } = setup();
  const verify = vi
    .spyOn(client.auth, "verifyOtp")
    .mockResolvedValue({ data: { user, session: null }, error: null });
  expect(
    await repository.verifyRecoveryCode({ email: user.email!, code: "123456" }),
  ).toEqual({ status: "error", reason: "unknown" });
  expect(verify).toHaveBeenCalledWith({
    email: user.email,
    token: "123456",
    type: "recovery",
  });
});

it("rejects recovery when the validated identity belongs to another email", async () => {
  const { client, user, repository } = setup();
  const session = {
    access_token: "synthetic",
    refresh_token: "synthetic",
    expires_in: 3600,
    token_type: "bearer" as const,
    user,
  };
  vi.spyOn(client.auth, "verifyOtp").mockResolvedValue({
    data: { user, session },
    error: null,
  });
  vi.spyOn(client.auth, "getUser").mockResolvedValue({
    data: { user: { ...user, email: "other@example.invalid" } },
    error: null,
  });
  expect(
    await repository.verifyRecoveryCode({ email: user.email!, code: "123456" }),
  ).toEqual({ status: "error", reason: "unknown" });
});
