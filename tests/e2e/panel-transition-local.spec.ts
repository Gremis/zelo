import { expect, test } from "./local-auth";

test.use({ trace: "off", video: "off", screenshot: "off" });

async function recordPendingSurface(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    const samples: string[] = [];
    (window as unknown as { pendingSurfaces: string[] }).pendingSurfaces =
      samples;
    const observe = () => {
      const pending = [...document.querySelectorAll('[role="status"]')].find(
        (node) => node.textContent?.includes("Carregando painel…"),
      );
      if (pending && document.styleSheets.length)
        samples.push(getComputedStyle(pending).backgroundColor);
    };
    new MutationObserver(observe).observe(document, {
      subtree: true,
      childList: true,
    });
  });
}

async function slowNetwork(page: import("@playwright/test").Page) {
  const session = await page.context().newCDPSession(page);
  await session.send("Network.enable");
  await session.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 150,
    downloadThroughput: 750000,
    uploadThroughput: 250000,
  });
}

for (const width of [360, 1440]) {
  for (const [source, target, title] of [
    ["/condominios", "/fila", "Fila de ocorrências"],
    ["/fila", "/condominios", "Condomínios"],
  ] as const) {
    test(`light protected transition ${source} to ${target} at ${width}px on slow network`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme: "dark" });
      await recordPendingSurface(page);
      await slowNetwork(page);
      await page.goto(source);
      await expect(
        page.getByRole("button", { name: "Abrir menu", exact: true }),
      ).toBeVisible();
      let held = false;
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      await page.route(
        (url) => url.pathname === target && url.searchParams.has("_rsc"),
        async (route) => {
          held = true;
          await gate;
          await route.continue();
        },
      );
      try {
        await page
          .getByRole("button", { name: "Abrir menu", exact: true })
          .click();
        await page.getByRole("link", { name: title, exact: true }).click();
        await expect.poll(() => held).toBe(true);
        await expect(page.getByRole("dialog")).not.toBeVisible();
        await expect(page.locator("header")).toBeVisible();
        expect(
          await page
            .locator('div[lang="pt-BR"]:visible')
            .evaluate((node) => getComputedStyle(node).backgroundColor),
        ).toBe("rgb(246, 247, 249)");
      } finally {
        release();
      }
      await expect(page).toHaveURL(target);
      await expect(
        page.getByRole("heading", { name: title, exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Abrir menu", exact: true }),
      ).toBeVisible();
      expect(
        await page
          .locator('div[lang="pt-BR"]:visible')
          .evaluate((node) => getComputedStyle(node).backgroundColor),
      ).toBe("rgb(246, 247, 249)");
      const samples = await page.evaluate(
        () =>
          (window as unknown as { pendingSurfaces: string[] }).pendingSurfaces,
      );
      expect(samples.every((color) => color === "rgb(246, 247, 249)")).toBe(
        true,
      );
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: testInfo.outputPath(`authorized-${width}.png`),
      });
    });
  }
}

test("direct private routes still redirect a signed-out user without rendering private content on slow dark-mode navigation", async ({
  browser,
}, testInfo) => {
  const context = await browser.newContext({
    colorScheme: "dark",
    viewport: { width: 360, height: 900 },
  });
  try {
    const page = await context.newPage();
    await recordPendingSurface(page);
    await slowNetwork(page);
    for (const path of ["/fila", "/condominios"]) {
      const response = await context.request.get(path, { maxRedirects: 0 });
      const html = await response.text();
      await page.goto(path);
      await expect(page).toHaveURL("/login");
      await expect(
        page.getByRole("heading", { name: "Entrar", exact: true }),
      ).toBeVisible();
      await expect(page.locator("article")).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "Abrir menu", exact: true }),
      ).toHaveCount(0);
      expect(html).not.toContain("Nenhuma ocorrência por enquanto");
      expect(html).not.toContain("Novo condomínio");
      const samples = await page.evaluate(
        () =>
          (window as unknown as { pendingSurfaces: string[] }).pendingSurfaces,
      );
      expect(samples.every((color) => color === "rgb(246, 247, 249)")).toBe(
        true,
      );
      const fallback = await page.evaluate((responseHtml) => {
        const document = new DOMParser().parseFromString(
          responseHtml,
          "text/html",
        );
        const status = [...document.querySelectorAll('[role="status"]')].find(
          (node) => node.textContent?.includes("Carregando painel…"),
        );
        if (!status) return null;
        return {
          markup: status.outerHTML,
          parentClass: status.closest('div[lang="pt-BR"]')?.className ?? "",
          styles: [
            ...document.querySelectorAll('link[rel="stylesheet"], style'),
          ]
            .map((node) => node.outerHTML)
            .join(""),
        };
      }, html);
      expect(fallback).not.toBeNull();
      await page.setContent(
        `<html><head>${fallback!.styles}</head><body><div class="${fallback!.parentClass}">${fallback!.markup}</div></body></html>`,
      );
      await expect(page.getByRole("status")).toHaveCSS(
        "background-color",
        "rgb(246, 247, 249)",
      );
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: testInfo.outputPath(`public-pending-${path.slice(1)}-360.png`),
      });
    }
  } finally {
    await context.close();
  }
});
