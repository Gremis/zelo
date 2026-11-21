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
  await page.clock.install();
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
    await page.getByRole("button", { name: "Confirmar e entrar" }).click();
    await expect(page.getByRole("main").getByRole("alert")).toHaveText(
      "Informe o código recebido.",
    );
    await expect(page.getByLabel("Código", { exact: true })).toBeFocused();
    await page.getByLabel("Código", { exact: true }).fill("12345");
    await page.getByRole("button", { name: "Confirmar e entrar" }).click();
    await expect(page.getByRole("main").getByRole("alert")).toHaveText(
      "Digite o código de 6 dígitos.",
    );
    await expect(page.getByLabel("Código", { exact: true })).toHaveAttribute(
      "maxlength",
      "6",
    );
    await page.getByLabel("Código", { exact: true }).fill("123456");
    await page.getByRole("button", { name: "Confirmar e entrar" }).click();
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: "E-mail confirmado. Conta criada." }),
    ).toBeVisible();
    await expect(page).toHaveURL("/fila");
    await expect(
      page.getByRole("heading", { name: "Fila de ocorrências" }),
    ).toBeFocused();
    if (process.env.NEXT_PUBLIC_FIRST_STEPS_MOCK === "enabled") {
      await expect(
        page.getByRole("button", { name: "Dispensar" }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Primeiros passos" }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Cadastre seu primeiro condomínio" }),
      ).toBeDisabled();
    }
    const notice = page
      .getByRole("status")
      .filter({ hasText: "E-mail confirmado. Conta criada." });
    await page.clock.runFor(4000);
    await expect(notice).toBeVisible();
    await page.getByRole("button", { name: "Abrir menu" }).click();
    await page.getByRole("button", { name: "Fechar", exact: true }).click();
    const opener = page.getByRole("button", { name: "Abrir menu" });
    await expect(opener).toBeFocused();
    const title = page.getByRole("heading", { name: "Fila de ocorrências" });
    const before = await title.boundingBox();
    const scroll = await page.evaluate(() => window.scrollY);
    await page.clock.runFor(8000);
    await expect(notice).toHaveCount(0);
    await expect(opener).toBeFocused();
    expect(await title.boundingBox()).toEqual(before);
    expect(await page.evaluate(() => window.scrollY)).toBe(scroll);
    await opener.click();
    await page.getByRole("link", { name: "Fila de ocorrências" }).click();
    await expect(
      page.getByText("E-mail confirmado. Conta criada."),
    ).toBeHidden();
    await expect(
      page.getByRole("heading", { name: "Conta criada." }),
    ).toHaveCount(0);
    await page.reload();
    await expect(
      page.getByText("E-mail confirmado. Conta criada."),
    ).toBeHidden();
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
