import { localSql, removeLocalAccountData } from "./local-database";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

test.use({ trace: "off", video: "off", screenshot: "off" });
test.skip(
  process.env.ORI51_LOCAL_TESTS !== "enabled",
  "Local Supabase opt-in required",
);

test("employee persistence, portfolio isolation, failures and responsive keyboard flow", async ({
  browser,
}) => {
  test.setTimeout(120000);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const adminKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url !== "http://127.0.0.1:54321" || !key || !adminKey)
    throw new Error("Local configuration required");
  const admin = createClient(url, adminKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const users: string[] = [];
  const clients: SupabaseClient[] = [];
  const credentials: { email: string; password: string }[] = [];
  const contexts = [];
  try {
    for (let index = 0; index < 2; index++) {
      const email = `ori51-${randomUUID()}@example.invalid`;
      const password = `Local${randomUUID()}9`;
      const created = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: "Pessoa Sintética", is_sindico: true },
      });
      if (created.error || !created.data.user)
        throw new Error("Synthetic account setup failed");
      users.push(created.data.user.id);
      credentials.push({ email, password });
      const client = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      expect(
        (await client.auth.signInWithPassword({ email, password })).error,
      ).toBeNull();
      clients.push(client);
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
    const [one, two] = contexts;
    const page = await one.newPage();
    await page.goto("/funcionarios");
    await page.getByRole("button", { name: "Abrir menu" }).click();
    await page.getByRole("link", { name: "Funcionários", exact: true }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await expect(
      page.getByText("Nenhum funcionário cadastrado nesta carteira."),
    ).toBeVisible();
    await expect(page.getByLabel("Nome e sobrenome")).toHaveCount(0);
    const open = page.getByRole("button", {
      name: "Novo funcionário",
      exact: true,
    });
    await open.click();
    await expect(
      page.getByRole("link", { name: "Ir para Condomínios" }),
    ).toBeVisible();
    await page.getByLabel("Nome e sobrenome").fill("Descartado");
    await page.getByRole("button", { name: "Cancelar", exact: true }).click();
    await expect(open).toBeFocused();
    expect(
      (await (await one.request.get("/api/funcionarios")).json()).funcionarios,
    ).toHaveLength(0);
    const condominiumResponse = await one.request.post("/api/condominiums", {
      data: { name: "Prédio sintético", address: "Endereço sintético" },
    });
    expect(condominiumResponse.status()).toBe(201);
    const condominium = (await condominiumResponse.json()).condominium;
    const role = (await (await one.request.get("/api/funcoes")).json())
      .funcoes[0];
    const otherRole = (await (await two.request.get("/api/funcoes")).json())
      .funcoes[0];
    const body = {
      nome: "Funcionário Sintético",
      celular: "11900000001",
      funcaoId: role.id,
      condominioId: condominium.id,
      horarioTrabalho: "",
    };
    expect(
      (
        await one.request.post("/api/funcionarios", {
          data: { ...body, funcaoId: otherRole.id },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await two.request.post("/api/funcionarios", {
          data: { ...body, funcaoId: otherRole.id },
        })
      ).status(),
    ).toBe(403);
    await open.click();
    await expect(page.getByLabel("Nome e sobrenome")).toHaveValue("");
    const save = page.getByRole("button", {
      name: "Salvar funcionário",
      exact: true,
    });
    await expect(save).toBeEnabled();
    await save.click();
    await expect(page.getByLabel("Nome e sobrenome")).toBeFocused();
    await expect(
      page.getByText("Informe o nome completo (nome e sobrenome)."),
    ).toBeVisible();
    await page.getByLabel("Nome e sobrenome").fill("Pessoa");
    await page.getByLabel("Celular", { exact: true }).fill("123");
    await save.click();
    await expect(page.getByLabel("Celular", { exact: true })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    await page.getByLabel("Nome e sobrenome").fill(body.nome);
    await page.getByLabel("Celular", { exact: true }).fill(body.celular);
    await page.getByLabel("Função", { exact: true }).selectOption(role.id);
    await page
      .getByLabel("Condomínio", { exact: true })
      .selectOption(condominium.id);
    let posts = 0;
    page.on("request", (request) => {
      if (
        request.method() === "POST" &&
        request.url().endsWith("/api/funcionarios")
      )
        posts++;
    });
    await save.click();
    await expect(
      page.getByText("Funcionário cadastrado.", { exact: true }),
    ).toBeVisible();
    await expect(open).toBeFocused();
    expect(posts).toBe(1);
    await expect(page.getByText(body.nome, { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByText(body.nome, { exact: true })).toBeVisible();
    const listed = await (await one.request.get("/api/funcionarios")).json();
    expect(listed.funcionarios).toHaveLength(1);
    expect(listed.funcionarios[0].horarioTrabalho).toBeNull();
    expect(listed.funcionarios[0].celular).toBe("(11) 90000-0001");
    const employeeId = listed.funcionarios[0].id;
    const privateResponse = await one.request.get("/api/funcionarios");
    expect(privateResponse.headers()["cache-control"]).toBe(
      "private, no-store, max-age=0",
    );
    expect(
      (await clients[1].from("funcionarios").select("id").eq("id", employeeId))
        .data,
    ).toEqual([]);
    const forgedCondo = await clients[1].from("funcionarios").insert({
      sindico_id: users[1],
      condominio_id: condominium.id,
      funcao_id: otherRole.id,
      nome: "Synthetic denied employee",
      celular: "11900000006",
    });
    expect(forgedCondo.error?.code).toBe("42501");
    const forgedRole = await clients[0].from("funcionarios").insert({
      sindico_id: users[0],
      condominio_id: condominium.id,
      funcao_id: otherRole.id,
      nome: "Synthetic denied role",
      celular: "11900000007",
    });
    expect(forgedRole.error?.code).toBe("42501");
    expect(
      (
        await (
          await two.request.get(`/api/funcionarios?id=${employeeId}`)
        ).json()
      ).funcionarios.some((item: { id: string }) => item.id === employeeId),
    ).toBe(false);
    expect(
      JSON.parse(
        localSql(
          `select json_build_object('sindicoId',sindico_id,'condominioId',condominio_id,'funcaoId',funcao_id) from public.funcionarios where id='${employeeId}'::uuid`,
        ),
      ),
    ).toEqual({
      sindicoId: users[0],
      condominioId: condominium.id,
      funcaoId: role.id,
    });
    const otherCondoResponse = await two.request.post("/api/condominiums", {
      data: { name: "Other synthetic portfolio", address: "Synthetic address" },
    });
    expect(otherCondoResponse.status()).toBe(201);
    const otherCondo = (await otherCondoResponse.json()).condominium;
    expect(
      (
        await one.request.post("/api/funcionarios", {
          data: {
            ...body,
            condominioId: otherCondo.id,
            celular: "11900000004",
          },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await two.request.post("/api/funcionarios", {
          data: {
            ...body,
            condominioId: otherCondo.id,
            funcaoId: otherRole.id,
          },
        })
      ).status(),
    ).toBe(201);
    const otherEmployees = (
      await (await two.request.get("/api/funcionarios")).json()
    ).funcionarios;
    expect(otherEmployees).toHaveLength(1);
    expect(otherEmployees[0].id).not.toBe(employeeId);
    expect(
      (await (await one.request.get("/api/funcionarios")).json()).funcionarios,
    ).toHaveLength(1);
    expect(
      (await (await two.request.get("/api/funcionarios")).json()).funcionarios,
    ).toHaveLength(1);
    await open.click();
    await page.getByLabel("Nome e sobrenome").fill("Outra Pessoa Sintética");
    await page.getByLabel("Celular", { exact: true }).fill(body.celular);
    await page.getByLabel("Função", { exact: true }).selectOption(role.id);
    await page
      .getByLabel("Condomínio", { exact: true })
      .selectOption(condominium.id);
    await page.getByLabel("Horário de trabalho").fill("12x36 noturno");
    await save.click();
    await expect(
      page.getByText("Esse celular já está cadastrado para outro funcionário."),
    ).toBeVisible();
    await expect(page.getByLabel("Celular", { exact: true })).toBeFocused();
    await page.getByLabel("Celular", { exact: true }).fill("11900000002");
    await page.route("**/api/funcionarios", async (route) => {
      if (route.request().method() === "POST")
        await route.fulfill({
          status: 503,
          json: { error: "Falha temporária de teste" },
        });
      else await route.continue();
    });
    await save.click();
    await expect(page.getByText("Falha temporária de teste")).toBeVisible();
    await expect(page.getByLabel("Horário de trabalho")).toHaveValue(
      "12x36 noturno",
    );
    await page.unroute("**/api/funcionarios");
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
    await page.getByLabel("Horário de trabalho").press("Enter");
    release();
    await expect(
      page.getByText("12x36 noturno", { exact: true }),
    ).toBeVisible();
    expect(posts).toBe(4);
    await page.unroute("**/api/funcionarios");
    for (const width of [360, 1440, 1728]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(
        page.getByText("Outra Pessoa Sintética", { exact: true }),
      ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: `test-results/employees-${width}.png`,
        fullPage: true,
      });
      await open.click();
      await expect(
        page.getByRole("button", { name: "Salvar funcionário", exact: true }),
      ).toBeEnabled();
      await expect(page.getByLabel("Nome e sobrenome")).toBeFocused();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: `test-results/employees-form-${width}.png`,
        fullPage: true,
      });
      await page.getByRole("button", { name: "Cancelar", exact: true }).click();
    }
    await page.route("**/api/funcionarios", (route) =>
      route.fulfill({ status: 503, json: { error: "Lista indisponível" } }),
    );
    await page.reload();
    await expect(page.getByText("Lista indisponível")).toBeVisible();
    await page.unroute("**/api/funcionarios");
    await page.getByRole("button", { name: "Tentar novamente" }).click();
    await expect(page.getByText(body.nome, { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Abrir menu" }).click();
    await page
      .getByRole("link", { name: "Fila de ocorrências", exact: true })
      .click();
    const queueResponse = await one.request.get("/api/occurrences/queue");
    expect(queueResponse.status()).toBe(200);
    if (process.env.ACCOUNT_DEMO_ENABLED === "true")
      await expect(
        page.getByText("Dados de demonstração", { exact: true }),
      ).toHaveCount(4);
    await page.getByRole("button", { name: "Abrir menu" }).click();
    await page.getByRole("link", { name: "Funcionários", exact: true }).click();
    await expect(page.getByText(body.nome, { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Abrir menu" }).click();
    await expect(
      page.getByRole("link", { name: "Funcionários", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await page.getByRole("button", { name: "Sair", exact: true }).click();
    await expect(page).toHaveURL(/\/login/);
    expect((await one.request.get("/api/funcionarios")).status()).toBe(401);
    expect((await one.request.get("/api/funcoes")).status()).toBe(401);
    expect(
      (
        await one.request.post("/api/auth/login", { data: credentials[0] })
      ).status(),
    ).toBe(200);
    await page.goto("/funcionarios");
    await expect(page.getByText(body.nome, { exact: true })).toBeVisible();
    const persisted = (
      await (await one.request.get("/api/funcionarios")).json()
    ).funcionarios;
    expect(persisted).toHaveLength(2);
    expect(
      persisted.some((item: { id: string }) => item.id === employeeId),
    ).toBe(true);
    localSql(`delete from auth.sessions where user_id='${users[0]}'::uuid`);
    expect((await one.request.get("/api/funcionarios")).status()).toBe(401);
    expect((await one.request.get("/api/funcoes")).status()).toBe(401);
    expect(
      (
        await one.request.post("/api/funcionarios", {
          data: { ...body, celular: "11900000005" },
        })
      ).status(),
    ).toBe(401);
    await page.goto("/funcionarios");
    await expect(page).toHaveURL(/\/login/);
  } finally {
    for (const context of contexts) await context.close();
    for (const id of users) {
      removeLocalAccountData(id);
      expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();
    }
  }
});
