import { expect, test } from "@playwright/test";

test("redirects the homepage to login", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Entrar" })).toBeVisible();
  await expect(page).toHaveTitle("Sindicondo");
  await expect(page.locator("html")).toHaveAttribute("lang", "pt-BR");
});

test("returns a not-found response for an unknown route", async ({ page }) => {
  const response = await page.goto("/unknown-route-smoke-test");

  expect(response?.status()).toBe(404);
  await expect(
    page.getByRole("heading", { level: 1, name: "404", exact: true }),
  ).toBeVisible();
});
