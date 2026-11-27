import { randomUUID } from "node:crypto";
import { test, expect } from "./local-auth";
import { removeLocalAccountData } from "./local-database";

test("preserves the header and menu without refetching common panel data", async ({
  page,
}) => {
  let panelReads = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/panel") panelReads++;
  });
  await page.goto("/fila");
  await expect(page.getByTitle("Pessoa Sintética").first()).toBeVisible();
  await page.locator("header").evaluate((node) => {
    node.dataset.navigationProbe = "preserved";
  });
  for (const [path, title, loaded] of [
    ["/condominios", "Condomínios", "Carregando condomínios…"],
    ["/funcionarios", "Funcionários", "Carregando funcionários…"],
    ["/fila", "Fila de ocorrências", "Carregando ocorrências…"],
  ]) {
    await page.getByRole("button", { name: "Abrir menu" }).click();
    await page.getByRole("link", { name: title, exact: true }).click();
    await expect(page).toHaveURL(path);
    await expect(
      page.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
    await expect(page.getByText(loaded, { exact: true })).toHaveCount(0);
    await expect(page.locator("header")).toHaveAttribute(
      "data-navigation-probe",
      "preserved",
    );
    await expect(
      page.locator("header").getByText(title, { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Abrir menu" }).click();
    await expect(
      page.getByRole("link", { name: title, exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await page.keyboard.press("Escape");
  }
  expect(panelReads).toBe(1);
  await page.getByRole("button", { name: "Abrir menu" }).click();
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await expect(page).toHaveURL("/login");
  expect((await page.request.get("/api/panel")).status()).toBe(401);
  await page.goBack();
  await expect(page).toHaveURL("/login");
  await expect(page.getByTitle("Pessoa Sintética")).toHaveCount(0);
});

test("changes the preserved panel session when cookies switch accounts", async ({
  page,
}) => {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key || process.env.NEXT_PUBLIC_SUPABASE_URL !== "http://127.0.0.1:54321")
    throw new Error("Only configured local Supabase is permitted.");
  const email = `panel-switch-${randomUUID()}@example.invalid`;
  const password = `Local${randomUUID()}9`;
  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
  const created = await fetch("http://127.0.0.1:54321/auth/v1/admin/users", {
    method: "POST",
    headers,
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: "Outra Pessoa Sintética", is_sindico: true },
    }),
  });
  expect(created.ok).toBe(true);
  const account = await created.json();
  try {
    const condoA = await page.request.post("/api/condominiums", {
      data: { name: "Carteira Sintética A", address: "Endereço sintético A" },
    });
    expect(condoA.status()).toBe(201);
    await page.goto("/condominios");
    await expect(
      page.getByRole("article", { name: "Carteira Sintética A" }),
    ).toBeVisible();
    await expect(page.getByTitle("Pessoa Sintética").first()).toBeVisible();
    expect(
      (
        await page.request.post("/api/auth/login", {
          data: { email, password },
        })
      ).status(),
    ).toBe(200);
    const condoB = await page.request.post("/api/condominiums", {
      data: { name: "Carteira Sintética B", address: "Endereço sintético B" },
    });
    expect(condoB.status()).toBe(201);
    await page.getByRole("button", { name: "Abrir menu" }).click();
    await page.getByRole("link", { name: "Funcionários", exact: true }).click();
    await expect(
      page.getByTitle("Outra Pessoa Sintética").first(),
    ).toBeVisible();
    await expect(
      page.getByTitle("Pessoa Sintética", { exact: true }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "Abrir menu" }).click();
    await page.getByRole("link", { name: "Condomínios", exact: true }).click();
    await expect(
      page.getByRole("article", { name: "Carteira Sintética B" }),
    ).toBeVisible();
    await expect(
      page.getByRole("article", { name: "Carteira Sintética A" }),
    ).toHaveCount(0);
  } finally {
    removeLocalAccountData(account.id);
    const removed = await fetch(
      `http://127.0.0.1:54321/auth/v1/admin/users/${account.id}`,
      { method: "DELETE", headers },
    );
    expect(removed.ok).toBe(true);
  }
});
