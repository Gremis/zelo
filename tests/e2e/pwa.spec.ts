import { expect, test, type Page } from "@playwright/test";

async function controlled(page: Page) {
  await page.goto("/login");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect
    .poll(() =>
      page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
    )
    .toBe(true);
}

async function cacheEntries(page: Page) {
  return page.evaluate(async () => {
    const names = (await caches.keys()).filter((name) =>
      name.startsWith("sindicondo-pwa-offline-"),
    );
    return Promise.all(
      names.map(async (name) => ({
        name,
        paths: (await (await caches.open(name)).keys()).map(
          (request) => new URL(request.url).pathname,
        ),
      })),
    );
  });
}

test("provides an installable manifest, native icons, and the existing login entry", async ({
  page,
  context,
}) => {
  await controlled(page);
  await expect(page).toHaveTitle("Sindicondo");
  await expect(page.locator("html")).toHaveAttribute("lang", "pt-BR");
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    "href",
    "/manifest.webmanifest",
  );
  const response = await page.request.get("/manifest.webmanifest");
  expect(response.headers()["content-type"]).toContain(
    "application/manifest+json",
  );
  const manifest = await response.json();
  expect(manifest).toMatchObject({
    name: "Sindicondo",
    short_name: "Sindicondo",
    lang: "pt-BR",
    start_url: "/login",
    scope: "/",
    display: "standalone",
  });
  for (const icon of [
    ...manifest.icons,
    { src: "/icons/apple-touch-icon.png" },
  ]) {
    const response = await page.request.get(icon.src);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("image/png");
  }
  const session = await context.newCDPSession(page);
  const { installabilityErrors } = await session.send(
    "Page.getInstallabilityErrors",
  );
  expect(installabilityErrors).toEqual([]);
  const worker = await page.request.get("/sw.js");
  expect(worker.headers()["cache-control"]).toContain("no-store");
  expect(worker.headers()["content-type"]).toContain("javascript");
  expect(worker.headers()["set-cookie"]).toBeUndefined();
});

test("keeps only a public offline page, excludes APIs, and does not turn network failures into success", async ({
  page,
  context,
}) => {
  await controlled(page);
  await context.route("**/api/pwa-private-probe", (route) =>
    route.fulfill({ json: { value: "synthetic-private-response" } }),
  );
  await page.evaluate(async () => {
    await fetch("/api/pwa-private-probe");
  });
  await expect
    .poll(() => cacheEntries(page))
    .toEqual([{ name: "sindicondo-pwa-offline-v1", paths: ["/offline.html"] }]);
  await page.getByRole("link", { name: "Esqueci minha senha" }).click();
  await expect(page).toHaveURL("/recuperar-senha");
  await expect(
    page.getByRole("heading", { name: "Recuperar senha", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "E-mail", exact: true })
    .fill("person@example.invalid");
  await context.unroute("**/api/pwa-private-probe");
  await context.setOffline(true);
  await expect(page.getByRole("status")).toContainText("sem conexão");
  await page.getByRole("button", { name: /enviar/i }).click();
  await expect(page.getByRole("textbox", { name: "E-mail" })).toBeVisible();
  await expect(page.getByRole("status")).not.toContainText("enviaremos");
  const failed = await page.evaluate(async () => {
    try {
      await fetch("/api/pwa-private-probe");
      return false;
    } catch {
      return true;
    }
  });
  expect(failed).toBe(true);
  const response = await page.goto("/criar-conta");
  expect(response?.status()).toBe(503);
  await expect(
    page.getByRole("heading", { name: "Sem conexão" }),
  ).toBeVisible();
  await expect(page.locator("form")).toHaveCount(0);
  expect(await cacheEntries(page)).toEqual([
    { name: "sindicondo-pwa-offline-v1", paths: ["/offline.html"] },
  ]);
  await context.setOffline(false);
  await page.getByRole("link", { name: "Tentar novamente" }).click();
  await expect(
    page.getByRole("heading", { name: "Criar conta" }),
  ).toBeVisible();
});

test("cleans its old caches while preserving unrelated caches", async ({
  page,
}) => {
  await page.goto("/offline.html");
  await page.evaluate(async () => {
    await (
      await caches.open("sindicondo-pwa-offline-old")
    ).put("/offline.html", new Response("old public fallback"));
    await (
      await caches.open("unrelated-cache")
    ).put("/public-sentinel", new Response("public sentinel"));
  });
  await controlled(page);
  const names = await page.evaluate(() => caches.keys());
  expect(names).not.toContain("sindicondo-pwa-offline-old");
  expect(names).toContain("unrelated-cache");
  await page.evaluate(async () => {
    await (
      await caches.open("sindicondo-pwa-offline-v1")
    ).put("/offline.html", new Response("outdated public fallback"));
  });
  await page.reload();
  await expect
    .poll(() =>
      page.evaluate(async () =>
        (
          await (
            await caches.open("sindicondo-pwa-offline-v1")
          ).match("/offline.html")
        )?.text(),
      ),
    )
    .toContain("Sem conexão");

  expect(await cacheEntries(page)).toEqual([
    { name: "sindicondo-pwa-offline-v1", paths: ["/offline.html"] },
  ]);
});

for (const width of [360, 1280]) {
  test(`offline guidance remains readable and keyboard accessible at ${width}px`, async ({
    page,
    context,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await controlled(page);
    await context.setOffline(true);
    await page.goto("/login");
    await expect(
      page.getByRole("heading", { name: "Sem conexão" }),
    ).toBeVisible();
    await page.keyboard.press("Tab");
    await expect(
      page.getByRole("link", { name: "Tentar novamente" }),
    ).toBeFocused();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`pwa-offline-${width}.png`),
      fullPage: true,
    });
  });
}

test("reopens a fresh window offline without restoring personalized content or an API response", async ({
  page,
  context,
}) => {
  await controlled(page);
  await page.close();
  await context.setOffline(true);
  const reopened = await context.newPage();
  const response = await reopened.goto("/login");
  expect(response?.status()).toBe(503);
  await expect(
    reopened.getByRole("heading", { name: "Sem conexão" }),
  ).toBeVisible();
  await expect(reopened.locator("input")).toHaveCount(0);
  const api = await context.newPage();
  await expect(api.goto("/api/auth/login")).rejects.toThrow();
  await api.close();
  await context.setOffline(false);
  await reopened.getByRole("link", { name: "Tentar novamente" }).click();
  await expect(
    reopened.getByRole("heading", { name: "Entrar", exact: true }),
  ).toBeVisible();
});

test("does not simulate signup, confirmation, or resend success offline when mocks are explicitly enabled", async ({
  page,
  context,
}) => {
  const mocksEnabled =
    ["local", "development"].includes(process.env.NEXT_PUBLIC_APP_ENV ?? "") &&
    process.env.NEXT_PUBLIC_REGISTRATION_DEMO === "enabled";
  test.skip(!mocksEnabled, "Explicit registration mock environment required.");
  await controlled(page);
  await page.goto("/criar-conta");
  await page.getByLabel("Nome completo").fill("Pessoa Exemplo");
  await page
    .getByRole("textbox", { name: "E-mail", exact: true })
    .fill("person@example.invalid");
  await page.getByLabel("Celular").fill("21999990000");
  await page.getByLabel("Senha", { exact: true }).fill("Example123");
  await page.getByRole("checkbox").check();
  await context.setOffline(true);
  await expect(page.getByRole("status")).toContainText("sem conexão");
  await page.getByRole("button", { name: "Criar conta", exact: true }).click();
  await expect(page.getByLabel("Senha", { exact: true })).toHaveValue(
    "Example123",
  );
  await expect(page).toHaveURL("/criar-conta");
  await context.setOffline(false);
  await page.getByRole("button", { name: "Criar conta", exact: true }).click();
  await expect(page).toHaveURL("/confirmar-codigo");
  await context.setOffline(true);
  await expect(
    page.getByRole("button", { name: "Reenviar código" }),
  ).toBeDisabled();
  await page
    .getByRole("textbox", { name: "Código", exact: true })
    .fill("123456");
  await page.getByRole("button", { name: "Confirmar e entrar" }).click();
  await expect(
    page.getByRole("button", { name: "Confirmar e entrar" }),
  ).toBeEnabled();
  await expect(
    page.getByRole("heading", { name: "Conta criada." }),
  ).toHaveCount(0);
  await context.setOffline(false);
  await expect(
    page.getByRole("heading", { name: "Confirme seu e-mail" }),
  ).toBeVisible();
});

test("serves the Sindicondo favicon and Apple icon without starter metadata", async ({
  page,
}) => {
  await page.goto("/login");
  await expect(page).toHaveTitle("Sindicondo");
  await expect(page.locator('meta[name="application-name"]')).toHaveAttribute(
    "content",
    "Sindicondo",
  );
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    "content",
    "Gestão de condomínios e ocorrências.",
  );
  const icons = await page
    .locator('link[rel="icon"]')
    .evaluateAll((links) =>
      links.map((link) => (link as HTMLLinkElement).href),
    );
  expect(icons.every((url) => new URL(url).pathname === "/favicon.ico")).toBe(
    true,
  );
  expect(icons.length).toBeGreaterThan(0);
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute(
    "href",
    "/icons/apple-touch-icon.png",
  );
  const favicon = await page.request.get("/favicon.ico");
  expect(favicon.status()).toBe(200);
  const data = await favicon.body();
  expect(data.readUInt16LE(2)).toBe(1);
  expect(data.readUInt16LE(4)).toBe(3);
  expect([0, 1, 2].map((index) => data[6 + 16 * index])).toEqual([16, 32, 48]);
  for (const path of [
    "/",
    "/criar-conta",
    "/confirmar-codigo",
    "/recuperar-senha",
  ]) {
    await page.goto(path);
    await expect(page).toHaveTitle("Sindicondo");
    await expect(page.locator('meta[name="description"]')).not.toHaveAttribute(
      "content",
      /create next app|generated by/i,
    );
  }
  await page.goto("/offline.html");
  await expect(page).toHaveTitle("Sem conexão | Sindicondo");
});
