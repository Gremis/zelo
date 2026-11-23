import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { localSql, removeLocalAccountData } from "./local-database";

test.use({ trace: "off", video: "off", screenshot: "off" });
test.skip(
  process.env.ORI52_LOCAL_TESTS !== "enabled",
  "Local Supabase opt-in required",
);
type Role = { id: string; nome: string };

async function chooseNew(page: Page) {
  await page
    .getByLabel("Função", { exact: true })
    .selectOption({ label: "+ Criar nova função" });
}
async function fillEmployee(
  page: Page,
  name: string,
  phone: string,
  condo: string,
) {
  await page.getByLabel("Nome e sobrenome").fill(name);
  await page.getByLabel("Celular", { exact: true }).fill(phone);
  await page.getByLabel("Condomínio", { exact: true }).selectOption(condo);
}

test("real inline role creation, canonical reuse, atomic rollback and portfolio isolation", async ({
  browser,
}) => {
  test.setTimeout(120000);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const adminKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url !== "http://127.0.0.1:54321" || !key || !adminKey)
    throw new Error("Only the local Supabase stack is permitted");
  const admin = createClient(url, adminKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const users: string[] = [];
  const contexts = [];
  try {
    for (let index = 0; index < 2; index++) {
      const email = `ori52-${randomUUID()}@example.invalid`;
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
    const [a, b] = contexts;
    const condos = [];
    for (const context of contexts) {
      const response = await context.request.post("/api/condominiums", {
        data: { name: "Prédio sintético", address: "Endereço sintético" },
      });
      expect(response.status()).toBe(201);
      condos.push((await response.json()).condominium);
    }
    async function roles(context = a): Promise<Role[]> {
      const response = await context.request.get("/api/funcoes");
      expect(response.status()).toBe(200);
      return (await response.json()).funcoes;
    }
    const original = await roles();
    expect(original).toHaveLength(3);
    const porter = original.find((item) => item.nome === "Porteiro")!;
    expect(porter).toBeTruthy();
    const page = await a.newPage();
    const payloads: Record<string, string>[] = [];
    let standaloneRoleWrites = 0;
    page.on("request", (request) => {
      if (
        request.method() === "POST" &&
        new URL(request.url()).pathname === "/api/funcionarios"
      )
        payloads.push(request.postDataJSON());
      if (
        request.method() === "POST" &&
        new URL(request.url()).pathname === "/api/funcoes"
      )
        standaloneRoleWrites++;
    });
    await page.goto("/funcionarios");
    const open = page.getByRole("button", {
      name: "Novo funcionário",
      exact: true,
    });
    const save = page.getByRole("button", {
      name: "Salvar funcionário",
      exact: true,
    });
    async function openForm() {
      await open.click();
      await expect(save).toBeEnabled();
    }
    await openForm();
    const select = page.getByLabel("Função", { exact: true });
    await select.focus();
    await page.keyboard.type("+");
    const name = page.getByLabel("Nome da nova função");
    await expect(name).toBeVisible();
    await page.keyboard.press("Tab");
    await expect(name).toBeFocused();
    await fillEmployee(
      page,
      "Funcionário Sintético",
      "11900000011",
      condos[0].id,
    );
    await save.click();
    await expect(name).toBeFocused();
    await expect(name).toHaveAttribute("aria-invalid", "true");
    await expect(name).toHaveAccessibleDescription("Informe a função.");
    await name.fill("   ");
    await save.click();
    await expect(name).toHaveAccessibleDescription("Informe a função.");
    expect(payloads).toHaveLength(0);
    await select.selectOption(porter.id);
    await expect(name).toHaveCount(0);
    await expect(page.getByText("Informe a função.")).toHaveCount(0);
    await chooseNew(page);
    await name.fill("Não persistir");
    await name.press("Tab");
    expect(await roles()).toEqual(original);
    await page.getByRole("button", { name: "Cancelar", exact: true }).click();
    await expect(open).toBeFocused();
    expect(payloads).toHaveLength(0);
    expect(await roles()).toEqual(original);

    await openForm();
    await fillEmployee(
      page,
      "Funcionário Sintético",
      "11900000011",
      condos[0].id,
    );
    await chooseNew(page);
    await expect(name).toHaveValue("");
    await name.fill("Jardineira");
    for (const width of [360, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      const roleBox = await select.boundingBox();
      const nameBox = await name.boundingBox();
      const condoBox = await page
        .getByLabel("Condomínio", { exact: true })
        .boundingBox();
      expect(nameBox!.y).toBeGreaterThanOrEqual(roleBox!.y + roleBox!.height);
      expect(Math.abs(nameBox!.x - roleBox!.x)).toBeLessThan(2);
      if (width === 1440)
        expect(Math.abs(condoBox!.y - roleBox!.y)).toBeLessThan(2);
      else expect(nameBox!.y).toBeLessThan(condoBox!.y);
      await page.screenshot({
        path: `test-results/employee-roles-form-${width}.png`,
        fullPage: true,
      });
    }
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/api/funcionarios", async (route) => {
      if (route.request().method() === "POST") await gate;
      await route.continue();
    });
    await save.click();
    await expect(
      page.getByRole("button", { name: "Salvando…" }),
    ).toBeDisabled();
    await page.keyboard.press("Enter");
    expect(await roles()).toEqual(original);
    release();
    await expect(
      page.getByText("Funcionário cadastrado.", { exact: true }),
    ).toBeVisible();
    await page.unroute("**/api/funcionarios");
    expect(payloads).toHaveLength(1);
    expect(payloads[0].funcaoNome).toBe("Jardineira");
    expect(payloads[0]).not.toHaveProperty("funcaoId");
    const afterCreation = await roles();
    expect(afterCreation).toHaveLength(4);
    const gardener = afterCreation.find((item) => item.nome === "Jardineira")!;
    expect(gardener).toBeTruthy();
    await expect(
      page
        .getByRole("listitem")
        .filter({ hasText: "Funcionário Sintético" })
        .getByText("Jardineira", { exact: true }),
    ).toBeVisible();
    await openForm();
    await expect(
      page.getByRole("option", { name: "Jardineira", exact: true }),
    ).toHaveAttribute("value", gardener.id);
    await fillEmployee(
      page,
      "Outro Funcionário Sintético",
      "11900000012",
      condos[0].id,
    );
    await chooseNew(page);
    await name.fill("Nome descartado");
    await select.selectOption(gardener.id);
    await expect(name).toHaveCount(0);
    await save.click();
    await expect(open).toBeVisible();
    expect(payloads[1].funcaoId).toBe(gardener.id);
    expect(payloads[1]).not.toHaveProperty("funcaoNome");
    expect(await roles()).toEqual(afterCreation);

    await openForm();
    await fillEmployee(page, "Porteiro Sintético", "11900000013", condos[0].id);
    await chooseNew(page);
    await name.fill("porteiro");
    await save.click();
    await expect(open).toBeVisible();
    await expect(
      page
        .getByRole("listitem")
        .filter({ hasText: "Porteiro Sintético" })
        .getByText("Porteiro", { exact: true }),
    ).toBeVisible();
    expect(await roles()).toEqual(afterCreation);
    expect(
      localSql(
        `select funcao_id from public.funcionarios where sindico_id='${users[0]}'::uuid and nome='Porteiro Sintético'`,
      ),
    ).toBe(porter.id);
    await openForm();
    await expect(
      page.getByRole("option", { name: "Porteiro", exact: true }),
    ).toHaveAttribute("value", porter.id);
    await expect(
      page.getByRole("option", { name: "Porteiro", exact: true }),
    ).toHaveCount(1);
    await fillEmployee(page, "Cadastro Rejeitado", "11900000011", condos[0].id);
    await chooseNew(page);
    await name.fill("Função rejeitada");
    await save.click();
    await expect(
      page.getByText("Esse celular já está cadastrado para outro funcionário."),
    ).toBeVisible();
    await expect(name).toHaveValue("Função rejeitada");
    await expect(page.getByLabel("Nome e sobrenome")).toHaveValue(
      "Cadastro Rejeitado",
    );
    expect(await roles()).toEqual(afterCreation);
    await page.getByRole("button", { name: "Cancelar", exact: true }).click();
    const denied = await a.request.post("/api/funcionarios", {
      data: {
        nome: "Cadastro Não Autorizado",
        celular: "11900000014",
        condominioId: condos[1].id,
        funcaoNome: "Função não autorizada",
      },
    });
    expect(denied.status()).toBe(403);
    expect(await roles()).toEqual(afterCreation);
    const other = await b.request.post("/api/funcionarios", {
      data: {
        nome: "Funcionário Outra Carteira",
        celular: "11900000011",
        condominioId: condos[1].id,
        funcaoNome: "Função exclusiva B",
      },
    });
    expect(other.status()).toBe(201);
    const privateRole = (await roles(b)).find(
      (item) => item.nome === "Função exclusiva B",
    )!;
    expect(privateRole).toBeTruthy();
    expect((await roles()).some((item) => item.id === privateRole.id)).toBe(
      false,
    );
    expect(
      (
        await a.request.post("/api/funcionarios", {
          data: {
            nome: "Referência Não Autorizada",
            celular: "11900000015",
            condominioId: condos[0].id,
            funcaoId: privateRole.id,
          },
        })
      ).status(),
    ).toBe(403);
    await page.reload();
    await expect(page.getByText("Jardineira", { exact: true })).toHaveCount(2);
    await expect(page.getByText("Porteiro", { exact: true })).toBeVisible();
    await openForm();
    await expect(
      page.getByRole("option", { name: "Jardineira", exact: true }),
    ).toHaveAttribute("value", gardener.id);
    await expect(
      page.getByRole("option", { name: "Função exclusiva B", exact: true }),
    ).toHaveCount(0);
    expect(standaloneRoleWrites).toBe(0);
    expect(
      localSql(
        `select count(*) from public.funcionarios where sindico_id='${users[0]}'::uuid`,
      ),
    ).toBe("3");
    expect(await roles()).toEqual(afterCreation);
  } finally {
    for (const context of contexts) await context.close();
    for (const id of users) {
      removeLocalAccountData(id);
      expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();
    }
  }
});
