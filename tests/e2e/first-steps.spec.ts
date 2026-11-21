import { expect, test } from "./local-auth";

test.use({ trace: "off", video: "off", screenshot: "off" });

for (const width of [360, 1440]) {
  test(`queue after login omits first steps at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/fila");
    await expect(
      page.getByRole("heading", { name: "Fila de ocorrências" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Nenhuma ocorrência por enquanto" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Primeiros passos" }),
    ).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Dispensar" })).toHaveCount(
      0,
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Primeiros passos" }),
    ).toHaveCount(0);
  });
}
