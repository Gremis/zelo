import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type APIRequestContext } from "@playwright/test";

test.use({ trace: "off", video: "off", screenshot: "off" });
test.skip(
  process.env.ORI47_LOCAL_AUTH_TESTS !== "enabled",
  "Explicit local Supabase opt-in required.",
);

function sql(statement: string) {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL !== "http://127.0.0.1:54321")
    throw new Error("Local database required.");
  try {
    return execFileSync(
      "docker",
      [
        "exec",
        "-i",
        "supabase_db_zelo-local",
        "psql",
        "-X",
        "-qAt",
        "-v",
        "ON_ERROR_STOP=1",
        "-U",
        "postgres",
        "-d",
        "postgres",
      ],
      { input: statement, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
    ).trim();
  } catch {
    throw new Error("Local onboarding verification failed.");
  }
}

async function emailCode(request: APIRequestContext, email: string) {
  let id: string | undefined;
  await expect
    .poll(async () => {
      const response = await request.get(
        "http://127.0.0.1:54324/api/v1/messages",
      );
      if (!response.ok()) return false;
      const body = await response.json();
      id = body.messages.find(
        (item: { ID: string; To: { Address: string }[] }) =>
          item.To.some((recipient) => recipient.Address === email),
      )?.ID;
      return !!id;
    })
    .toBe(true);
  const response = await request.get(
    `http://127.0.0.1:54324/api/v1/message/${id}`,
  );
  const body = await response.json();
  const code = `${body.Text} ${body.HTML}`.match(/\b\d{6}\b/)?.[0];
  if (!code) throw new Error("Local confirmation code unavailable.");
  return code;
}

test("real signup dismissal persists across navigation, reload, login and devices without completing steps", async ({
  page,
  request,
  browser,
}) => {
  test.setTimeout(60000);
  let panelReads = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/panel") panelReads++;
  });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url !== "http://127.0.0.1:54321" || !key)
    throw new Error("Local configuration required.");
  const admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const email = `onboarding-${randomUUID()}@example.invalid`;
  const otherEmail = `onboarding-other-${randomUUID()}@example.invalid`;
  const password = `Local${randomUUID()}9`;
  const secondDevice = await browser.newContext();
  const otherAccount = await browser.newContext();
  try {
    await page.goto("/criar-conta");
    await page
      .getByRole("main")
      .getByLabel("Nome completo")
      .fill("Pessoa Sintética");
    await page
      .getByRole("main")
      .getByLabel("E-mail", { exact: true })
      .fill(email);
    await page.getByRole("main").getByLabel("Celular").fill("21999990000");
    await page
      .getByRole("main")
      .getByLabel("Senha", { exact: true })
      .fill(password);
    await page.getByRole("checkbox").check();
    await page
      .getByRole("button", { name: "Criar conta", exact: true })
      .click();
    await expect(page).toHaveURL("/confirmar-codigo");
    await page
      .getByLabel("Código", { exact: true })
      .fill(await emailCode(request, email));
    await page.getByRole("button", { name: "Confirmar e entrar" }).click();
    await expect(page).toHaveURL("/fila");
    const steps = page.getByRole("region", { name: "Primeiros passos" });
    await expect(steps).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Dispensar", exact: true }),
    ).toBeEnabled();
    expect(panelReads).toBe(1);
    const notice = page.getByText("E-mail confirmado. Conta criada.", {
      exact: true,
    });
    await expect(notice).toBeVisible();
    const topBefore = await notice.boundingBox();
    await expect(notice).toHaveCount(0, { timeout: 12000 });
    const topAfter = await steps.boundingBox();
    expect(topBefore).not.toBeNull();
    expect(topAfter).not.toBeNull();
    expect(Math.abs(topAfter!.y - topBefore!.y)).toBeLessThan(2);
    const before = await (await page.request.get("/api/panel")).json();
    expect(before.firstSteps).toEqual({ completed: [], dismissed: false });
    expect(
      (await request.post("/api/panel/first-steps/dismiss")).status(),
    ).toBe(401);
    await page.getByRole("button", { name: "Dispensar", exact: true }).click();
    await expect(steps).toHaveCount(0);
    const after = await (await page.request.get("/api/panel")).json();
    expect(after.firstSteps).toEqual({ completed: [], dismissed: true });
    expect(
      sql(
        `select first_steps_dismissed_at is not null from profiles p join auth.users u on p.id=u.id where u.email='${email}';`,
      ),
    ).toBe("t");
    await page.getByRole("button", { name: "Abrir menu" }).click();
    await page.getByRole("link", { name: "Condomínios", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Nenhum condomínio por enquanto" }),
    ).toBeVisible();
    await expect(
      page.getByText("Cadastre seu primeiro condomínio para começar."),
    ).toBeVisible();
    const condos = await page.request.get("/api/condominiums");
    expect(condos.status()).toBe(200);
    expect(await condos.json()).toEqual({ condominiums: [] });
    await page.getByRole("button", { name: "Abrir menu" }).click();
    await page
      .getByRole("link", { name: "Fila de ocorrências", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Fila de ocorrências" }),
    ).toBeVisible();
    await expect(steps).toHaveCount(0);
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Fila de ocorrências" }),
    ).toBeVisible();
    await expect(steps).toHaveCount(0);

    expect(
      (
        await secondDevice.request.post("/api/auth/login", {
          data: { email, password },
        })
      ).status(),
    ).toBe(200);
    expect(
      (await (await secondDevice.request.get("/api/panel")).json()).firstSteps,
    ).toEqual({ completed: [], dismissed: true });
    const devicePage = await secondDevice.newPage();
    await devicePage.goto("/fila");
    await expect(
      devicePage.getByRole("heading", { name: "Fila de ocorrências" }),
    ).toBeVisible();
    await expect(
      devicePage.getByRole("heading", { name: "Primeiros passos" }),
    ).toHaveCount(0);

    const other = await admin.auth.admin.createUser({
      email: otherEmail,
      password,
      email_confirm: true,
      user_metadata: { full_name: "Outra Pessoa", is_sindico: true },
    });
    if (other.error) throw new Error("Local account fixture failed.");
    expect(
      (
        await otherAccount.request.post("/api/auth/login", {
          data: { email: otherEmail, password },
        })
      ).status(),
    ).toBe(200);
    expect(
      (await (await otherAccount.request.get("/api/panel")).json()).firstSteps,
    ).toEqual({ completed: [], dismissed: false });
    expect((await page.request.post("/api/auth/logout")).status()).toBe(200);
    expect(
      (
        await page.request.post("/api/auth/login", {
          data: { email, password },
        })
      ).status(),
    ).toBe(200);
    await page.goto("/fila");
    await expect(steps).toHaveCount(0);
    expect(
      (await (await page.request.get("/api/panel")).json()).firstSteps,
    ).toEqual({ completed: [], dismissed: true });
  } finally {
    await secondDevice.close();
    await otherAccount.close();
    sql(
      `delete from private.email_confirmation_challenges where email in ('${email}','${otherEmail}'); delete from auth.users where email in ('${email}','${otherEmail}');`,
    );
  }
});
