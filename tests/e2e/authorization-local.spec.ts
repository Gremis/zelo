import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

test.use({ trace: "off", video: "off", screenshot: "off" });
test.skip(
  process.env.ORI47_LOCAL_AUTH_TESTS !== "enabled",
  "Explicit local Supabase opt-in required.",
);

function localSql(statement: string) {
  execFileSync(
    "docker",
    [
      "exec",
      "supabase_db_zelo-local",
      "psql",
      "-X",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      statement,
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
}

function requireSuccess(value: boolean) {
  if (!value) throw new Error("Local authorization fixture operation failed.");
}

test("ORI-88 isolates user resources and rejects revoked sessions through UI and direct APIs", async ({
  browser,
  request,
}) => {
  test.setTimeout(90_000);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const adminKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url !== "http://127.0.0.1:54321" || !key || !adminKey)
    throw new Error("Only configured local Supabase is permitted.");
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const admin = createClient(url, adminKey, options);
  const accounts: {
    id: string;
    email: string;
    password: string;
    client: SupabaseClient;
  }[] = [];
  const contexts = [];
  try {
    for (const role of [true, true, false, true]) {
      const email = `ori88-${randomUUID()}@example.invalid`;
      const password = `Local${randomUUID()}9`;
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: "Pessoa Sintética", is_sindico: role },
      });
      requireSuccess(!error && Boolean(data.user));
      const client = createClient(url, key, options);
      accounts.push({ id: data.user!.id, email, password, client });
      const login = await client.auth.signInWithPassword({ email, password });
      requireSuccess(!login.error);
    }
    const [a, b, resident, pending] = accounts;
    const condominiumIds: string[] = [];
    for (const account of [a, b]) {
      const result = await account.client
        .from("condominiums")
        .insert({
          name: "Condomínio sintético",
          address: "Endereço sintético",
          manager_id: account.id,
        })
        .select("id")
        .single();
      requireSuccess(!result.error && Boolean(result.data));
      condominiumIds.push(result.data!.id);
    }
    const otherId = condominiumIds[1];
    expect(
      (
        await b.client
          .from("condominiums")
          .select("id")
          .eq("id", condominiumIds[0])
      ).data?.length,
    ).toBe(0);
    expect(
      (
        await b.client
          .from("condominiums")
          .update({ name: "Unauthorized" })
          .eq("id", condominiumIds[0])
          .select("id")
      ).data?.length,
    ).toBe(0);
    expect(
      (
        await a.client
          .from("condominiums")
          .update({ name: "Own update" })
          .eq("id", condominiumIds[0])
          .select("id")
      ).data?.length,
    ).toBe(1);
    expect(
      (await a.client.from("condominiums").select("id")).data?.length,
    ).toBe(1);
    expect(
      (await a.client.from("condominiums").select("id").eq("id", otherId)).data
        ?.length,
    ).toBe(0);
    expect(
      (
        await a.client
          .from("condominiums")
          .update({ name: "Unauthorized" })
          .eq("id", otherId)
          .select("id")
      ).data?.length,
    ).toBe(0);
    expect(
      Boolean(
        (
          await a.client.from("condominiums").insert({
            name: "Unauthorized",
            address: "Synthetic",
            manager_id: b.id,
          })
        ).error,
      ),
    ).toBe(true);
    expect(
      Boolean(
        (
          await a.client
            .from("condominiums")
            .update({ manager_id: b.id })
            .eq("id", condominiumIds[0])
        ).error,
      ),
    ).toBe(true);
    expect(
      (await a.client.from("profiles").select("id").eq("id", b.id)).data
        ?.length,
    ).toBe(0);
    expect(
      (
        await a.client
          .from("profiles")
          .update({ full_name: "Unauthorized" })
          .eq("id", b.id)
          .select("id")
      ).data?.length,
    ).toBe(0);
    expect(
      Boolean(
        (
          await resident.client
            .from("profiles")
            .update({ is_sindico: true })
            .eq("id", resident.id)
        ).error,
      ),
    ).toBe(true);
    expect(
      (await resident.client.from("condominiums").select("id")).data?.length,
    ).toBe(0);
    expect(
      Boolean(
        (
          await resident.client.from("condominiums").insert({
            name: "Unauthorized",
            address: "Synthetic",
            manager_id: resident.id,
          })
        ).error,
      ),
    ).toBe(true);
    expect(
      (await b.client.from("condominiums").select("name").eq("id", otherId))
        .data?.[0]?.name === "Condomínio sintético",
    ).toBe(true);

    expect((await request.get("/api/panel")).status()).toBe(401);
    expect((await request.get("/api/auth/session")).status()).toBe(401);
    const anonymous = await browser.newContext();
    contexts.push(anonymous);
    const anonymousPage = await anonymous.newPage();
    await anonymousPage.goto("/fila");
    await expect(anonymousPage).toHaveURL(/\/login$/);
    for (const path of [
      "/login",
      "/criar-conta",
      "/confirmar-codigo",
      "/recuperar-senha",
      "/confirmar-codigo/recuperacao",
    ])
      expect((await request.get(path)).status()).toBe(200);

    for (const [account, expectedStatus] of [
      [a, 200],
      [resident, 403],
      [pending, 401],
    ] as const) {
      const context = await browser.newContext();
      contexts.push(context);
      const login = await context.request.post("/api/auth/login", {
        data: {
          email: account.email,
          password: account.password,
          keepSignedIn: false,
        },
      });
      expect(login.status()).toBe(200);
      if (account === pending)
        localSql(
          `update auth.users set email_confirmed_at = null where id = '${pending.id}'`,
        );
      const panel = await context.request.get(
        `/api/panel?manager_id=${b.id}&id=${otherId}`,
      );
      expect(panel.status()).toBe(expectedStatus);
      expect(panel.headers()["cache-control"]).toContain("no-store");
      const page = await context.newPage();
      const queueResponse = await page.goto("/fila");
      expect(queueResponse?.headers()["cache-control"]).toContain("no-store");
      if (account === resident) {
        await expect(
          page.getByRole("heading", { name: "Acesso não autorizado" }),
        ).toBeVisible();
      } else if (account === pending) {
        await expect(page).toHaveURL(/\/login$/);
        expect(
          (await pending.client.from("condominiums").select("id")).data?.length,
        ).toBe(0);
        expect((await pending.client.rpc("has_active_session")).data).toBe(
          false,
        );
      } else {
        await expect(
          page.getByRole("heading", {
            name: "Fila de ocorrências",
            exact: true,
          }),
        ).toBeVisible();
        expect((await panel.json()).user.condominiumCount).toBe(1);
        await page.route("**/api/panel*", (route) =>
          route.fulfill({
            status: 503,
            json: { error: "Painel temporariamente indisponível." },
          }),
        );
        await page.goto("/fila?history=ori88");
        await page.goto("/fila");
        await page.getByRole("button", { name: "Abrir menu" }).click();
        await expect(
          page.getByText("Não foi possível carregar os dados do painel."),
        ).toBeVisible();
        const exit = page.getByRole("button", { name: "Sair", exact: true });
        await expect(exit).toBeEnabled();
        const savedCookies = await context.cookies();
        let logoutRequests = 0;
        let releaseLogout!: () => void;
        const logoutGate = new Promise<void>((resolve) => {
          releaseLogout = resolve;
        });
        await page.route("**/api/auth/logout", async (route) => {
          logoutRequests += 1;
          if (logoutRequests === 1) {
            await route.fulfill({
              status: 503,
              json: { error: "Serviço temporariamente indisponível." },
            });
            return;
          }
          await logoutGate;
          await route.continue();
        });
        await exit.click();
        await expect(
          page.getByText("Não foi possível sair. Tente novamente."),
        ).toBeVisible();
        await expect(page).toHaveURL(/\/fila$/);
        expect((await context.request.get("/api/auth/session")).status()).toBe(
          200,
        );
        await expect(exit).toBeEnabled();
        await exit.click();
        const leaving = page.getByRole("button", { name: "Saindo…" });
        await expect(leaving).toBeDisabled();
        await expect.poll(() => logoutRequests).toBe(2);
        await leaving.evaluate((button: HTMLButtonElement) => {
          button.click();
          button.click();
        });
        expect(logoutRequests).toBe(2);
        const logoutResponse = page.waitForResponse(
          (response) =>
            response.url().endsWith("/api/auth/logout") &&
            response.request().method() === "POST",
        );
        releaseLogout();
        expect((await logoutResponse).status()).toBe(200);
        await expect(page).toHaveURL(/\/login$/);
        expect((await context.cookies()).length).toBe(0);
        expect(
          await page.evaluate(
            () => localStorage.length + sessionStorage.length,
          ),
        ).toBe(0);
        await page.unroute("**/api/panel*");
        expect((await context.request.get("/api/panel")).status()).toBe(401);
        await page.reload();
        await expect(page).toHaveURL(/\/login$/);
        await page.goBack();
        await expect(page).toHaveURL(/\/login$/);
        await expect(
          page.getByRole("heading", {
            name: "Fila de ocorrências",
            exact: true,
          }),
        ).toHaveCount(0);
        await context.addCookies(savedCookies);
        expect((await context.request.get("/api/panel")).status()).toBe(401);
        expect((await context.request.get("/api/auth/session")).status()).toBe(
          401,
        );
        await page.goto("/fila");
        await expect(page).toHaveURL(/\/login$/);
        const token = (await a.client.auth.getSession()).data.session!
          .access_token;
        const direct = createClient(url, key, {
          ...options,
          global: { headers: { Authorization: `Bearer ${token}` } },
        });
        const sessionProbe = await direct.rpc("has_active_session");
        expect(sessionProbe.error === null).toBe(true);
        expect(sessionProbe.data).toBe(false);
        expect(
          (await direct.from("condominiums").select("id")).data?.length,
        ).toBe(0);
        expect((await direct.from("profiles").select("id")).data?.length).toBe(
          0,
        );
        expect(
          (
            await direct
              .from("condominiums")
              .update({ name: "Revoked" })
              .eq("id", condominiumIds[0])
              .select("id")
          ).data?.length,
        ).toBe(0);
        expect(
          Boolean(
            (
              await direct.from("condominiums").insert({
                name: "Revoked",
                address: "Synthetic",
                manager_id: a.id,
              })
            ).error,
          ),
        ).toBe(true);
        expect(Boolean((await a.client.auth.refreshSession()).error)).toBe(
          true,
        );
      }
    }
    const expired = await browser.newContext();
    contexts.push(expired);
    expect(
      (
        await expired.request.post("/api/auth/login", {
          data: { email: b.email, password: b.password },
        })
      ).status(),
    ).toBe(200);
    localSql(
      `update auth.sessions set not_after = now() - interval '1 second' where user_id = '${b.id}'`,
    );
    expect((await expired.request.get("/api/panel")).status()).toBe(401);
    const expiredPage = await expired.newPage();
    await expiredPage.goto("/fila");
    await expect(expiredPage).toHaveURL(/\/login$/);
    expect(Boolean((await b.client.auth.refreshSession()).error)).toBe(true);
    const invalid = await browser.newContext();
    contexts.push(invalid);
    await invalid.addCookies([
      {
        name: "sb-127-auth-token",
        value: `base64-${Buffer.from(JSON.stringify({ access_token: "invalid", refresh_token: "invalid", expires_at: 1 })).toString("base64url")}`,
        domain: "127.0.0.1",
        path: "/",
      },
    ]);
    expect((await invalid.request.get("/api/panel")).status()).toBe(401);
    const invalidPage = await invalid.newPage();
    await invalidPage.goto("/fila");
    await expect(invalidPage).toHaveURL(/\/login$/);
  } finally {
    for (const context of contexts) await context.close();
    for (const account of accounts) {
      localSql(
        `delete from public.condominiums where manager_id = '${account.id}'`,
      );
      const result = await admin.auth.admin.deleteUser(account.id);
      requireSuccess(!result.error);
    }
  }
});
