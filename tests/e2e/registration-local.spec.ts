import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
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
  await page.getByLabel("Nome completo").fill("Pessoa Sintética");
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByLabel("Celular").fill("21999990000");
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Criar conta", exact: true }).click();
  await expect(page).toHaveURL("/confirmar-codigo");
  expect((await page.request.get("/api/auth/session")).status()).toBe(401);
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
  await page.getByLabel("Código", { exact: true }).fill(wrong);
  await page.getByRole("button", { name: "Confirmar e entrar" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Código incorreto ou expirado",
  );
  await page.getByLabel("Código", { exact: true }).fill(message.code);
  await page.getByRole("button", { name: "Confirmar e entrar" }).click();
  await expect(
    page.getByRole("heading", { name: "E-mail confirmado." }),
  ).toBeFocused();
  await expect(page.getByRole("status")).toHaveText(
    "E-mail confirmado. Conta criada.",
  );
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
  const logout = await page.request.post("/api/auth/logout");
  expect(logout.status()).toBe(200);
  expect((await page.request.get("/api/auth/session")).status()).toBe(401);
  const login = await page.request.post("/api/auth/login", {
    data: { email, password },
  });
  expect(login.status()).toBe(200);
  expect(login.headers()["cache-control"]).toContain("no-store");
  expect(login.headers()["pragma"]).toBe("no-cache");
  expect(login.headers()["expires"]).toBe("0");
  await page.request.post("/api/auth/logout");
  expect(
    (
      await request.post("/api/auth/forgot-password", { data: { email } })
    ).status(),
  ).toBe(200);
  const recovery = await capturedCode(request, email, message.id);
  const newPassword = `Changed${randomUUID()}8`;
  expect(
    (
      await request.post("/api/auth/reset-password", {
        data: { email, code: recovery.code, password: newPassword },
      })
    ).status(),
  ).toBe(200);
  await request.post("/api/auth/logout");
  expect(
    (
      await request.post("/api/auth/login", { data: { email, password } })
    ).status(),
  ).toBe(401);
  expect(
    (
      await request.post("/api/auth/login", {
        data: { email, password: newPassword },
      })
    ).status(),
  ).toBe(200);
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
