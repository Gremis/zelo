import { expect, test } from "@playwright/test";
import { build } from "vite";
import { resolve } from "node:path";
import { readdir } from "node:fs/promises";

let script: string;
let fontStylesheets: string;
test.beforeAll(async () => {
  fontStylesheets = (await readdir(resolve(".next/static/chunks")))
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
      alias: { "@": resolve("src"), "next/navigation": "\0visual-navigation" },
    },
    esbuild: { jsx: "automatic" },
    build: {
      write: false,
      lib: {
        entry: resolve("tests/e2e/fixtures/condominiums.tsx"),
        name: "CondominiumVisual",
        formats: ["iife"],
      },
      minify: false,
    },
    plugins: [
      {
        name: "condominium-visual-fixture",
        resolveId(id) {
          if (id.startsWith("\0visual-")) return id;
        },
        load(id) {
          if (id === "\0visual-navigation")
            return "const router = { replace() {}, refresh() {}, push() {}, prefetch() {} }; export const useRouter = () => router; export const useSearchParams = () => new URLSearchParams();";
        },
      },
    ],
  });
  const output = Array.isArray(result) ? result[0] : result;
  if (!("output" in output)) throw new Error("Unexpected fixture build output");
  const chunk = output.output.find((item) => item.type === "chunk");
  if (!chunk || chunk.type !== "chunk")
    throw new Error("Fixture bundle unavailable");
  script = chunk.code;
});

for (const width of [360, 700, 960, 1440, 1728]) {
  test(`condominium proportions and inline forms at ${width}px without database access`, async ({
    page,
  }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    let records = [
      {
        id: "one",
        name: "Condomínio de teste com nome extenso",
        address: "Endereço sintético longo para verificar a quebra de linha",
        slug: "teste-ab12",
        url: "http://127.0.0.1:3100/c/condominio-de-teste-com-nome-extenso-ab12",
      },
    ];
    await page.route("**/api/panel", (route) =>
      route.fulfill({
        json: {
          user: {
            name: "Pessoa Sintética",
            initials: "PS",
            condominiumCount: records.length,
          },
          firstSteps: { completed: ["condominium"], dismissed: false },
        },
      }),
    );
    await page.route("**/api/condominiums**", async (route) => {
      const request = route.request();
      if (request.method() === "GET")
        return route.fulfill({ json: { condominiums: records } });
      const fields = request.postDataJSON();
      if (request.method() === "PATCH") {
        records = records.map((item) =>
          item.id === "one" ? { ...item, ...fields } : item,
        );
        return route.fulfill({ json: { condominium: records[0] } });
      }
      const item = {
        ...records[0],
        ...fields,
        id: `new-${records.length}`,
        slug: `novo-${records.length}a12`,
        url: `http://127.0.0.1:3100/c/novo-${records.length}a12`,
      };
      records.push(item);
      return route.fulfill({ status: 201, json: { condominium: item } });
    });
    await page.setViewportSize({ width, height: width >= 1100 ? 742 : 900 });
    await page.goto("/login");
    await page.evaluate(() => document.fonts.ready);
    const presentation = await page.evaluate(() => ({
      htmlClass: document.documentElement.className,
      styles: Array.from(
        document.querySelectorAll('link[rel="stylesheet"], style'),
      )
        .map((node) => node.outerHTML)
        .join(""),
      font: getComputedStyle(document.querySelector("input")!).fontFamily,
    }));
    await page.setContent(
      `<!doctype html><html lang="pt-BR" class="${presentation.htmlClass}"><head>${presentation.styles}${fontStylesheets}</head><body><div id="visual-root" class="min-h-screen bg-[#f6f7f9] text-sm leading-[1.45] text-[#111827] [color-scheme:light] [&_:is(button,a):focus-visible]:outline-2 [&_:is(button,a):focus-visible]:outline-offset-4 [&_:is(button,a):focus-visible]:outline-teal-700"></div></body></html>`,
    );
    await page.locator("#visual-root").evaluate((node, font) => {
      node.style.fontFamily = font;
      node.style.setProperty(
        "--font-panel-heading",
        '"Space Grotesk", Inter, system-ui, sans-serif',
      );
      node.style.setProperty(
        "--font-condominium-code",
        '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
      );
    }, presentation.font);
    await page.addScriptTag({
      content:
        'globalThis.process = { env: { NODE_ENV: "production" }, browser: true };' +
        script,
    });
    const first = page.getByRole("article").first();
    await expect(first).toBeVisible();
    expect(errors).toEqual([]);
    await expect(page.getByText(records[0].url, { exact: true })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const metrics = await page.evaluate(() => {
      const sample = (node: Element) => {
        const style = getComputedStyle(node);
        return Object.fromEntries(
          [
            "fontFamily",
            "fontSize",
            "fontWeight",
            "lineHeight",
            "letterSpacing",
            "padding",
            "borderColor",
            "borderRadius",
            "gap",
          ].map((key) => [
            key,
            style.getPropertyValue(
              key.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`),
            ),
          ]),
        );
      };
      const article = document.querySelector("article")!;
      return {
        title: sample(document.querySelector("main h1")!),
        name: sample(article.querySelector("h2")!),
        address: sample(article.querySelector(":scope > p")!),
        link: sample(article.querySelector("div > p:nth-child(2)")!),
        card: sample(article),
        fonts: [...document.fonts]
          .filter((font) => font.status === "loaded")
          .map((font) => ({ family: font.family, weight: font.weight })),
      };
    });
    expect(metrics.title.fontFamily).toContain("Space Grotesk");
    expect(metrics.title).toMatchObject({
      fontSize: "24px",
      fontWeight: "700",
      lineHeight: "34.8px",
      letterSpacing: "-0.24px",
    });
    expect(metrics.name).toMatchObject({
      fontSize: "16px",
      fontWeight: "700",
      lineHeight: "23.2px",
    });
    expect(metrics.address).toMatchObject({
      fontSize: "13px",
      fontWeight: "400",
      lineHeight: "18.85px",
    });
    expect(metrics.link.fontFamily).toContain("JetBrains Mono");
    expect(metrics.link).toMatchObject({
      fontSize: "12.5px",
      fontWeight: "400",
      lineHeight: "18.125px",
    });
    expect(metrics.card).toMatchObject({
      padding: "16px",
      borderColor: "rgb(229, 231, 235)",
      borderRadius: "10px",
    });
    await testInfo.attach("computed-styles", {
      body: JSON.stringify(metrics, null, 2),
      contentType: "application/json",
    });
    const before = await first.boundingBox();
    if (width >= 1100) expect(before!.width).toBeLessThanOrEqual(261);
    await page.screenshot({
      path: testInfo.outputPath(`list-${width}.png`),
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Novo condomínio", exact: true })
      .click();
    await page.getByRole("button", { name: "Salvar e gerar link" }).click();
    await expect(page.getByLabel("Nome", { exact: true })).toBeFocused();
    await page.screenshot({
      path: testInfo.outputPath(`creation-validation-${width}.png`),
      fullPage: true,
    });
    await page
      .getByLabel("Nome", { exact: true })
      .fill("Nome sintético " + "A".repeat(100));
    await page
      .getByLabel("Endereço", { exact: true })
      .fill("Endereço sintético " + "B".repeat(200));
    await page.getByRole("button", { name: "Salvar e gerar link" }).click();
    await expect(page.getByRole("article")).toHaveCount(2);
    await expect(
      page.getByText("Pronto. Copie e envie este link aos moradores", {
        exact: true,
      }),
    ).toHaveCount(1);
    expect((await first.boundingBox())!.width).toBe(before!.width);
    await first.getByRole("button", { name: "Editar", exact: true }).click();
    await page.screenshot({
      path: testInfo.outputPath(`editing-${width}.png`),
      fullPage: true,
    });
    await page.getByRole("button", { name: "Salvar", exact: true }).click();
    await expect(
      first
        .getByRole("status")
        .filter({ hasText: "Condomínio atualizado. O link não mudou." }),
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath(`saved-${width}.png`),
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    if (width === 1440) {
      await page.clock.install();
      await page.evaluate(() =>
        Object.defineProperty(navigator, "clipboard", {
          configurable: true,
          value: {
            writeText: async (value: string) => {
              (window as unknown as { copiedLink: string }).copiedLink = value;
            },
          },
        }),
      );
      await first.getByRole("button", { name: "Copiar link" }).click();
      await expect(
        first.getByText("Link copiado", { exact: true }),
      ).toBeVisible();
      expect(
        await page.evaluate(
          () => (window as unknown as { copiedLink: string }).copiedLink,
        ),
      ).toBe(records[0].url);
      await page.clock.fastForward(5000);
      await expect(
        first.getByText("Link copiado", { exact: true }),
      ).toHaveCount(0);
    }
    for (let index = 0; index < 3; index++) {
      await page
        .getByRole("button", { name: "Novo condomínio", exact: true })
        .click();
      await page
        .getByLabel("Nome", { exact: true })
        .fill(`Condomínio sintético ${index}`);
      await page
        .getByLabel("Endereço", { exact: true })
        .fill("Endereço sintético");
      await page.getByRole("button", { name: "Salvar e gerar link" }).click();
      await expect(page.getByRole("article")).toHaveCount(index + 3);
    }
    const boxes = await page.getByRole("article").evaluateAll((nodes) =>
      nodes.map((node) => ({
        x: node.getBoundingClientRect().x,
        y: node.getBoundingClientRect().y,
      })),
    );
    const columns = width >= 1100 ? 4 : width >= 820 ? 3 : width >= 560 ? 2 : 1;
    expect(new Set(boxes.slice(0, columns).map((box) => box.x)).size).toBe(
      columns,
    );
    expect(boxes[columns].y).toBeGreaterThan(boxes[0].y);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}
