import { expect, test } from "@playwright/test";

test("navigates between the login and password recovery screens", async ({
  page,
}) => {
  await page.goto("/login");

  await expect(
    page.getByRole("heading", { level: 1, name: "Entrar" }),
  ).toBeVisible();

  await page.getByRole("link", { name: "Esqueci minha senha" }).click();

  await expect(page).toHaveURL("/recuperar-senha");
  await expect(
    page.getByRole("heading", { level: 1, name: "Recuperar senha" }),
  ).toBeVisible();

  await page.getByRole("link", { name: "Voltar para entrar" }).click();

  await expect(page).toHaveURL("/login");
  await expect(
    page.getByRole("heading", { level: 1, name: "Entrar" }),
  ).toBeVisible();
});
