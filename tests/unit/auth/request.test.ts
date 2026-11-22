import { afterEach, expect, it, vi } from "vitest";
import { authPost, AuthRequestError } from "@/lib/auth/request";

afterEach(() => vi.unstubAllGlobals());

it("reports a generic service error for a null JSON error response", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("null", { status: 503 })),
  );
  await expect(
    authPost("/api/auth/forgot-password", { email: "person@example.invalid" }),
  ).rejects.toEqual(
    new AuthRequestError(
      "unknown",
      "Serviço temporariamente indisponível. Tente novamente.",
    ),
  );
});
