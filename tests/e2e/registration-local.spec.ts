import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { removeLocalAccountData } from "./local-database";
import { expect, test, type APIRequestContext } from "@playwright/test";

test.use({ trace: "off", video: "off", screenshot: "off" });
test.describe.configure({ mode: "serial" });
test.skip(
  process.env.ORI47_LOCAL_AUTH_TESTS !== "enabled",
  "Explicit local Supabase opt-in required.",
);

const syntheticEmails = new Set<string>();
function syntheticEmail() {
  const email = `ori47-${randomUUID()}@example.invalid`;
  syntheticEmails.add(email);
  return email;
}

test.afterEach(async ({ page }) => {
  if (!page.isClosed())
    await page
      .locator('input[type="password"], input[name="code"]')
      .evaluateAll((inputs) => {
        for (const input of inputs)
          if (input instanceof HTMLInputElement) input.value = "";
      });
  for (const email of syntheticEmails) {
    const id = localSql(`select id from auth.users where email = '${email}'`);
    if (id) removeLocalAccountData(id);
    localSql(
      `delete from private.email_confirmation_challenges where email = '${email}'; delete from auth.users where email = '${email}'`,
    );
  }
  syntheticEmails.clear();
});

function localSql(statement: string) {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL !== "http://127.0.0.1:54321")
    throw new Error("Local database target required.");
  return execFileSync(
    "docker",
    [
      "exec",
      "supabase_db_zelo-local",
      "psql",
      "-X",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-At",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      statement,
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  ).trim();
}

type CapturedMessage = { ID: string; To: { Address: string }[] };
async function capturedCode(
  mail: APIRequestContext,
  email: string,
  previousId?: string | string[],
) {
  let message: CapturedMessage | undefined;
  await expect
    .poll(async () => {
      const response = await mail.get("http://127.0.0.1:54324/api/v1/messages");
      if (!response.ok()) return false;
      const data = (await response.json()) as { messages: CapturedMessage[] };
      message = data.messages.find(
        (item) =>
          !(Array.isArray(previousId) ? previousId : [previousId]).includes(
            item.ID,
          ) && item.To.some((recipient) => recipient.Address === email),
      );
      return Boolean(message);
    })
    .toBe(true);
  if (!message) throw new Error("Local message missing.");
  const response = await mail.get(
    `http://127.0.0.1:54324/api/v1/message/${message.ID}`,
  );
  const content = (await response.json()) as { Text: string; HTML: string };
  const code = `${content.Text} ${content.HTML}`.match(/\b\d{6}\b/)?.[0];
  if (!code) throw new Error("Six-digit local code missing.");
  return { code, id: message.ID };
}

test.beforeAll(() => {
  if (existsSync("supabase/.smtp-manual/active"))
    throw new Error(
      "Restore Mailpit with npm run db:smtp:restore before automated Auth tests.",
    );
  let smtpHost;
  try {
    smtpHost = execFileSync(
      "docker",
      [
        "inspect",
        "--format",
        '{{range .Config.Env}}{{if eq (index (split . "=") 0) "GOTRUE_SMTP_HOST"}}{{.}}{{end}}{{end}}',
        "supabase_auth_zelo-local",
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    ).trim();
  } catch {
    throw new Error(
      "Unable to verify local Mailpit routing. No email tests were started.",
    );
  }
  if (smtpHost !== "GOTRUE_SMTP_HOST=supabase_inbucket_zelo-local")
    throw new Error(
      "Automated Auth tests require local Mailpit. Restore the default profile before testing.",
    );
  expect(
    process.env.NEXT_PUBLIC_SUPABASE_URL === "http://127.0.0.1:54321",
  ).toBe(true);
  expect(process.env.NEXT_PUBLIC_REGISTRATION_DEMO !== "enabled").toBe(true);
});

test("real local signup, email code, confirmed session, logout and password recovery", async ({
  page,
  request,
}) => {
  const email = syntheticEmail();
  const password = `Local${randomUUID()}9`;
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
  await page.getByRole("button", { name: "Criar conta", exact: true }).click();
  await expect(page).toHaveURL("/confirmar-codigo");
  expect((await page.request.get("/api/auth/session")).status()).toBe(401);
  expect((await page.request.get("/api/panel")).status()).toBe(401);
  expect(
    localSql(
      `select count(*) from public.profiles p join auth.users u on u.id = p.id where u.email = '${email}' and p.full_name = 'Pessoa Sintética' and p.phone = '21999990000' and u.email_confirmed_at is null`,
    ),
  ).toBe("1");
  expect(
    (
      await page.request.post("/api/auth/login", { data: { email, password } })
    ).status(),
  ).toBe(401);
  expect((await page.request.get("/api/auth/session")).status()).toBe(401);
  expect(
    (
      await request.post("/api/auth/resend-signup", {
        headers: { Origin: "https://other.example.invalid" },
        data: { email, registrationId: "11111111-1111-4111-8111-111111111111" },
      })
    ).status(),
  ).toBe(403);
  const blockedPage = await page.context().newPage();
  await blockedPage.goto("/fila");
  await expect(blockedPage).toHaveURL("/login");
  await blockedPage.close();
  const message = await capturedCode(request, email);
  const body = await page.request.post("/api/auth/resend-signup", {
    data: {
      email,
      registrationId: localSql(
        `select id from private.email_confirmation_challenges where email = '${email}'`,
      ),
    },
  });
  expect(body.status()).toBe(429);
  const wrong = message.code === "000000" ? "999999" : "000000";
  await page
    .getByRole("main")
    .getByLabel("Código", { exact: true })
    .fill(wrong);
  await page.getByRole("button", { name: "Confirmar e entrar" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Código incorreto ou expirado",
  );
  let confirmations = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/auth/confirm-signup")
      confirmations += 1;
  });
  await page.route(
    "**/api/auth/session",
    (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Unavailable" }),
      }),
    { times: 1 },
  );
  await page
    .getByRole("main")
    .getByLabel("Código", { exact: true })
    .fill(message.code);
  await page.getByRole("button", { name: "Confirmar e entrar" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Seu e-mail foi confirmado. Não foi possível verificar sua sessão.",
  );
  await expect(
    page.getByRole("main").getByLabel("Código", { exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Verificar sessão novamente" })
    .click();
  await expect(page).toHaveURL("/fila");
  expect(confirmations).toBe(1);
  let demoIds: string[] = [];
  if (process.env.ACCOUNT_DEMO_ENABLED === "true") {
    await expect(
      page.getByText("Dados de demonstração", { exact: true }),
    ).toHaveCount(4);
    const data = await (
      await page.request.get("/api/occurrences/queue")
    ).json();
    demoIds = data.columns.new.items
      .map((item: { id: string }) => item.id)
      .sort();
    expect(demoIds).toHaveLength(4);
    const panel = await (await page.request.get("/api/panel")).json();
    expect(panel.user.condominiumCount).toBe(0);
    expect(panel.firstSteps.completed).toEqual([]);
    await expect(
      page.getByRole("link", {
        name: "Cadastre zelador e porteiro de cada prédio",
      }),
    ).toHaveAttribute("href", "/funcionarios?novo=1");
  }
  await expect(
    page.getByRole("heading", { name: "Fila de ocorrências" }),
  ).toBeFocused();
  await expect(
    page.getByRole("heading", { name: "Primeiros passos" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Fila de ocorrências" }),
  ).toBeVisible();
  expect((await page.request.get("/api/panel")).status()).toBe(200);
  expect((await page.request.get("/api/auth/session")).status()).toBe(200);
  expect(
    await page.evaluate(() => [localStorage.length, sessionStorage.length]),
  ).toEqual([0, 0]);
  expect(new URL(page.url()).search).toBe("");
  const registrationId = localSql(
    `select id from private.email_confirmation_challenges where email = '${email}'`,
  );
  expect(
    (
      await request.post("/api/auth/confirm-signup", {
        data: { email, registrationId, code: message.code },
      })
    ).status(),
  ).toBe(400);
  await page.getByRole("button", { name: "Abrir menu" }).click();
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await expect(page).toHaveURL("/login");
  expect((await page.request.get("/api/panel")).status()).toBe(401);
  await page.goto("/fila");
  await expect(page).toHaveURL("/login");
  expect((await page.request.get("/api/auth/session")).status()).toBe(401);
  await page
    .getByRole("main")
    .getByLabel("E-mail", { exact: true })
    .fill(email);
  await page
    .getByRole("main")
    .getByLabel("Senha", { exact: true })
    .fill(password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL("/fila");
  await expect(
    page.getByRole("heading", { name: "Primeiros passos" }),
  ).toHaveCount(0);
  expect((await page.request.get("/api/panel")).status()).toBe(200);
  if (process.env.ACCOUNT_DEMO_ENABLED === "true") {
    await expect(
      page.getByText("Dados de demonstração", { exact: true }),
    ).toHaveCount(4);
    const data = await (
      await page.request.get("/api/occurrences/queue")
    ).json();
    expect(
      data.columns.new.items.map((item: { id: string }) => item.id).sort(),
    ).toEqual(demoIds);
    const panel = await (await page.request.get("/api/panel")).json();
    expect(panel.user.condominiumCount).toBe(0);
    expect(panel.firstSteps.completed).toEqual([]);
  }
  const login = await page.request.post("/api/auth/login", {
    data: { email, password },
  });
  expect(login.status()).toBe(200);
  expect(login.headers()["cache-control"]).toContain("no-store");
  expect(login.headers()["pragma"]).toBe("no-cache");
  expect(login.headers()["expires"]).toBe("0");
  await page.request.post("/api/auth/logout");
  await page.goto("/login");
  await page.getByRole("link", { name: "Esqueci minha senha" }).click();
  await expect(page).toHaveURL("/recuperar-senha");
  await page
    .getByRole("main")
    .getByLabel("E-mail", { exact: true })
    .fill(email);
  await page.getByRole("button", { name: "Enviar código" }).click();
  await expect(page).toHaveURL("/confirmar-codigo/recuperacao");
  const recovery = await capturedCode(request, email, message.id);
  const newPassword = `Changed${randomUUID()}8`;
  async function submitRecoveryCode(code: string, nextPassword = newPassword) {
    await page
      .getByRole("main")
      .getByLabel("Código", { exact: true })
      .fill(code);
    await page.getByRole("button", { name: "Continuar", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Crie uma nova senha" }),
    ).toBeFocused();
    await page
      .getByRole("main")
      .getByLabel("Nova senha", { exact: true })
      .fill(nextPassword);
    await page.getByRole("button", { name: "Salvar nova senha" }).click();
  }
  await submitRecoveryCode(recovery.code === "000000" ? "999999" : "000000");
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Código incorreto, expirado ou já utilizado",
  );
  expect((await page.request.get("/api/auth/session")).status()).toBe(401);
  localSql(
    `update auth.users set recovery_sent_at = now() - interval '16 minutes' where email = '${email}'`,
  );
  await submitRecoveryCode(recovery.code);
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Código incorreto, expirado ou já utilizado",
  );
  await page.getByRole("button", { name: "Reenviar código" }).click();
  await expect(page.getByRole("main").getByRole("status")).toContainText(
    "enviamos outro código",
  );
  const replacement = await capturedCode(request, email, [
    message.id,
    recovery.id,
  ]);
  expect(replacement.code === recovery.code).toBe(false);
  await submitRecoveryCode(recovery.code);
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Código incorreto, expirado ou já utilizado",
  );
  await submitRecoveryCode(replacement.code, password);
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "O código foi utilizado",
  );
  await expect(page.getByRole("button", { name: "Continuar" })).toBeDisabled();
  expect((await page.request.get("/api/auth/session")).status()).toBe(401);
  expect(
    (
      await request.post("/api/auth/reset-password", {
        data: { email, code: replacement.code, password: newPassword },
      })
    ).status(),
  ).toBe(401);
  localSql(
    `update auth.users set recovery_sent_at = now() - interval '61 seconds' where email = '${email}'`,
  );
  await page.getByRole("button", { name: "Reenviar código" }).click();
  await expect(page.getByRole("main").getByRole("status")).toContainText(
    "enviamos outro código",
  );
  const finalCode = await capturedCode(request, email, [
    message.id,
    recovery.id,
    replacement.id,
  ]);
  await submitRecoveryCode(finalCode.code);
  await expect(page).toHaveURL("/login");
  await expect(page.getByRole("main").getByRole("status")).toContainText(
    "Senha alterada. Entre com a nova senha.",
  );
  expect((await page.request.get("/api/auth/session")).status()).toBe(401);
  expect(
    (
      await request.post("/api/auth/reset-password", {
        data: { email, code: replacement.code, password: newPassword },
      })
    ).status(),
  ).toBe(401);
  await page
    .getByRole("main")
    .getByLabel("Senha", { exact: true })
    .fill(password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "E-mail ou senha incorretos",
  );
  await page
    .getByRole("main")
    .getByLabel("Senha", { exact: true })
    .fill(newPassword);
  await page.getByRole("main").getByLabel("Manter conectado").uncheck();
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL("/fila");
  let authCookies = (await page.context().cookies()).filter(({ name }) =>
    /^sb-.*-auth-token/.test(name),
  );
  expect(authCookies.length).toBeGreaterThan(0);
  expect(authCookies.every(({ expires }) => expires === -1)).toBe(true);
  const storedCookie = authCookies.map(({ value }) => value).join("");
  if (!storedCookie.startsWith("base64-"))
    throw new Error("Unexpected local cookie format.");
  const storedSession = JSON.parse(
    Buffer.from(storedCookie.slice(7), "base64url").toString("utf8"),
  );
  const previousRefresh = storedSession.refresh_token;
  storedSession.expires_at = Math.floor(Date.now() / 1000) - 10;
  const expiredCookie = `base64-${Buffer.from(JSON.stringify(storedSession)).toString("base64url")}`;
  let cookieOffset = 0;
  await page.context().addCookies(
    authCookies.map((cookie, index) => {
      const value =
        index === authCookies.length - 1
          ? expiredCookie.slice(cookieOffset)
          : expiredCookie.slice(
              cookieOffset,
              cookieOffset + cookie.value.length,
            );
      cookieOffset += cookie.value.length;
      return { ...cookie, value };
    }),
  );
  await page.reload();
  expect((await page.request.get("/api/auth/session")).status()).toBe(200);
  const renewedCookie = (await page.context().cookies())
    .filter(({ name }) => /^sb-.*-auth-token/.test(name))
    .map(({ value }) => value)
    .join("");
  const renewedSession = JSON.parse(
    Buffer.from(renewedCookie.slice(7), "base64url").toString("utf8"),
  );
  expect(renewedSession.refresh_token !== previousRefresh).toBe(true);
  authCookies = (await page.context().cookies()).filter(({ name }) =>
    /^sb-.*-auth-token/.test(name),
  );
  expect(authCookies.every(({ expires }) => expires === -1)).toBe(true);
  await page.getByRole("button", { name: "Abrir menu" }).click();
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await expect(page).toHaveURL("/login");
  await page
    .getByRole("main")
    .getByLabel("E-mail", { exact: true })
    .fill(email);
  await page
    .getByRole("main")
    .getByLabel("Senha", { exact: true })
    .fill(newPassword);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL("/fila");
  authCookies = (await page.context().cookies()).filter(({ name }) =>
    /^sb-.*-auth-token/.test(name),
  );
  expect(authCookies.every(({ expires }) => expires > Date.now() / 1000)).toBe(
    true,
  );
  expect(
    await page.evaluate(() => [localStorage.length, sessionStorage.length]),
  ).toEqual([0, 0]);
});

test("real resend replaces the code and keeps the original pending credentials", async ({
  request,
}) => {
  const email = syntheticEmail();
  const password = `Original${randomUUID()}7`;
  const signup = await request.post("/api/auth/signup", {
    data: {
      fullName: "Pessoa Original",
      email,
      phone: "21999990000",
      password,
      acceptedTerms: true,
    },
  });
  expect(signup.status()).toBe(201);
  const { registrationId, user } = (await signup.json()) as {
    registrationId: string;
    user: { id: string; email: string };
  };
  expect(typeof user.id).toBe("string");
  expect(user.email === email).toBe(true);
  const first = await capturedCode(request, email);
  localSql(
    `update private.email_confirmation_challenges set next_send_at = '-infinity' where email = '${email}'; update auth.users set confirmation_sent_at = now() - interval '61 seconds' where email = '${email}'`,
  );
  const repeat = await request.post("/api/auth/signup", {
    data: {
      fullName: "Outra Pessoa",
      email,
      phone: "11999990000",
      password: `Other${randomUUID()}8`,
      acceptedTerms: true,
    },
  });
  expect(repeat.status()).toBe(201);
  expect(
    localSql(
      `select count(*) from public.profiles p join auth.users u on p.id = u.id where u.email = '${email}' and p.full_name = 'Pessoa Original' and p.phone = '21999990000'`,
    ),
  ).toBe("1");
  const second = await capturedCode(request, email, first.id);
  if (first.code !== second.code)
    expect(
      (
        await request.post("/api/auth/confirm-signup", {
          data: { email, registrationId, code: first.code },
        })
      ).status(),
    ).toBe(400);
  localSql(
    `update private.email_confirmation_challenges set next_send_at = '-infinity' where email = '${email}'; update auth.users set confirmation_sent_at = now() - interval '61 seconds' where email = '${email}'`,
  );
  expect(
    (
      await request.post("/api/auth/resend-signup", {
        data: { email, registrationId },
      })
    ).status(),
  ).toBe(200);
  const third = await capturedCode(request, email, [first.id, second.id]);
  expect(third.code === second.code).toBe(false);
  expect(
    (
      await request.post("/api/auth/confirm-signup", {
        data: { email, registrationId, code: second.code },
      })
    ).status(),
  ).toBe(400);
  localSql(
    `update auth.users set confirmation_sent_at = now() - interval '16 minutes' where email = '${email}'`,
  );
  expect(
    (
      await request.post("/api/auth/confirm-signup", {
        data: { email, registrationId, code: third.code },
      })
    ).status(),
  ).toBe(400);
  expect((await request.get("/api/auth/session")).status()).toBe(401);
  localSql(
    `update auth.users set confirmation_sent_at = now() where email = '${email}'`,
  );
  expect(
    (
      await request.post("/api/auth/confirm-signup", {
        data: { email, registrationId, code: third.code },
      })
    ).status(),
  ).toBe(200);
  await request.post("/api/auth/logout");
  expect(
    (
      await request.post("/api/auth/login", { data: { email, password } })
    ).status(),
  ).toBe(200);
  localSql(
    `update private.email_confirmation_challenges set next_send_at = '-infinity' where email = '${email}'`,
  );
  const duplicate = await request.post("/api/auth/signup", {
    data: {
      fullName: "Pessoa Original",
      email,
      phone: "21999990000",
      password,
      acceptedTerms: true,
    },
  });
  expect(duplicate.status()).toBe(409);
  expect((await duplicate.json()).code).toBe("email_already_registered");
});

test("durable budget blocks parallel incorrect codes and survives resend", async ({
  request,
}) => {
  const email = syntheticEmail();
  const response = await request.post("/api/auth/signup", {
    data: {
      fullName: "Pessoa Sintética",
      email,
      phone: "21999990000",
      password: `Local${randomUUID()}9`,
      acceptedTerms: true,
    },
  });
  expect(response.status()).toBe(201);
  const { registrationId } = (await response.json()) as {
    registrationId: string;
  };
  const message = await capturedCode(request, email);
  const wrong = message.code === "000000" ? "999999" : "000000";
  const results = await Promise.all(
    Array.from({ length: 6 }, () =>
      request.post("/api/auth/confirm-signup", {
        data: { email, registrationId, code: wrong },
      }),
    ),
  );
  expect(results.every((result) => [400, 429].includes(result.status()))).toBe(
    true,
  );
  expect(
    localSql(
      `select failures from private.email_confirmation_challenges where email = '${email}'`,
    ),
  ).toBe("5");
  expect(
    (
      await request.post("/api/auth/confirm-signup", {
        data: { email, registrationId, code: message.code },
      })
    ).status(),
  ).toBe(429);
  expect(
    (
      await request.post("/api/auth/resend-signup", {
        data: { email, registrationId },
      })
    ).status(),
  ).toBe(429);
  localSql(
    `update private.email_confirmation_challenges set blocked_until = now() - interval '1 second', next_send_at = '-infinity' where email = '${email}'; update auth.users set confirmation_sent_at = now() - interval '61 seconds' where email = '${email}'`,
  );
  expect(
    (
      await request.post("/api/auth/confirm-signup", {
        data: { email, registrationId, code: message.code },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await request.post("/api/auth/resend-signup", {
        data: { email, registrationId },
      })
    ).status(),
  ).toBe(200);
  const next = await capturedCode(request, email, message.id);
  expect(
    (
      await request.post("/api/auth/confirm-signup", {
        data: { email, registrationId, code: next.code },
      })
    ).status(),
  ).toBe(200);
});
