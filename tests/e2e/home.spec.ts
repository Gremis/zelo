import { expect, test } from "@playwright/test";

test("renders the homepage", async ({ page }) => {
  const response = await page.goto("/");

  expect(response?.status()).toBe(200);
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "To get started, edit the page.tsx file.",
    }),
  ).toBeVisible();
});

test("returns a not-found response for an unknown route", async ({ page }) => {
  const response = await page.goto("/unknown-route-smoke-test");

  expect(response?.status()).toBe(404);
  await expect(
    page.getByRole("heading", { level: 1, name: "404", exact: true }),
  ).toBeVisible();
});
