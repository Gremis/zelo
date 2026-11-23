import { expect, test } from "@playwright/test";

for (const width of [360, 1440]) {
  test(`first steps at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/fila");
    await expect(
      page.getByRole("heading", { name: "Fila de ocorrências" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Nenhuma ocorrência por enquanto" }),
    ).toBeVisible();
    const mocksEnabled =
      ["local", "development"].includes(
        process.env.NEXT_PUBLIC_APP_ENV ?? "",
      ) && process.env.NEXT_PUBLIC_FIRST_STEPS_MOCK === "enabled";
    if (!mocksEnabled) {
      await expect(page.locator("main").getByRole("alert")).toContainText(
        "Não foi possível carregar",
      );
      await expect(
        page.getByRole("button", { name: "Tentar novamente" }),
      ).toBeVisible();
      return;
    }
    await expect(page.getByRole("button", { name: "Dispensar" })).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: "Copie o link do formulário e envie aos moradores",
      }),
    ).toBeDisabled();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await expect(page.getByRole("progressbar")).toHaveCount(0);
    await expect(page.locator("#first-steps-availability")).toHaveClass(
      "sr-only",
    );
    await page.screenshot({
      path: `test-results/first-steps-${width}.png`,
      fullPage: true,
    });
    await page.getByRole("button", { name: "Abrir menu" }).focus();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Dispensar" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("status")).toHaveText(
      "Quadro de primeiros passos dispensado.",
    );
    await page.reload();
    await expect(page.getByRole("button", { name: "Dispensar" })).toBeVisible();
  });
}
