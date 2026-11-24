import { expect, test } from "@playwright/test";

test("an invalid tracking code shows only the generic message", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/o/codigoqualquer");
  await expect(
    page.getByRole("heading", { name: "Acompanhamento indisponível" }),
  ).toBeVisible();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(
    "Não encontramos esta ocorrência. Confira o link que você recebeu.",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
