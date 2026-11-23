import { expect, test, type Page } from "@playwright/test";
import { build } from "vite";
import { resolve } from "node:path";
import { readdir } from "node:fs/promises";
import { queueFixture, queueEmptyFixture } from "../fixtures/occurrence-queue";

let script: string;
let stylesheets: string;

test.beforeAll(async () => {
  stylesheets = (await readdir(resolve(".next/static/chunks")))
    .filter((name) => name.endsWith(".css"))
    .map(
      (name) => `<link rel="stylesheet" href="/_next/static/chunks/${name}">`,
    )
    .join("");
  const result = await build({
    configFile: false,
    logLevel: "error",
    define: { "process.env": JSON.stringify({ NODE_ENV: "production" }) },
    resolve: {
      alias: { "@": resolve("src"), "next/navigation": "\0queue-navigation" },
    },
    esbuild: { jsx: "automatic", jsxDev: false },
    build: {
      write: false,
      lib: {
        entry: resolve("tests/e2e/fixtures/occurrence-queue.tsx"),
        name: "QueueVisual",
        formats: ["iife"],
      },
      minify: false,
    },
    plugins: [
      {
        name: "queue-navigation",
        resolveId(id) {
          if (id === "\0queue-navigation") return id;
        },
        load(id) {
          if (id === "\0queue-navigation")
            return "const router={replace(){},refresh(){},push(){},prefetch(){}};export const useRouter=()=>router;";
        },
      },
    ],
  });
  const output = Array.isArray(result) ? result[0] : result;
  if (!("output" in output))
    throw new Error("Visual fixture output unavailable.");
  const chunk = output.output.find((item) => item.type === "chunk");
  if (!chunk || chunk.type !== "chunk")
    throw new Error("Visual fixture bundle unavailable.");
  script = chunk.code;
});

async function mount(page: Page, fixture = "all") {
  await page.goto(`/login?fixture=${fixture}`);
  const presentation = await page.evaluate(() => ({
    styles: [...document.querySelectorAll('link[rel="stylesheet"], style')]
      .map((node) => node.outerHTML)
      .join(""),
    font: getComputedStyle(document.querySelector("input")!).fontFamily,
  }));
  await page.setContent(
    `<!doctype html><html lang="pt-BR"><head>${presentation.styles}${stylesheets}</head><body><div id="visual-root" class="min-h-screen bg-[#f6f7f9] text-sm leading-[1.45] text-[#111827] [color-scheme:light] [&_:is(button,a):focus-visible]:outline-2 [&_:is(button,a):focus-visible]:outline-offset-4 [&_:is(button,a):focus-visible]:outline-teal-700"></div></body></html>`,
  );
  await page.locator("#visual-root").evaluate((node, font) => {
    node.style.fontFamily = font;
    node.style.setProperty(
      "--font-panel-heading",
      '"Space Grotesk", Inter, system-ui, sans-serif',
    );
  }, presentation.font);
  await page.addScriptTag({
    content:
      'globalThis.process={env:{NODE_ENV:"production"},browser:true};' + script,
  });
  await expect(
    page.getByRole("heading", { name: "Fila de ocorrências", exact: true }),
  ).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

for (const width of [360, 390, 560, 561, 768, 999, 1000, 1001, 1440]) {
  test(`queue presentation at ${width}px preserves all cards and keyboard access`, async ({
    page,
  }, testInfo) => {
    const errors: string[] = [];
    const queueRequests: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => {
      if (request.url().includes("/api/occurrences"))
        queueRequests.push(request.url());
    });
    await page.setViewportSize({ width, height: 1000 });
    await mount(page);
    if (width <= 1000) {
      await expect(page.getByRole("tab")).toHaveCount(4);
      const firstTab = page.getByRole("tab").first();
      expect(
        await firstTab.evaluate((node) => getComputedStyle(node).flexDirection),
      ).toBe(width > 560 ? "row" : "column");
      const [label, count] = await firstTab
        .locator("span")
        .evaluateAll((nodes) =>
          nodes.map((node) => {
            const { x, y, width, height } = node.getBoundingClientRect();
            return { x, y, width, height };
          }),
        );
      if (width > 560) {
        expect(count.x).toBeGreaterThan(label.x + label.width);
        expect(Math.abs(count.y - label.y)).toBeLessThan(1);
      } else {
        expect(count.y).toBeGreaterThanOrEqual(label.y + label.height);
      }
      await expect(page.getByRole("article")).toHaveCount(4);
      await page.getByRole("tab", { name: "Delegado 1", exact: true }).click();
      await expect(page.getByRole("article")).toHaveCount(1);
      await expect(page.getByRole("tabpanel")).toHaveCount(1);
      await page.keyboard.press("Home");
      await expect(
        page.getByRole("tab", { name: "Novo 4", exact: true }),
      ).toBeFocused();
      await page.keyboard.press("ArrowLeft");
      await expect(
        page.getByRole("tab", { name: "Concluído 1", exact: true }),
      ).toHaveAttribute("aria-selected", "true");
      await page.keyboard.press("ArrowRight");
      await page.keyboard.press("End");
      await expect(
        page.getByRole("tab", { name: "Concluído 1", exact: true }),
      ).toBeFocused();
      await page.keyboard.press("Home");
    } else {
      await expect(page.getByRole("tab")).toHaveCount(0);
      await expect(page.getByRole("article")).toHaveCount(7);
      await expect(page.getByLabel("4 em Novo")).toBeVisible();
      await expect(page.getByLabel("1 em Delegado")).toBeVisible();
    }
    const headings = await page.locator("main h2").evaluateAll((nodes) =>
      nodes.map((node) => ({
        text: node.textContent,
        x: node.getBoundingClientRect().x,
        y: node.getBoundingClientRect().y,
      })),
    );
    if (width >= 1001) expect(new Set(headings.map(({ y }) => y)).size).toBe(1);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.getByRole("button", { name: "Abrir menu" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("button", { name: "Abrir menu" }),
    ).toBeFocused();
    await expect(
      page.getByRole("button", { name: /Abrir ocorrência/ }),
    ).toHaveCount(0);
    expect(queueRequests).toEqual([]);
    expect(errors).toEqual([]);
    await page.screenshot({
      path: testInfo.outputPath(`queue-${width}.png`),
      fullPage: true,
    });
  });
}

test("long content expands with the keyboard, preserves reasons and reflows at 200%", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await mount(page, "stress");
  const article = page.getByRole("article").first();
  const report = article.getByRole("heading", { level: 3 });
  const collapsed = await report.evaluate((node) => ({
    height: node.clientHeight,
    full: node.scrollHeight,
    line: parseFloat(getComputedStyle(node).lineHeight),
  }));
  expect(collapsed.height).toBeLessThanOrEqual(collapsed.line * 2 + 1);
  expect(collapsed.full).toBeGreaterThan(collapsed.height);
  const expand = article.getByRole("button", { name: "Ler relato completo" });
  await expand.focus();
  await page.keyboard.press("Enter");
  await expect(
    article.getByRole("button", { name: "Recolher relato" }),
  ).toHaveAttribute("aria-expanded", "true");
  expect(await report.evaluate((node) => node.clientHeight)).toBeGreaterThan(
    collapsed.height,
  );
  await article.getByRole("button", { name: "Recolher relato" }).click();
  await page.evaluate(() => {
    document.body.style.zoom = "2";
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect(page.getByRole("article")).toHaveCount(4);
});

test("loading error retry and empty states use no queue request", async ({
  page,
}) => {
  await mount(page, "loading");
  await expect(page.getByRole("status")).toHaveText("Carregando ocorrências…");
  await expect(page.getByLabel("Carregando em Novo")).toHaveText("—");
  await mount(page, "error");
  await expect(page.getByRole("alert")).toContainText(
    "Não foi possível carregar a fila.",
  );
  await page.getByRole("button", { name: "Tentar novamente" }).click();
  await expect(page.getByRole("article")).toHaveCount(7);
  await mount(page, "empty");
  await expect(
    page.getByRole("heading", { name: "Nenhuma ocorrência por enquanto" }),
  ).toBeVisible();
  await expect(page.getByLabel("0 em Novo")).toBeVisible();
});

test("route remains protected regardless of a removed preview parameter", async ({
  page,
}) => {
  await page.goto("/fila?preview=fixtures");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByText("Preview de desenvolvimento.")).toHaveCount(0);
});

test("connected queue shows request failures and retries the API without fixture fallback", async ({
  page,
}) => {
  let attempts = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/occurrences/queue", async (route) => {
    attempts += 1;
    if (attempts === 1) {
      await gate;
      return route.fulfill({
        status: 503,
        json: { error: "Synthetic infrastructure failure" },
      });
    }
    return route.fulfill({ json: queueFixture("all") });
  });
  await mount(page, "connected");
  await expect(page.getByRole("status")).toHaveText("Carregando ocorrências…");
  await expect(page.getByRole("article")).toHaveCount(0);
  release();
  await expect(page.getByRole("alert")).toContainText(
    "Não foi possível carregar a fila.",
  );
  await expect(page.getByRole("article")).toHaveCount(0);
  await page.getByRole("button", { name: "Tentar novamente" }).click();
  await expect(page.getByRole("article")).toHaveCount(7);
  await expect(page.getByLabel("1 em Delegado")).toBeVisible();
  expect(attempts).toBe(2);
});

test("connected empty portfolio uses only the API response", async ({
  page,
}) => {
  await page.route("**/api/occurrences/queue", (route) =>
    route.fulfill({ json: queueEmptyFixture }),
  );
  await mount(page, "connected");
  await expect(
    page.getByRole("heading", { name: "Nenhuma ocorrência por enquanto" }),
  ).toBeVisible();
  await expect(page.getByLabel("0 em Novo")).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(0);
});

test("compact cards retain demo identification, accessible full dates and complete reports", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-11-23T15:00:00Z"));
  await page.setViewportSize({ width: 1728, height: 900 });
  await mount(page);
  const card = page.getByRole("article").first();
  await expect(card.getByText("Demo", { exact: true })).toBeVisible();
  await expect(
    card.getByText("Dados de demonstração", { exact: true }),
  ).toBeAttached();
  await expect(
    card.getByText("Hall sintético do quinto andar", { exact: true }),
  ).toHaveCount(0);
  const time = card.locator("time");
  await expect(time).toHaveText("ontem 09:05");
  await expect(time).toHaveAttribute(
    "aria-label",
    "22/11/2026, 09:05 — Horário de Brasília",
  );
  await expect(time).toHaveAttribute("datetime", "2026-11-22T12:05:00Z");
  const heading = card.getByRole("heading", { level: 3 });
  expect(
    await heading.evaluate(
      (node) =>
        node.clientHeight <=
        parseFloat(getComputedStyle(node).lineHeight) * 2 + 1,
    ),
  ).toBe(true);
  const number = await card.getByText("#7704", { exact: true }).boundingBox();
  const badge = await card.getByText("Urgente", { exact: true }).boundingBox();
  expect(number!.x).toBeGreaterThan(badge!.x + badge!.width);
  await expect(card.locator("footer")).toContainText("Pessoa Sintética Um");
});

test("selection survives data updates and resizing without additional requests", async ({
  page,
}) => {
  let requests = 0;
  page.on("request", (request) => {
    if (request.url().includes("/api/occurrences/queue")) requests += 1;
  });
  await page.setViewportSize({ width: 390, height: 900 });
  await mount(page, "refresh");
  await page.getByRole("tab", { name: "Delegado 1", exact: true }).click();
  await page.getByRole("button", { name: "Atualizar dados de teste" }).click();
  await expect(
    page.getByRole("tab", { name: "Delegado 0", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel")).toContainText(
    "Nenhuma ocorrência delegada.",
  );
  await page.setViewportSize({ width: 1001, height: 900 });
  await expect(page.getByRole("tab")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Delegado", exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 360, height: 900 });
  await expect(
    page.getByRole("tab", { name: "Delegado 0", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel")).toHaveCount(1);
  expect(requests).toBe(0);
});

test("mobile long cards and zero counts fit without horizontal scrolling", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 900 });
  await mount(page, "stress");
  await expect(page.getByRole("article")).toHaveCount(4);
  await page
    .getByRole("button", { name: "Ler relato completo" })
    .first()
    .click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("tab", { name: "Concluído 0", exact: true }).click();
  await expect(page.getByRole("tabpanel")).toContainText(
    "Nenhuma ocorrência concluída.",
  );
});

test.describe("mobile touch navigation", () => {
  test.use({ hasTouch: true });

  test("uses the connected response for every tab without fetching again", async ({
    page,
  }) => {
    let attempts = 0;
    await page.route("**/api/occurrences/queue", (route) => {
      attempts += 1;
      return route.fulfill({ json: queueFixture("all") });
    });
    await page.setViewportSize({ width: 390, height: 900 });
    await mount(page, "connected");
    await expect(
      page.getByRole("tab", { name: "Novo 4", exact: true }),
    ).toBeVisible();
    for (const [label, count] of [
      ["Andamento 1", 1],
      ["Delegado 1", 1],
      ["Concluído 1", 1],
      ["Novo 4", 4],
    ] as const) {
      const tab = page.getByRole("tab", { name: label, exact: true });
      await tab.tap();
      await expect(tab).toHaveAttribute("aria-selected", "true");
      await expect(page.getByRole("article")).toHaveCount(count);
    }
    expect(attempts).toBe(1);
  });
});
