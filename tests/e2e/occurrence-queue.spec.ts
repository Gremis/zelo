import { expect, test, type Page } from "@playwright/test";
import { build } from "vite";
import { resolve } from "node:path";
import { readdir } from "node:fs/promises";
import { occurrenceDetailFixture } from "../fixtures/occurrence-detail";
import { queueFixture, queueEmptyFixture } from "../fixtures/occurrence-queue";
import type { PriorityChangeReason } from "@/server/occurrences/detail.contract";
import type { QueuePriority } from "@/server/occurrences/queue.contract";

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

type PriorityBody = {
  priority: QueuePriority;
  reason: PriorityChangeReason | null;
};

async function mockOccurrenceDetail(page: Page) {
  await page.route("**/api/occurrences/*/eligible-employees", (route) =>
    route.fulfill({ json: { employees: [] } }),
  );
  let current = occurrenceDetailFixture();
  const priorityBodies: PriorityBody[] = [];
  const updates: string[] = [];
  await page.route("**/api/occurrences/*/eligible-employees", (route) =>
    route.fulfill({ json: { employees: [] } }),
  );
  await page.route("**/api/occurrences/*", (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    return route.fulfill({ json: current });
  });
  await page.route("**/api/occurrences/queue", (route) =>
    route.fulfill({ json: queueFixture("all") }),
  );
  await page.route("**/api/occurrences/*/priority", (route) => {
    const body = route.request().postDataJSON() as PriorityBody;
    priorityBodies.push(body);
    current = {
      ...current,
      finalPriority: body.priority,
      effectivePriority: body.priority,
      suggestionPending: false,
      priorityChangeReason: body.reason,
      priorityDecidedAt: new Date().toISOString(),
    };
    return route.fulfill({
      json: {
        finalPriority: body.priority,
        suggestionPending: false,
        priorityChangeReason: body.reason,
      },
    });
  });
  await page.route("**/api/occurrences/*/updates", (route) => {
    const body = route.request().postDataJSON() as { text: string };
    updates.push(body.text);
    current = {
      ...current,
      events: [
        {
          id: 3 + updates.length,
          type: "manager_update",
          occurredAt: new Date().toISOString(),
          authorType: "manager",
          authorName: "Pessoa Síndica Sintética",
          authorPhone: "31999990000",
          authorRole: "manager",
          authorIsViewer: true,
          text: body.text,
        },
        ...current.events,
      ],
    };
    return route.fulfill({ json: { eventId: 3 + updates.length } });
  });
  return { priorityBodies, updates };
}

test("detail card saves priority, records a reason and appends manager updates", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1280, height: 1000 });
  const mocks = await mockOccurrenceDetail(page);
  await mount(page, "connected");
  await expect(page.getByRole("article")).toHaveCount(7);
  await page.getByRole("button", { name: "Abrir ocorrência #7704" }).click();
  const dialog = page.getByRole("dialog", { name: /cheiro de gás/ });
  await expect(dialog).toBeVisible();
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  const copyLink = dialog.getByRole("button", {
    name: "Copiar link de acompanhamento",
  });
  await copyLink.focus();
  expect(
    await copyLink.evaluate((node) => node === document.activeElement),
  ).toBe(true);
  await page.keyboard.press("Enter");
  await expect(dialog.getByText("Link copiado")).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    `https://sindicondo.app/o/${occurrenceDetailFixture().trackingCode}`,
  );
  await expect(dialog.getByLabel("Prioridade")).toHaveValue("urgent");
  await expect(dialog.getByText("Sugerida pelo Sindicondo")).toBeVisible();
  await expect(dialog.getByText("Por quê:")).toBeVisible();
  await expect(dialog.getByText("Categoria:")).toBeVisible();
  expect(await page.evaluate(() => document.body.style.overflow)).toBe(
    "hidden",
  );
  await dialog.getByLabel("Prioridade").selectOption("normal");
  await expect(dialog.getByText("Sugerida: Urgente")).toBeVisible();
  expect(mocks.priorityBodies).toEqual([{ priority: "normal", reason: null }]);
  await dialog
    .getByLabel("Por que mudou? (opcional)")
    .selectOption("recurring");
  await expect(dialog.getByLabel("Por que mudou? (opcional)")).toHaveValue(
    "recurring",
  );
  expect(mocks.priorityBodies).toEqual([
    { priority: "normal", reason: null },
    { priority: "normal", reason: "recurring" },
  ]);
  const history = dialog.getByRole("list", {
    name: "Histórico da ocorrência",
  });
  await expect(history.getByRole("listitem").first()).toContainText(
    "Zelador olhou o portão",
  );
  await expect(history.getByRole("listitem").first()).toContainText(
    "(síndico, você)",
  );
  await dialog
    .getByLabel("Escreva uma atualização")
    .fill("Visita marcada para amanhã.");
  await dialog.getByRole("button", { name: "Adicionar" }).click();
  await expect(dialog.getByText("Atualização adicionada.")).toBeVisible();
  await expect(dialog.getByLabel("Escreva uma atualização")).toHaveValue("");
  await expect(history.getByRole("listitem").first()).toContainText(
    "Visita marcada para amanhã.",
  );
  await dialog.getByRole("button", { name: "Adicionar" }).click();
  await expect(dialog.getByRole("alert")).toHaveText("Escreva a atualização.");
  expect(mocks.updates).toEqual(["Visita marcada para amanhã."]);
  await expect(
    dialog.getByText("Só você vê. O morador não vê as atualizações."),
  ).toBeVisible();
  await page.mouse.click(20, 500);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe(
    "hidden",
  );
  await page.getByRole("button", { name: "Abrir ocorrência #7704" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("detail card expands in place on mobile and closes with the X", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await mockOccurrenceDetail(page);
  await mount(page, "connected");
  await page.getByRole("button", { name: "Abrir ocorrência #7704" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(360.5);
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe(
    "hidden",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect(
    page.getByRole("heading", { name: "Novo", exact: true }),
  ).toBeHidden();
  await expect(dialog.getByRole("button", { name: "Fechar" })).toBeFocused();
  await dialog.getByRole("button", { name: "Fechar" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("article")).toHaveCount(4);
  await expect(
    page.getByRole("tab", { name: "Novo 4", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
});

test("a detail outside the manager portfolio is presented as not found", async ({
  page,
}) => {
  await page.route("**/api/occurrences/*", (route) =>
    route.fulfill({ status: 404, json: { error: "Synthetic not found" } }),
  );
  await page.route("**/api/occurrences/queue", (route) =>
    route.fulfill({ json: queueFixture("all") }),
  );
  await mount(page, "connected");
  await page.getByRole("button", { name: "Abrir ocorrência #7704" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("alert")).toContainText(
    "Ocorrência não encontrada.",
  );
  await expect(
    dialog.getByRole("button", { name: "Tentar novamente" }),
  ).toHaveCount(0);
});
