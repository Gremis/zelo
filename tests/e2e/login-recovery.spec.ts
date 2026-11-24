import { expect, test } from "@playwright/test";

for (const width of [360, 1280]) {
  test(`login and recovery accessibility at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/login");
    await expect(page.getByRole("main")).toHaveCSS(
      "background-color",
      "rgb(246, 247, 249)",
    );
    await page.keyboard.press("Tab");
    await expect(
      page.getByRole("main").getByLabel("E-mail", { exact: true }),
    ).toBeFocused();
    await page
      .getByRole("main")
      .getByLabel("E-mail", { exact: true })
      .fill("person@example.invalid");
    await page.keyboard.press("Tab");
    await expect(
      page.getByRole("main").getByLabel("Senha", { exact: true }),
    ).toBeFocused();
    await page
      .getByRole("main")
      .getByLabel("Senha", { exact: true })
      .fill("Synthetic123");
    await page.route("**/api/auth/login", (route) => route.abort());
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText(
      "Não foi possível conectar",
    );
    await expect(
      page.getByRole("main").getByLabel("E-mail", { exact: true }),
    ).toBeFocused();
    await page.screenshot({
      path: info.outputPath(`login-${width}.png`),
      fullPage: true,
    });
    await page.getByRole("link", { name: "Esqueci minha senha" }).click();
    await expect(page).toHaveURL("/recuperar-senha");
    await page
      .getByRole("main")
      .getByLabel("E-mail", { exact: true })
      .fill("person@example.invalid");
    await page.route("**/api/auth/forgot-password", (route) => route.abort(), {
      times: 1,
    });
    await page.getByRole("button", { name: "Enviar código" }).click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText(
      "Não foi possível conectar",
    );
    await page.route("**/api/auth/forgot-password", (route) =>
      route.fulfill({
        status: 200,
        json: { message: "Generic test response" },
      }),
    );
    await page.getByRole("button", { name: "Enviar código" }).click();
    await expect(page).toHaveURL("/confirmar-codigo/recuperacao");
    await expect(page.getByText(/confere apenas o formato/)).toBeVisible();
    await page.getByRole("button", { name: "Continuar" }).click();
    await expect(
      page.getByRole("main").getByLabel("Código", { exact: true }),
    ).toBeFocused();
    await expect(
      page.getByRole("main").getByLabel("Código", { exact: true }),
    ).toHaveAccessibleDescription(/Informe o código de seis dígitos/);
    await page
      .getByRole("main")
      .getByLabel("Código", { exact: true })
      .fill("123456");
    await page.getByRole("button", { name: "Continuar" }).click();
    await expect(
      page.getByRole("heading", { name: "Crie uma nova senha" }),
    ).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(
      page.getByRole("main").getByLabel("Nova senha", { exact: true }),
    ).toBeFocused();
    await page
      .getByRole("main")
      .getByLabel("Nova senha", { exact: true })
      .fill("Synthetic123");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath(`password-${width}.png`),
      fullPage: true,
    });
    await page.route("**/api/auth/reset-password", (route) => route.abort());
    await page.getByRole("button", { name: "Salvar nova senha" }).click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText(
      "Solicite um novo código",
    );
    await expect(
      page.getByRole("button", { name: "Continuar" }),
    ).toBeDisabled();
    await page.getByRole("button", { name: "Reenviar código" }).click();
    await expect(page.getByRole("main").getByRole("status")).toContainText(
      "enviamos outro código",
    );
    await expect(page.getByRole("button", { name: "Continuar" })).toBeEnabled();
    await page.getByRole("button", { name: "Trocar e-mail" }).click();
    await expect(page).toHaveURL("/recuperar-senha");
    await expect(
      page.getByRole("main").getByLabel("E-mail", { exact: true }),
    ).toHaveValue("person@example.invalid");
    await page
      .getByRole("main")
      .getByLabel("E-mail", { exact: true })
      .fill("other@example.invalid");
    await page.getByRole("button", { name: "Enviar código" }).click();
    await expect(page).toHaveURL("/confirmar-codigo/recuperacao");
    await expect(page.getByRole("main")).toContainText("other@example.invalid");
    await expect(page.getByRole("main")).not.toContainText(
      "person@example.invalid",
    );
    await page.getByRole("button", { name: "Trocar e-mail" }).click();
    await expect(page).toHaveURL("/recuperar-senha");
    await page.reload();
    await expect(
      page.getByRole("main").getByLabel("E-mail", { exact: true }),
    ).toHaveValue("");
  });
}
