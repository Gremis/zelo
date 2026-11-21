import { expect, test } from "./local-auth";

test.use({ trace: "off", video: "off", screenshot: "off" });

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
