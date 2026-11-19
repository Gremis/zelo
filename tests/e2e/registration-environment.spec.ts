import { expect, test } from "@playwright/test";

test("registration follows the explicit application environment in a production build", async ({
  page,
  context,
}) => {
  const mocksEnabled =
    ["local", "development"].includes(process.env.NEXT_PUBLIC_APP_ENV ?? "") &&
    process.env.NEXT_PUBLIC_REGISTRATION_DEMO === "enabled";
  const mockMode =
    ["local", "development"].includes(process.env.NEXT_PUBLIC_APP_ENV ?? "") &&
    process.env.NEXT_PUBLIC_REGISTRATION_DEMO === "enabled";
  if (!mockMode)
    await page.route("**/api/auth/signup", (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Unavailable" }),
      }),
    );
  await page.goto("/criar-conta");
  await page.getByLabel("Nome completo").fill("Pessoa Exemplo");
  await page
    .getByLabel("E-mail", { exact: true })
    .fill("pessoa@example.invalid");
  await page.getByLabel("Celular").fill("21999990000");
  await page.getByLabel("Senha", { exact: true }).fill("Example123");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Criar conta", exact: true }).click();
  if (mocksEnabled) {
    await expect(page).toHaveURL("/confirmar-codigo");
    await expect(
      page.getByText("pessoa@example.invalid", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Reenviar código", exact: true })
      .click();
    await expect(page.getByRole("main").getByRole("status")).toContainText(
      "Código reenviado",
    );
    await page.getByLabel("Código", { exact: true }).fill("123456");
    await page.getByRole("button", { name: "Confirmar e entrar" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Conta criada." }),
    ).toBeFocused();
    await expect(page).toHaveURL("/confirmar-codigo");
  } else {
    await expect(page.getByRole("main").getByRole("alert")).toContainText(
      "O cadastro está temporariamente indisponível",
    );
    await expect(page).toHaveURL("/criar-conta");
    await expect(
      page.getByRole("heading", { name: "Conta criada." }),
    ).toHaveCount(0);
  }
  expect(await context.cookies()).toEqual([]);
  expect(
    await page.evaluate(() => [localStorage.length, sessionStorage.length]),
  ).toEqual([0, 0]);
});
