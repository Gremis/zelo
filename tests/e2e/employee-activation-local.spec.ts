import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { localSql, removeLocalAccountData } from "./local-database";

test.use({ trace: "off", video: "off", screenshot: "off" });
test.skip(
  process.env.ORI53_LOCAL_TESTS !== "enabled",
  "Local Supabase opt-in required",
);

test("real activation lifecycle, dialog keyboard behavior, failures and portfolio isolation", async ({
  browser,
}) => {
  test.setTimeout(120000);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url !== "http://127.0.0.1:54321" || !key)
    throw new Error("Only the local Supabase stack is permitted");
  const admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const users: string[] = [];
  const contexts = [];
  try {
    for (let index = 0; index < 2; index++) {
      const email = `ori53-${randomUUID()}@example.invalid`;
      const password = `Local${randomUUID()}9`;
      const created = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: "Pessoa Sintética", is_sindico: true },
      });
      if (created.error || !created.data.user)
        throw new Error("Synthetic account creation failed");
      users.push(created.data.user.id);
      const context = await browser.newContext({
        viewport: { width: 360, height: 800 },
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
    const [a, b] = contexts;
    const employees = [];
    for (const context of contexts) {
      const condoResponse = await context.request.post("/api/condominiums", {
        data: {
          name: "Residencial Jardim Botânico",
          address: "Endereço sintético",
        },
      });
      expect(condoResponse.status()).toBe(201);
      const condo = (await condoResponse.json()).condominium;
      const rolesResponse = await context.request.get("/api/funcoes");
      const roles = (await rolesResponse.json()).funcoes;
      for (const [index, nome] of [
        "Alfa Sintético",
        "Beta Sintético",
      ].entries()) {
        const response = await context.request.post("/api/funcionarios", {
          data: {
            nome,
            celular: `1190000002${index}`,
            condominioId: condo.id,
            funcaoId: roles[0].id,
            horarioTrabalho: "12 x 36, diurno (7h às 19h)",
          },
        });
        expect(response.status()).toBe(201);
        employees.push((await response.json()).funcionario);
      }
    }
    const id = employees[0].id;
    for (const ativo of [false, true]) {
      expect(
        (
          await b.request.patch(`/api/funcionarios/${id}`, { data: { ativo } })
        ).status(),
      ).toBe(404);
      expect(
        (
          await a.request.patch(`/api/funcionarios/${employees[2].id}`, {
            data: { ativo },
          })
        ).status(),
      ).toBe(404);
    }
    const foreignList = await b.request.get("/api/funcionarios");
    expect(
      (await foreignList.json()).funcionarios.some(
        (item: { id: string }) => item.id === id,
      ),
    ).toBe(false);
    const page = await a.newPage();
    const writes: boolean[] = [];
    page.on("request", (request) => {
      if (
        request.method() === "PATCH" &&
        new URL(request.url()).pathname === `/api/funcionarios/${id}`
      )
        writes.push(request.postDataJSON().ativo);
    });
    await page.goto("/funcionarios");
    const row = page
      .getByRole("listitem")
      .filter({ hasText: "Alfa Sintético" });
    const deactivate = row.getByRole("button", {
      name: "Desativar Alfa Sintético",
    });
    const reactivate = row.getByRole("button", {
      name: "Reativar Alfa Sintético",
    });
    const dialog = page.getByRole("dialog", {
      name: "Desativar Alfa Sintético?",
    });
    const cancel = dialog.getByRole("button", {
      name: "Cancelar",
      exact: true,
    });
    const confirm = dialog.getByRole("button", {
      name: "Desativar",
      exact: true,
    });
    await deactivate.focus();
    await page.keyboard.press("Enter");
    await expect(cancel).toBeFocused();
    await expect(dialog).toHaveAccessibleDescription(
      "Alfa deixa de aparecer na hora de delegar, e os links de tarefa enviados a ele param de funcionar. O histórico das ocorrências continua com o nome e as ações registradas. Dá para reativar depois na mesma lista.",
    );
    await page.keyboard.press("Shift+Tab");
    await expect(confirm).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(cancel).toBeFocused();
    await page
      .getByRole("button", { name: "Novo funcionário", exact: true })
      .evaluate((node: HTMLButtonElement) => node.focus());
    await expect(cancel).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(deactivate).toBeFocused();
    await page.keyboard.press("Space");
    await expect(cancel).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(dialog).toHaveCount(0);
    await expect(deactivate).toBeFocused();
    expect(writes).toEqual([]);

    await deactivate.click();
    await page.route(`**/api/funcionarios/${id}`, (route) =>
      route.fulfill({
        status: 503,
        json: { error: "Falha sintética de desativação" },
      }),
    );
    await confirm.click();
    await expect(dialog.getByRole("alert")).toHaveText(
      "Falha sintética de desativação",
    );
    await expect(row.getByText("Desativado", { exact: true })).toHaveCount(0);
    await expect(confirm).toBeEnabled();
    await page.unroute(`**/api/funcionarios/${id}`);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(`**/api/funcionarios/${id}`, async (route) => {
      await gate;
      await route.continue();
    });
    await confirm.click();
    await expect(cancel).toBeDisabled();
    await expect(
      dialog.getByRole("button", { name: "Desativando…" }),
    ).toBeDisabled();
    await page.keyboard.press("Escape");
    await page.keyboard.press("Enter");
    await expect(dialog).toBeVisible();
    await expect(row.getByText("Desativado", { exact: true })).toHaveCount(0);
    expect(writes).toEqual([false, false]);
    release();
    await expect(dialog).toHaveCount(0);
    await expect(reactivate).toBeFocused();
    await expect(page.getByRole("listitem").last()).toContainText(
      "Alfa Sintético",
    );
    await expect(row.getByText("Desativado", { exact: true })).toBeVisible();
    await expect(row).toContainText("12 x 36, diurno (7h às 19h)");
    await page.unroute(`**/api/funcionarios/${id}`);
    expect(
      localSql(`select ativo from public.funcionarios where id='${id}'::uuid`),
    ).toBe("f");
    for (const width of [360, 1440]) {
      await page.setViewportSize({ width, height: 800 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      if (width === 1440) {
        const rowBox = await row.boundingBox();
        expect(rowBox!.height).toBeLessThan(60);
        const phone = row.locator("dd").filter({ hasText: "(11) 90000-0020" });
        expect((await phone.boundingBox())!.height).toBeLessThan(25);

        const condominium = row.getByText("Residencial Jardim Botânico", {
          exact: true,
        });
        const condominiumBox = await condominium.boundingBox();
        expect(condominiumBox!.height).toBeLessThan(25);
        expect(
          await condominium.evaluate(
            (node) => node.scrollWidth <= node.clientWidth,
          ),
        ).toBe(true);
        const schedule = row.getByText("12 x 36, diurno (7h às 19h)", {
          exact: true,
        });
        const dimensions = await schedule.boundingBox();
        expect(dimensions!.height).toBeLessThan(25);
        expect(
          await schedule.evaluate(
            (node) => node.scrollWidth <= node.clientWidth,
          ),
        ).toBe(true);
      }
      await page.screenshot({
        path: `test-results/employee-inactive-${width}.png`,
        fullPage: true,
      });
    }
    await page.reload();
    await expect(reactivate).toBeVisible();
    await page.route(`**/api/funcionarios/${id}`, (route) =>
      route.fulfill({
        status: 503,
        json: { error: "Falha sintética de reativação" },
      }),
    );
    await reactivate.click();
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: "Falha sintética de reativação" }),
    ).toContainText("Falha sintética de reativação");
    await expect(row.getByText("Desativado", { exact: true })).toBeVisible();
    await expect(dialog).toHaveCount(0);
    await page.unroute(`**/api/funcionarios/${id}`);
    const reactivateGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(`**/api/funcionarios/${id}`, async (route) => {
      await reactivateGate;
      await route.continue();
    });
    await reactivate.focus();
    await page.keyboard.press("Space");
    await expect(reactivate).toBeDisabled();
    await page.keyboard.press("Enter");
    expect(writes.filter((value) => value)).toHaveLength(2);
    release();
    await expect(deactivate).toBeFocused();
    await expect(page.getByRole("listitem").first()).toContainText(
      "Alfa Sintético",
    );
    await expect(row.getByText("Desativado", { exact: true })).toHaveCount(0);
    await page.unroute(`**/api/funcionarios/${id}`);
    await page.reload();
    await expect(deactivate).toBeVisible();
    expect(
      localSql(`select ativo from public.funcionarios where id='${id}'::uuid`),
    ).toBe("t");

    await page.setViewportSize({ width: 360, height: 500 });
    await deactivate.click();
    const box = await dialog.boundingBox();
    expect(box!.width).toBeLessThanOrEqual(360);
    expect(box!.height).toBeLessThanOrEqual(500);
    await page.screenshot({
      path: "test-results/employee-deactivation-dialog-360.png",
      fullPage: true,
    });
    await page.route("**/api/funcionarios", (route) =>
      route.fulfill({
        status: 503,
        json: { error: "Falha sintética de leitura" },
      }),
    );
    await confirm.click();
    await expect(
      page.getByRole("alert").filter({ hasText: "A alteração foi salva" }),
    ).toContainText("A alteração foi salva");
    const reload = page.getByRole("button", { name: "Recarregar dados" });
    await expect(reload).toBeFocused();
    await expect(deactivate).toBeDisabled();
    expect(
      localSql(`select ativo from public.funcionarios where id='${id}'::uuid`),
    ).toBe("f");
    await page.unroute("**/api/funcionarios");
    const count = writes.length;
    await reload.click();
    await expect(reactivate).toBeFocused();
    expect(writes).toHaveLength(count);
    expect(
      localSql(
        `select count(*) from public.funcionarios where sindico_id='${users[0]}'::uuid`,
      ),
    ).toBe("2");
  } finally {
    for (const context of contexts) await context.close();
    for (const id of users) {
      removeLocalAccountData(id);
      expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();
    }
  }
});
