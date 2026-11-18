import { expect, test } from "@playwright/test";

for (const viewport of [
  { width: 360, height: 960 },
  { width: 390, height: 960 },
  { width: 768, height: 960 },
  { width: 1280, height: 960 },
]) {
  test(`signup and direct confirmation at ${viewport.width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.goto("/login");
    await page.getByRole("link", { name: "Criar conta" }).click();
    await expect(page).toHaveURL("/criar-conta");
    await expect(
      page.getByRole("heading", { name: "Criar conta" }),
    ).toBeVisible();
    await expect(
      page.getByRole("complementary", { name: "Modo de demonstração" }),
    ).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Criar conta" })).toHaveCSS(
      "font-family",
      /Space Grotesk/,
    );
    await expect(page.getByRole("heading", { name: "Criar conta" })).toHaveCSS(
      "font-size",
      "24px",
    );
    await page.evaluate(() => document.fonts.ready);
    await page.getByLabel("Nome completo").focus();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: testInfo.outputPath(`signup-empty-${viewport.width}.png`),
      fullPage: true,
    });
    await page.getByLabel("Nome completo").fill("Pessoa Exemplo");
    await page
      .getByRole("textbox", { name: "E-mail", exact: true })
      .fill("pessoa@example.invalid");
    await page.getByLabel("Celular").fill("(31) 99999-0000");
    await expect(
      page.getByRole("link", { name: /termos|privacidade/i }),
    ).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`signup-${viewport.width}.png`),
      fullPage: true,
    });
    await page
      .getByRole("main")
      .getByLabel("Senha", { exact: true })
      .fill("Example123");
    await page.getByRole("checkbox").check();
    await page
      .getByRole("button", { name: "Criar conta", exact: true })
      .click();
    const mocksEnabled =
      ["local", "development"].includes(
        process.env.NEXT_PUBLIC_APP_ENV ?? "",
      ) && process.env.NEXT_PUBLIC_REGISTRATION_DEMO === "enabled";
    if (mocksEnabled) {
      await expect(page).toHaveURL("/confirmar-codigo");
      await expect(
        page.getByText("pessoa@example.invalid", { exact: true }),
      ).toBeVisible();
      await page.getByRole("link", { name: "Corrigir e-mail" }).click();
    } else {
      await expect(page.getByRole("main").getByRole("alert")).toContainText(
        "O cadastro está temporariamente indisponível",
      );
      await expect(page).toHaveURL("/criar-conta");
    }
    await expect(
      page.getByRole("main").getByLabel("Senha", { exact: true }),
    ).toHaveValue("");
    await page.getByRole("checkbox").uncheck();
    await page.getByLabel("Nome completo").clear();
    await page
      .getByRole("button", { name: "Criar conta", exact: true })
      .click();
    await expect(page.getByLabel("Nome completo")).toBeFocused();
    await expect(page.getByLabel("Nome completo")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    await expect(page.getByRole("main").getByRole("alert")).toHaveCount(3);
    await page.screenshot({
      path: testInfo.outputPath(`signup-errors-${viewport.width}.png`),
      fullPage: true,
    });
    await page.keyboard.type("Pessoa Exemplo");
    await page.keyboard.press("Tab");
    await expect(
      page.getByRole("textbox", { name: "E-mail", exact: true }),
    ).toBeFocused();
    await page.getByRole("link", { name: "Entrar", exact: true }).click();
    await page.getByRole("link", { name: "Criar conta" }).click();
    await expect(
      page.getByRole("textbox", { name: "Nome completo", exact: true }),
    ).toHaveValue("Pessoa Exemplo");
    await expect(
      page.getByRole("textbox", { name: "E-mail", exact: true }),
    ).toHaveValue("pessoa@example.invalid");
    await expect(
      page.getByRole("textbox", { name: "Celular", exact: true }),
    ).toHaveValue("(31) 99999-0000");
    await page.goto("/confirmar-codigo");
    await expect(
      page.getByRole("heading", { name: "Confirme seu e-mail" }),
    ).toBeVisible();
    await expect(page.getByRole("status")).toContainText(
      "Não encontramos os dados",
    );
    await expect(
      page.getByRole("button", { name: "Confirmar e entrar" }),
    ).toBeDisabled();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`confirmation-${viewport.width}.png`),
      fullPage: true,
    });
    await page.getByRole("link", { name: "Criar conta" }).click();
    await expect(
      page.getByRole("textbox", { name: "E-mail", exact: true }),
    ).toHaveValue("");
    await page.getByRole("link", { name: "Entrar", exact: true }).click();
    await expect(page).toHaveURL("/login");
  });
}
