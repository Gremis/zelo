import { describe, expect, it, vi } from "vitest";
import { createAuthService } from "@/server/auth/auth.service";
import type { AuthRepository } from "@/server/auth/auth.repository";
import type { ConfirmationGuard } from "@/server/auth/confirmation-guard";

const input = {
  email: "person@example.invalid",
  registrationId: "11111111-1111-4111-8111-111111111111",
  code: "123456",
};
function setup() {
  const repository: AuthRepository = {
    signUp: vi.fn().mockResolvedValue({
      status: "created",
      user: { id: "user", email: input.email },
    }),
    confirmSignup: vi.fn().mockResolvedValue({ status: "ok" }),
    resendSignup: vi.fn().mockResolvedValue({ status: "ok" }),
    getConfirmedUser: vi.fn().mockResolvedValue(null),
    signIn: vi
      .fn()
      .mockResolvedValue({ status: "error", reason: "invalid_credentials" }),
    signOut: vi.fn().mockResolvedValue({ status: "ok" }),
    sendRecoveryEmail: vi.fn().mockResolvedValue({ status: "ok" }),
    verifyRecoveryCode: vi.fn().mockResolvedValue({ status: "ok" }),
    updatePassword: vi.fn().mockResolvedValue({ status: "ok" }),
  };
  const guard = vi.fn<ConfirmationGuard>().mockResolvedValue({
    status: "ok",
    id: input.registrationId,
    lease: "lease",
  });
  return { repository, guard, service: createAuthService(repository, guard) };
}

describe("signup confirmation service", () => {
  it.each(["blocked", "expired", "missing", "rate_limited"] as const)(
    "never calls the provider when guard returns %s",
    async (status) => {
      const { repository, guard, service } = setup();
      guard.mockResolvedValue({ status });
      expect((await service.confirmSignup(input)).ok).toBe(false);
      expect(repository.confirmSignup).not.toHaveBeenCalled();
      expect(repository.verifyRecoveryCode).not.toHaveBeenCalled();
    },
  );

  it("validates six numeric digits before reserving an attempt", async () => {
    const { guard, service } = setup();
    expect((await service.confirmSignup({ ...input, code: "abcdef" })).ok).toBe(
      false,
    );
    expect(guard).not.toHaveBeenCalled();
  });

  it("settles incorrect codes durably and maps the fifth error to blocked", async () => {
    const { repository, guard, service } = setup();
    vi.mocked(repository.confirmSignup).mockResolvedValue({
      status: "error",
      reason: "invalid_code",
    });
    guard
      .mockResolvedValueOnce({ status: "ok", lease: "lease" })
      .mockResolvedValueOnce({ status: "blocked" });
    expect(await service.confirmSignup(input)).toMatchObject({
      ok: false,
      error: { code: "confirmation_blocked" },
    });
    expect(guard).toHaveBeenLastCalledWith({
      operation: "settle",
      email: input.email,
      registrationId: input.registrationId,
      lease: "lease",
      outcome: "invalid",
    });
  });

  it("does not count transport failures as incorrect codes", async () => {
    const { repository, guard, service } = setup();
    vi.mocked(repository.confirmSignup).mockRejectedValue(
      new Error("Unavailable"),
    );
    await expect(service.confirmSignup(input)).rejects.toThrow();
    expect(guard).toHaveBeenLastCalledWith(
      expect.objectContaining({ operation: "settle", outcome: "error" }),
    );
  });

  it("removes the session when finalization fails after provider confirmation", async () => {
    const { repository, guard, service } = setup();
    guard
      .mockResolvedValueOnce({ status: "ok", lease: "lease" })
      .mockRejectedValueOnce(new Error("Unavailable"));
    await expect(service.confirmSignup(input)).rejects.toThrow(
      "Unable to finalize confirmation",
    );
    expect(repository.signOut).toHaveBeenCalledOnce();
  });

  it("never authorizes a missing or unconfirmed server identity", async () => {
    const { service } = setup();
    expect(await service.confirmedIdentity()).toMatchObject({
      ok: false,
      error: { code: "unauthorized" },
    });
  });

  it("resends using the signup operation without invoking password recovery", async () => {
    const { repository, service } = setup();
    expect(await service.resendSignup(input)).toEqual({
      ok: true,
      data: { success: true },
    });
    expect(repository.resendSignup).toHaveBeenCalledWith(input.email);
    expect(repository.sendRecoveryEmail).not.toHaveBeenCalled();
  });
});
