import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

test.use({ trace: "off", video: "off", screenshot: "off" });
test.skip(
  process.env.ORI47_LOCAL_AUTH_TESTS !== "enabled",
  "Local Supabase opt-in required",
);

test("real condominium flow, concurrent creation and tenant isolation", async ({
  browser,
  request,
}) => {
  test.setTimeout(120000);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const adminKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url !== "http://127.0.0.1:54321" || !key || !adminKey)
    throw new Error("Local configuration required");
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const admin = createClient(url, adminKey, options);
  const accounts = [];
  const contexts = [];
  try {
    for (let index = 0; index < 3; index++) {
      const email = `condominiums-${randomUUID()}@example.invalid`;
      const password = `Local${randomUUID()}9`;
      const result = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: "Pessoa Sintética", is_sindico: index < 2 },
      });
      if (result.error || !result.data.user)
        throw new Error("Local fixture failed");
      const client = createClient(url, key, options);
      accounts.push({ id: result.data.user.id, client });
      expect(
        (await client.auth.signInWithPassword({ email, password })).error,
      ).toBeNull();
      const context = await browser.newContext({
        viewport: { width: 360, height: 900 },
      });
      contexts.push(context);
      expect(
        (
          await context.request.post("/api/auth/login", {
            data: { email, password },
          })
        ).status(),
      ).toBe(200);
    }
    const [a, b] = accounts;
    const [one, two, resident] = contexts;
    expect((await resident.request.get("/api/condominiums")).status()).toBe(
      403,
    );
    expect(
      (
        await resident.request.post("/api/condominiums", {
          data: { name: "Denied", address: "Denied" },
        })
      ).status(),
    ).toBe(403);
    const page = await one.newPage();
    await page.goto("/fila");
    await page.getByRole("button", { name: "Abrir menu" }).click();
    await page.getByRole("link", { name: "Condomínios", exact: true }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await expect(
      page.getByText("Nenhum condomínio cadastrado.", { exact: false }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Novo condomínio", exact: true })
      .click();
    await page.getByRole("button", { name: "Salvar e gerar link" }).click();
    await expect(page.getByLabel("Nome", { exact: true })).toBeFocused();
    await expect(page.getByText("Dê um nome ao condomínio.")).toBeVisible();
    await expect(
      page.getByText("Informe o endereço. Ele aparece no topo do formulário."),
    ).toBeVisible();
    const name = "Residencial Edifício São João";
    await page.getByLabel("Nome", { exact: true }).fill(name);
    await page
      .getByLabel("Endereço", { exact: true })
      .fill("Endereço sintético 123");
    await page.getByRole("button", { name: "Salvar e gerar link" }).click();
    const article = page.getByRole("article", { name });
    await expect(article).toBeVisible();
    await page.screenshot({
      path: "test-results/condominiums-mobile.png",
      fullPage: true,
    });
    const list = await (await one.request.get("/api/condominiums")).json();
    const item = list.condominiums[0];
    expect(
      (await one.request.get("/api/condominiums")).headers()["cache-control"],
    ).toContain("no-store");
    expect(
      (
        await resident.request.patch(`/api/condominiums/${item.id}`, {
          data: { name: "Denied", address: "Denied" },
        })
      ).status(),
    ).toBe(403);
    expect(item.slug).toMatch(/^sao-joao-[a-z0-9]{4}$/);
    expect(item.url).toBe(`http://127.0.0.1:3100/c/${item.slug}`);
    await page.reload();
    await expect(article).toBeVisible();
    await article.getByRole("button", { name: "Editar" }).click();
    await page.getByLabel("Nome", { exact: true }).fill("Descartado");
    await page.getByRole("button", { name: "Cancelar", exact: true }).click();
    await expect(article).toBeVisible();
    await article.getByRole("button", { name: "Editar" }).click();
    await page.getByLabel("Nome", { exact: true }).fill("Nome atualizado");
    await page
      .getByLabel("Endereço", { exact: true })
      .fill("Endereço atualizado");
    await page.getByRole("button", { name: "Salvar", exact: true }).click();
    await expect(
      page.getByText("Condomínio atualizado. O link não mudou."),
    ).toBeVisible();
    await expect(page.getByText(item.url, { exact: true })).toBeVisible();
    await page.evaluate(() =>
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async (value: string) => {
            (window as unknown as { copied: string }).copied = value;
          },
        },
      }),
    );
    await page.getByRole("button", { name: "Copiar link" }).click();
    await expect(page.getByText("Link copiado", { exact: true })).toBeVisible();
    expect(
      await page.evaluate(
        () => (window as unknown as { copied: string }).copied,
      ),
    ).toBe(item.url);
    await page.evaluate(() =>
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async () => {
            throw new Error("Denied");
          },
        },
      }),
    );
    await page.getByRole("button", { name: "Copiar link" }).click();
    await expect(
      page.getByText("Não foi possível copiar.", { exact: false }),
    ).toBeVisible();
    await expect(page.getByText("Link copiado", { exact: true })).toHaveCount(
      0,
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.getByRole("button", { name: "Abrir menu" }).click();
    await expect(
      page.getByText("Síndico profissional · 1 condomínio"),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Condomínios", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await page.getByRole("button", { name: "Fechar", exact: true }).click();
    expect((await request.get("/api/condominiums")).status()).toBe(401);
    expect(
      (
        await request.post("/api/condominiums", {
          data: { name, address: "x" },
        })
      ).status(),
    ).toBe(401);
    expect(
      (
        await two.request.patch(`/api/condominiums/${item.id}`, {
          data: { name: "Attack", address: "x" },
        })
      ).status(),
    ).toBe(404);
    expect(
      (await (await two.request.get("/api/condominiums")).json()).condominiums,
    ).toEqual([]);
    for (const extra of [{ manager_id: b.id }, { slug: "changed-ab12" }]) {
      expect(
        (
          await one.request.patch(`/api/condominiums/${item.id}`, {
            data: { name, address: "x", ...extra },
          })
        ).status(),
      ).toBe(400);
      expect(
        (
          await one.request.post("/api/condominiums", {
            data: { name, address: "x", ...extra },
          })
        ).status(),
      ).toBe(400);
    }
    expect(
      (
        await one.request.post("/api/condominiums", {
          data: { name: "  ", address: "\t" },
        })
      ).status(),
    ).toBe(422);
    expect(
      (await b.client.from("condominiums").select("*").eq("id", item.id)).data,
    ).toEqual([]);
    expect(
      (
        await b.client
          .from("condominiums")
          .update({ name: "Attack" })
          .eq("id", item.id)
          .select("id")
      ).data,
    ).toEqual([]);
    expect(
      (
        await a.client
          .from("condominiums")
          .update({ slug: "changed-ab12" })
          .eq("id", item.id)
      ).error,
    ).not.toBeNull();
    expect(
      (
        await a.client
          .from("condominiums")
          .update({ manager_id: b.id })
          .eq("id", item.id)
      ).error,
    ).not.toBeNull();
    const concurrent = await Promise.all(
      Array.from({ length: 16 }, () =>
        one.request.post("/api/condominiums", {
          data: { name, address: "Endereço sintético" },
        }),
      ),
    );
    expect(concurrent.every((response) => response.status() === 201)).toBe(
      true,
    );
    const generated = await Promise.all(
      concurrent.map(
        async (response) => (await response.json()).condominium.slug,
      ),
    );
    expect(new Set(generated).size).toBe(16);
    const long = await one.request.post("/api/condominiums", {
      data: { name: "Condomínio " + "Á".repeat(100), address: "B".repeat(500) },
    });
    expect((await long.json()).condominium.slug).toMatch(/^a{40}-[a-z0-9]{4}$/);
    const empty = await one.request.post("/api/condominiums", {
      data: { name: "!!!", address: "X" },
    });
    expect((await empty.json()).condominium.slug).toMatch(
      /^condominio-[a-z0-9]{4}$/,
    );
    const publicClient = createClient(url, key, options);
    expect(
      (await publicClient.from("condominiums").select("*")).error,
    ).not.toBeNull();
    const resolved = await publicClient.rpc("resolve_condominium_link", {
      p_slug: item.slug,
    });
    expect(resolved.data).toEqual([
      { name: "Nome atualizado", address: "Endereço atualizado" },
    ]);
    const publicPage = await (await browser.newContext()).newPage();
    try {
      await publicPage.goto(item.url);
      await expect(
        publicPage.getByRole("heading", { name: "Nome atualizado" }),
      ).toBeVisible();
      await expect(
        publicPage.getByText("Endereço atualizado", { exact: true }),
      ).toBeVisible();
      await expect(
        publicPage.getByRole("form", { name: "Registrar ocorrência" }),
      ).toBeVisible();
      await publicPage.goto("/c/does-not-exist-ab12");
      await expect(
        publicPage.getByRole("heading", { name: "Link não encontrado" }),
      ).toBeVisible();
    } finally {
      await publicPage.context().close();
    }
    await page.reload();
    await expect(page.getByRole("article")).toHaveCount(19);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.screenshot({
      path: "test-results/condominiums-desktop.png",
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.getByRole("button", { name: "Abrir menu" }).click();
    await page.getByRole("button", { name: "Sair", exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    expect((await one.request.get("/api/condominiums")).status()).toBe(401);
  } finally {
    for (const context of contexts) await context.close();
    for (const account of accounts) {
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
          `delete from public.condominiums where manager_id = '${account.id}'::uuid`,
        ],
        { stdio: "pipe" },
      );
      await admin.auth.admin.deleteUser(account.id);
    }
  }
});
