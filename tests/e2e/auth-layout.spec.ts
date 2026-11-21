import { expect, test, type Page } from "@playwright/test";

async function checkLayout(page: Page) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect
    .poll(async () => {
      const card = await page
        .getByRole("main")
        .locator('[data-slot="card"]')
        .boundingBox();
      if (!card) return false;
      const viewport = page.viewportSize()!;
      const expectedTop = Math.max(40, (viewport.height - card.height) / 2);
      return (
        Math.abs(card.y - expectedTop) < 2 &&
        card.x >= 16 &&
        card.x + card.width <= viewport.width - 16
      );
    })
    .toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}

for (const viewport of [
  { width: 1280, height: 900 },
  { width: 360, height: 800 },
  { width: 360, height: 320 },
  { width: 1280, height: 360 },
]) {
  for (const route of ["/login", "/recuperar-senha", "/confirmar-codigo"]) {
    test(`${route} fits available space at ${viewport.width}x${viewport.height}`, async ({
      page,
    }, info) => {
      await page.setViewportSize(viewport);
      await page.goto(route);
      await checkLayout(page);
      if (route === "/confirmar-codigo") {
        await page
          .getByRole("link", { name: "Criar conta", exact: true })
          .scrollIntoViewIfNeeded();
        await expect(
          page.getByRole("link", { name: "Criar conta", exact: true }),
        ).toBeInViewport();
        return;
      }
      await page
        .getByRole("button", {
          name: route === "/login" ? "Entrar" : "Enviar código",
          exact: true,
        })
        .click();
      await expect(
        page.getByRole("main").getByRole("alert").first(),
      ).toBeVisible();
      await checkLayout(page);
      const footer = page.getByRole("link", {
        name: route === "/login" ? "Criar conta" : "Voltar para o login",
        exact: true,
      });
      await footer.scrollIntoViewIfNeeded();
      await expect(footer).toBeInViewport();
      await page.screenshot({
        path: info.outputPath("layout.png"),
        fullPage: true,
      });
    });
  }
}

test("reflows password, error and success content when keyboard space changes", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.route("**/api/auth/forgot-password", (route) =>
    route.fulfill({ status: 200, json: { message: "Test response" } }),
  );
  await page.route("**/api/auth/reset-password", (route) =>
    route.fulfill({ status: 200, json: { success: true } }),
  );
  await page.goto("/recuperar-senha");
  await page
    .getByRole("main")
    .getByLabel("E-mail", { exact: true })
    .fill("layout@example.invalid");
  await page.getByRole("button", { name: "Enviar código" }).click();
  await expect(page).toHaveURL("/confirmar-codigo/recuperacao");
  await checkLayout(page);
  await page
    .getByRole("main")
    .getByLabel("Código", { exact: true })
    .fill("123456");
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(
    page.getByRole("heading", { name: "Crie uma nova senha" }),
  ).toBeVisible();
  await checkLayout(page);
  const input = page
    .getByRole("main")
    .getByLabel("Nova senha", { exact: true });
  await input.focus();
  await page.setViewportSize({ width: 360, height: 320 });
  await checkLayout(page);
  await input.scrollIntoViewIfNeeded();
  await expect(input).toBeFocused();
  await expect(input).toBeInViewport();
  await page.getByRole("button", { name: "Salvar nova senha" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toBeVisible();
  await checkLayout(page);
  await input.fill("Synthetic123");
  await page.setViewportSize({ width: 360, height: 800 });
  await checkLayout(page);
  await page.getByRole("button", { name: "Salvar nova senha" }).click();
  await expect(page).toHaveURL("/login");
  await expect(page.getByRole("main").getByRole("status")).toContainText(
    "Senha alterada",
  );
  await checkLayout(page);
  await page.setViewportSize({ width: 360, height: 320 });
  await checkLayout(page);
  await page
    .getByRole("button", { name: "Entrar", exact: true })
    .scrollIntoViewIfNeeded();
  await expect(
    page.getByRole("button", { name: "Entrar", exact: true }),
  ).toBeInViewport();
});

test("keeps signup aligned at the existing top margin", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1100 });
  await page.goto("/criar-conta");
  const card = page.getByRole("main").locator('[data-slot="card"]');
  await expect
    .poll(async () => Math.round((await card.boundingBox())!.y))
    .toBe(40);
});
