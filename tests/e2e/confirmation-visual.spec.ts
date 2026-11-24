import { expect, test } from "@playwright/test";
import { createServer } from "vite";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { resolve } from "node:path";
import { writeFile } from "node:fs/promises";

let markup: string;

test.beforeAll(async () => {
  const server = await createServer({
    configFile: false,
    server: { middlewareMode: true, hmr: false },
    esbuild: { jsx: "automatic" },
    ssr: { noExternal: [/^next\/font\/google$/] },
    resolve: {
      alias: [
        { find: "next/navigation", replacement: "\0confirmation-navigation" },
        { find: "next/font/google", replacement: "\0confirmation-fonts" },
        {
          find: "@/components/signup-flow",
          replacement: "\0confirmation-context",
        },
        { find: "@", replacement: resolve("src") },
      ],
    },
    plugins: [
      {
        name: "confirmation-visual-fixtures",
        enforce: "pre",
        resolveId(id) {
          if (id.startsWith("\0confirmation-")) return id;
          if (
            id === "@/components/signup-flow" ||
            /\/src\/components\/signup-flow(?:\.tsx)?$/.test(id)
          )
            return "\0confirmation-context";
          if (id === "next/font/google") return "\0confirmation-fonts";
        },
        load(id) {
          if (id === "\0confirmation-navigation")
            return "export const useRouter = () => ({ replace() {} });";
          if (id === "\0confirmation-context")
            return 'export function useSignupFlow() { return { draft: { fullName: "Pessoa Exemplo", email: "pessoa@example.invalid", phone: "" } }; }';
          if (id === "\0confirmation-fonts")
            return 'export const Inter = () => ({ variable: "" }); export const Space_Grotesk = Inter; export const JetBrains_Mono = Inter;';
        },
      },
    ],
  });
  try {
    const loaded = await server.ssrLoadModule(
      "/src/app/confirmar-codigo/page.tsx",
    );
    markup = renderToString(createElement(loaded.default));
  } finally {
    await server.close();
  }
});

for (const width of [360, 390, 768, 1280]) {
  test(`confirmation presentation with test-only context at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 960 });
    await page.goto("/confirmar-codigo", { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate((html) => {
      const actual = document.querySelector('[data-slot~="screen"]')!;
      const fixture = document.createElement("div");
      fixture.innerHTML = html;
      const rendered = fixture.firstElementChild!;
      rendered.className = actual.className;
      actual.replaceWith(rendered);
    }, markup);
    await expect(page.getByText("pessoa@example.invalid")).toBeVisible();
    await page.getByLabel("Código").focus();
    await page.evaluate(() => window.scrollTo(0, 0));
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await expect(
      page.getByRole("link", { name: "Corrigir e-mail" }),
    ).toBeVisible();
    await page.mouse.move(0, 0);
    await page.locator('[data-slot~="card"]').screenshot({
      path: testInfo.outputPath(`confirmation-context-card-${width}.png`),
    });
    await page.locator('[data-slot~="form"]').screenshot({
      path: testInfo.outputPath(`confirmation-context-form-${width}.png`),
    });
    const measurements = await page.evaluate(() => {
      const result: Record<string, unknown> = {};
      for (const selector of [
        '[data-slot~="card"]',
        '[data-slot~="form"]',
        '[data-slot~="brand"]',
        '[data-slot~="title"]',
        '[data-slot~="description"]',
        '[data-slot~="label"]',
        '[data-slot~="input"]',
        '[data-slot~="submit"]',
        '[data-slot~="actions"]',
      ]) {
        const element = document.querySelector(selector)!;
        const style = getComputedStyle(element);
        result[selector] = {
          rect: element.getBoundingClientRect().toJSON(),
          font: style.font,
          padding: style.padding,
          margin: style.margin,
          border: style.border,
          gap: style.gap,
        };
      }
      return result;
    });
    await writeFile(
      testInfo.outputPath(`confirmation-context-${width}.json`),
      JSON.stringify(measurements, null, 2),
    );
    await page.screenshot({
      path: testInfo.outputPath(`confirmation-context-${width}.png`),
      fullPage: true,
    });
  });
}
