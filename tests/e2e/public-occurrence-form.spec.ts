import { expect, test, type Page } from "@playwright/test";
import {
  publicCondominiumFixture,
  publicRegistrationFixture,
} from "../fixtures/public-occurrence";

const path = "/api/public/condominiums/review-abcd";
async function mockLink(page: Page) {
  await page.route(`**${path}`, (route) =>
    route.fulfill({ json: publicCondominiumFixture }),
  );
}
async function fill(page: Page) {
  await page
    .getByRole("textbox", { name: "Seu nome" })
    .fill(publicRegistrationFixture.reporterName);
  await page
    .getByRole("textbox", { name: "Sua unidade" })
    .fill(publicRegistrationFixture.reporterUnitOrRole);
  await page
    .getByRole("textbox", { name: "Celular" })
    .fill(publicRegistrationFixture.reporterPhone);
  await page
    .getByRole("textbox", { name: "Onde fica o problema" })
    .fill(publicRegistrationFixture.location);
  await page
    .getByRole("textbox", { name: "O que aconteceu" })
    .fill(publicRegistrationFixture.description);
}

for (const width of [360, 768, 1280]) {
  test(`public form and confirmation are accessible at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await mockLink(page);
    const attempts: string[] = [];
    await page.route(`**${path}/occurrences`, async (route) => {
      attempts.push(route.request().headers()["idempotency-key"]);
      await route.fulfill({ json: { number: 1234 + attempts.length } });
    });
    await page.goto("/c/review-abcd");
    await expect(
      page.getByRole("heading", { name: publicCondominiumFixture.name }),
    ).toBeVisible();
    const name = page.getByRole("textbox", { name: "Seu nome" });
    await page.getByRole("button", { name: "Enviar ocorrência" }).click();
    await expect(name).toBeFocused();
    await expect(name).toHaveAccessibleDescription("Digite seu nome.");
    await name.pressSequentially("Ana");
    await expect(name).toBeFocused();
    await name.press("Tab");
    await expect(
      page.getByRole("textbox", { name: "Sua unidade" }),
    ).toBeFocused();
    await fill(page);
    const phone = page.getByRole("textbox", { name: "Celular" });
    await expect(phone).toHaveValue("(11) 90000-0000");
    await phone.fill("900000000");
    await page.getByRole("button", { name: "Enviar ocorrência" }).click();
    await expect(phone).toBeFocused();
    await expect(phone).toHaveAccessibleDescription(
      "Digite o celular com DDD.",
    );
    await phone.fill("");
    await phone.pressSequentially("11900000000");
    await expect(phone).toHaveValue("(11) 90000-0000");
    await page
      .context()
      .grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.evaluate(() => navigator.clipboard.writeText("(11) 90000-0000"));
    await phone.selectText();
    await phone.press("ControlOrMeta+V");
    await expect(phone).toHaveValue("(11) 90000-0000");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath(`form-${width}.png`),
      fullPage: true,
    });
    await page.getByRole("button", { name: "Enviar ocorrência" }).click();
    await expect(
      page.getByRole("heading", { name: "Ocorrência registrada" }),
    ).toBeFocused();
    await expect(page.getByText("#1235")).toBeVisible();
    await page.screenshot({
      path: info.outputPath(`confirmation-${width}.png`),
      fullPage: true,
    });
    await page.getByRole("button", { name: "Registrar outra" }).click();
    await expect(name).toHaveValue("");
    await expect(name).toBeFocused();
    await fill(page);
    await page.getByRole("button", { name: "Enviar ocorrência" }).click();
    await expect(page.getByText("#1236")).toBeVisible();
    expect(new Set(attempts).size).toBe(2);
  });
}

test("lookup loading, technical retry and unavailable link have distinct states", async ({
  page,
}) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(
    `**${path}`,
    async (route) => {
      await gate;
      await route.fulfill({ status: 503, json: {} });
    },
    { times: 1 },
  );
  await page.goto("/c/review-abcd");
  await expect(page.getByRole("status")).toHaveText("Carregando condomínio…");
  await expect(page.getByRole("form")).toHaveCount(0);
  release();
  await expect(
    page.getByRole("heading", {
      name: "Não foi possível carregar o condomínio",
    }),
  ).toBeVisible();
  await page.route(`**${path}`, (route) =>
    route.fulfill({ status: 404, json: {} }),
  );
  await page.getByRole("button", { name: "Tentar novamente" }).click();
  await expect(
    page.getByRole("heading", { name: "Link não encontrado" }),
  ).toBeVisible();
  await expect(page.getByRole("form")).toHaveCount(0);
});

test("long condominium names, addresses and server field errors never overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.route(`**${path}`, (route) =>
    route.fulfill({
      json: { name: "Condomínio".repeat(30), address: "Endereço".repeat(100) },
    }),
  );
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let writes = 0;
  await page.route(`**${path}/occurrences`, async (route) => {
    writes++;
    await gate;
    await route.fulfill({
      status: 400,
      json: {
        code: "invalid_input",
        fields: { location: "Confiraolocalinformado.".repeat(10) },
      },
    });
  });
  await page.goto("/c/review-abcd");
  await fill(page);
  await page.getByRole("button", { name: "Enviar ocorrência" }).click();
  await expect(
    page.getByRole("button", { name: "Enviando ocorrência…" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("heading", { name: "Ocorrência registrada" }),
  ).toHaveCount(0);
  await page
    .getByRole("form")
    .evaluate((form) => (form as HTMLFormElement).requestSubmit());
  expect(writes).toBe(1);
  release();
  const location = page.getByRole("textbox", { name: "Onde fica o problema" });
  await expect(location).toBeFocused();
  await expect(location).toHaveValue(publicRegistrationFixture.location);
  await expect(location).toHaveAttribute("aria-invalid", "true");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("network failure preserves the exact attempt, and conflict never silently resubmits", async ({
  page,
}) => {
  await mockLink(page);
  const attempts: { key: string; fields: unknown }[] = [];
  await page.route(`**${path}/occurrences`, async (route) => {
    attempts.push({
      key: route.request().headers()["idempotency-key"],
      fields: route.request().postDataJSON(),
    });
    if (attempts.length === 1) await route.abort("connectionreset");
    else await route.fulfill({ status: 409, json: { code: "conflict" } });
  });
  await page.goto("/c/review-abcd");
  await fill(page);
  await page.getByRole("button", { name: "Enviar ocorrência" }).click();
  await expect(
    page.getByRole("heading", { name: "Precisamos confirmar seu envio" }),
  ).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Seu nome" })).toHaveValue(
    "Ana",
  );
  await expect(page.getByRole("textbox", { name: "Seu nome" })).toBeDisabled();
  await page.getByRole("button", { name: "Recuperar envio original" }).click();
  await expect(
    page.getByRole("heading", {
      name: "Não foi possível confirmar esta tentativa",
    }),
  ).toBeVisible();
  expect(attempts).toHaveLength(2);
  expect(attempts[1]).toEqual(attempts[0]);
  await page.getByRole("button", { name: "Iniciar outro registro" }).click();
  await expect(page.getByText(/pode duplicar a ocorrência/)).toBeVisible();
  await page.getByRole("button", { name: "Manter tentativa original" }).click();
  expect(attempts).toHaveLength(2);
  expect(await page.evaluate(() => Object.keys(localStorage))).not.toContain(
    "Ana",
  );
});
