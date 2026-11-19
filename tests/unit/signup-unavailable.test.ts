import { expect, test } from "vitest";
import { submitSignup } from "@/lib/auth/signup";
import {
  submitConfirmationCode,
  submitResendConfirmationCode,
} from "@/lib/auth/submit";

test("unintegrated operations reject instead of returning simulated success", async () => {
  await expect(
    submitSignup({
      fullName: "Pessoa Exemplo",
      email: "person@example.invalid",
      phone: "31999990000",
      password: "",
      acceptedTerms: true,
    }),
  ).rejects.toThrow("Signup integration is not available.");
  await expect(
    submitConfirmationCode({ registrationId: "", email: "", code: "" }),
  ).rejects.toThrow("Email confirmation integration is not available.");
  await expect(
    submitResendConfirmationCode({ registrationId: "", email: "" }),
  ).rejects.toThrow("Confirmation resend integration is not available.");
});
