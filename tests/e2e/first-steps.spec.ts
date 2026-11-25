import { expect, test } from "./local-auth";

test.use({ trace: "off", video: "off", screenshot: "off" });

for (const width of [360, 1440]) {
  test(`queue after login omits first steps at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const loaded = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/occurrences/queue") &&
        response.request().method() === "GET",
    );
    await page.goto("/fila");
    expect((await loaded).status()).toBe(200);
    await expect(
      page.getByRole("heading", { name: "Fila de ocorrências" }),
    ).toBeVisible();
    if (process.env.ACCOUNT_DEMO_ENABLED === "true") {
      await expect(
        page.getByText("Dados de demonstração", { exact: true }),
      ).toHaveCount(4);
      const panel = await (await page.request.get("/api/panel")).json();
      expect(panel.user.condominiumCount).toBe(0);
      expect(panel.firstSteps.completed).toEqual([]);
    } else {
      await expect(
        page.getByRole("heading", { name: "Nenhuma ocorrência por enquanto" }),
      ).toBeVisible();
    }
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
