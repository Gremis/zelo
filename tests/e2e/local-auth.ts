import { randomUUID } from "node:crypto";
import { test as base, expect } from "@playwright/test";

export const test = base.extend<{ localAccount: void }>({
  localAccount: [
    async ({ page }, provideFixture) => {
      test.skip(
        process.env.ORI47_LOCAL_AUTH_TESTS !== "enabled",
        "Local Supabase account required.",
      );
      if (process.env.NEXT_PUBLIC_SUPABASE_URL !== "http://127.0.0.1:54321")
        throw new Error("Only the local Supabase stack is permitted.");
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!key) throw new Error("Local test credential unavailable.");
      const email = `ori47-panel-${randomUUID()}@example.invalid`;
      const password = `Local${randomUUID()}9`;
      const headers = {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      };
      const response = await fetch(
        "http://127.0.0.1:54321/auth/v1/admin/users",
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            email,
            password,
            email_confirm: true,
            user_metadata: { full_name: "Pessoa Sintética", is_sindico: true },
          }),
        },
      );
      if (!response.ok)
        throw new Error("Unable to create local synthetic account.");
      const account = await response.json();
      try {
        expect(
          (
            await page.request.post("/api/auth/login", {
              data: { email, password },
            })
          ).status(),
        ).toBe(200);
        await provideFixture();
      } finally {
        await fetch(
          `http://127.0.0.1:54321/auth/v1/admin/users/${account.id}`,
          { method: "DELETE", headers },
        );
      }
    },
    { auto: true },
  ],
});
export { expect };
