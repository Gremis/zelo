import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

test.use({ trace: "off", video: "off", screenshot: "off" });
test.skip(
  process.env.ORI59_LOCAL_TESTS !== "enabled",
  "Local Supabase opt-in required.",
);

function sql(statement: string) {
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
    throw new Error("Local public registration fixture failed.");
  }
}

function quote(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

test("anonymous HTTP registration and recovery stay independent from a signed-in manager and reach only the owner queue", async ({
  browser,
  request,
}) => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url !== "http://127.0.0.1:54321" || !key)
    throw new Error("Local configuration required.");
  const admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const accounts: string[] = [];
  const contexts = [];
  let condo = randomUUID();
  try {
    for (let i = 0; i < 2; i++) {
      const email = `ori59-http-${randomUUID()}@example.invalid`;
      const password = `Local${randomUUID()}9`;
      const result = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: "Synthetic manager", is_sindico: true },
      });
      if (result.error || !result.data.user)
        throw new Error("Local account fixture failed.");
      accounts.push(result.data.user.id);
      const context = await browser.newContext();
      contexts.push(context);
      expect(
        (
          await context.request.post("/api/auth/login", {
            data: { email, password },
          })
        ).status(),
      ).toBe(200);
    }
    const createdCondominium = await contexts[0].request.post(
      "/api/condominiums",
      {
        data: {
          name: "Synthetic HTTP condominium",
          address: "Synthetic address",
        },
      },
    );
    expect(createdCondominium.status()).toBe(201);
    const condominium = (await createdCondominium.json()).condominium;
    condo = condominium.id;
    const slug = condominium.slug;
    expect(condominium.url).toBe(`http://127.0.0.1:3100/c/${slug}`);
    const anonymous = await browser.newContext({
      viewport: { width: 360, height: 900 },
    });
    contexts.push(anonymous);
    const resident = await anonymous.newPage();
    await resident.goto(condominium.url);
    await expect(
      resident.getByRole("heading", { name: condominium.name }),
    ).toBeVisible();
    await expect(
      resident.getByText(condominium.address, { exact: true }),
    ).toBeVisible();
    await resident.getByRole("textbox", { name: "Seu nome" }).fill("Ana");
    await resident
      .getByRole("textbox", { name: "Sua unidade" })
      .fill("Apto 101");
    await resident
      .getByRole("textbox", { name: "Celular" })
      .fill("11900000000");
    await resident
      .getByRole("textbox", { name: "Onde fica o problema" })
      .fill("Hall");
    await resident
      .getByRole("textbox", { name: "O que aconteceu" })
      .fill("Lâmpada apagada");
    await resident.getByRole("button", { name: "Enviar ocorrência" }).click();
    await expect(
      resident.getByRole("heading", { name: "Ocorrência registrada" }),
    ).toBeFocused();
    const residentNumber = Number(
      (await resident.getByText(/^#[0-9]+$/).innerText()).slice(1),
    );
    expect(residentNumber).toBeGreaterThan(0);
    const stored = JSON.parse(
      sql(
        `select row_to_json(o) from occurrences o where number=${residentNumber};`,
      ),
    );
    expect(stored).toMatchObject({
      condominium_id: condo,
      status: "new",
      origin: "public_form",
      reporter_name: "Ana",
      reporter_unit_or_role: "Apto 101",
      created_by_profile_id: null,
    });
    await expect(
      resident.getByRole("link", { name: "Abrir acompanhamento" }),
    ).toHaveAttribute(
      "href",
      `https://sindicondo.app/o/${stored.tracking_code}`,
    );
    const privateNote = "Anotação interna sintética do síndico";
    expect(
      (
        await contexts[0].request.post(
          `/api/occurrences/${stored.id}/updates`,
          { data: { text: privateNote } },
        )
      ).status(),
    ).toBe(201);
    const tracking = await anonymous.newPage();
    const trackingResponse = await tracking.goto(
      `http://127.0.0.1:3100/o/${stored.tracking_code}`,
    );
    await expect(
      tracking.getByRole("heading", {
        name: new RegExp(`Ocorrência #${residentNumber} · registrada`),
      }),
    ).toBeVisible();
    await expect(
      tracking.getByRole("heading", { name: "Lâmpada apagada", exact: true }),
    ).toBeVisible();
    const trackingHtml = await trackingResponse!.text();
    expect(trackingHtml).not.toContain(privateNote);
    expect(trackingHtml).not.toContain("11900000000");
    await tracking.close();
    expect(
      sql(
        `select count(*) from occurrence_events where occurrence_id=${quote(stored.id)} and event_type='registered' and author_name='Ana' and author_phone='11900000000' and internal_description='Registrou a ocorrência pelo formulário. Unidade informada: Apto 101';`,
      ),
    ).toBe("1");
    await resident.getByRole("button", { name: "Registrar outra" }).click();
    await expect(
      resident.getByRole("textbox", { name: "Seu nome" }),
    ).toHaveValue("");
    await expect(
      resident.getByRole("heading", { name: condominium.name }),
    ).toBeVisible();
    const endpoint = `/api/public/condominiums/${slug}`;
    expect(await (await request.get(endpoint)).json()).toEqual({
      name: "Synthetic HTTP condominium",
      address: "Synthetic address",
    });
    expect(
      (await request.get("/api/public/condominiums/missing-abcd")).status(),
    ).toBe(404);
    const data = {
      reporterName: "Ana",
      reporterPhone: "11900000000",
      reporterUnitOrRole: "Porteiro",
      location: "Hall",
      description: "Cheiro de gás",
    };
    const headers = { "Idempotency-Key": randomUUID() };
    const first = await request.post(`${endpoint}/occurrences`, {
      headers,
      data,
    });
    expect(first.status()).toBe(200);
    const receipt = await first.json();
    expect(Object.keys(receipt).sort()).toEqual(["number", "trackingCode"]);
    expect(receipt.trackingCode).toMatch(/^[0-9a-f]{64}$/);
    const replay = await contexts[1].request.post(`${endpoint}/occurrences`, {
      headers,
      data,
    });
    expect(replay.status()).toBe(200);
    expect(await replay.json()).toEqual(receipt);
    expect(
      (
        await request.post(`${endpoint}/occurrences`, {
          headers,
          data: { ...data, status: "completed" },
        })
      ).status(),
    ).toBe(400);
    expect(
      (
        await request.post(`${endpoint}/occurrences`, {
          headers,
          data: { ...data, description: "Changed" },
        })
      ).status(),
    ).toBe(409);
    const second = await contexts[1].request.post(`${endpoint}/occurrences`, {
      headers: { "Idempotency-Key": randomUUID() },
      data,
    });
    expect(second.status()).toBe(200);
    const otherReceipt = await second.json();
    const snapshot = JSON.parse(
      sql(
        `select json_agg(e) from occurrence_events e join occurrences o on o.id=e.occurrence_id where o.number=${otherReceipt.number};`,
      ),
    );
    expect(snapshot).toHaveLength(1);
    expect(snapshot[0]).toMatchObject({
      author_name: "Ana",
      author_type: "reporter",
      author_profile_id: null,
    });
    const page = await contexts[1].newPage();
    await page.goto(condominium.url);
    let committedNumber: number | undefined;
    let committedTrackingCode = "";
    let lostKey = "";
    const attempts: { key: string; body: unknown }[] = [];
    await page.route(`**${endpoint}/occurrences`, async (route) => {
      attempts.push({
        key: route.request().headers()["idempotency-key"],
        body: route.request().postDataJSON(),
      });
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      const confirmed = await response.json();
      expect(Object.keys(confirmed).sort()).toEqual(["number", "trackingCode"]);
      expect(confirmed.trackingCode).toMatch(/^[0-9a-f]{64}$/);
      if (attempts.length === 1) {
        committedNumber = confirmed.number;
        committedTrackingCode = confirmed.trackingCode;
        lostKey = attempts[0].key;
        await route.abort("connectionreset");
      } else {
        expect(confirmed.trackingCode).toBe(committedTrackingCode);
        await route.fulfill({ response });
      }
    });
    await page.getByRole("textbox", { name: "Seu nome" }).fill("Ana");
    await page.getByRole("textbox", { name: "Sua unidade" }).fill("Porteiro");
    await page.getByRole("textbox", { name: "Celular" }).fill("11900000000");
    await page
      .getByRole("textbox", { name: "Onde fica o problema" })
      .fill("Hall");
    await page
      .getByRole("textbox", { name: "O que aconteceu" })
      .fill("Cheiro de gás");
    await page.getByRole("button", { name: "Enviar ocorrência" }).click();
    await expect(
      page.getByRole("heading", { name: "Precisamos confirmar seu envio" }),
    ).toBeFocused();
    expect(committedNumber).toBeGreaterThan(0);
    expect(
      sql(
        `select o.number from private.public_registration_attempts a join occurrences o on o.id=a.occurrence_id where a.condominium_id=${quote(condo)} and a.attempt_key=${quote(lostKey)};`,
      ),
    ).toBe(String(committedNumber));
    await page
      .getByRole("button", { name: "Recuperar envio original" })
      .click();
    await expect(
      page.getByRole("heading", { name: "Ocorrência registrada" }),
    ).toBeFocused();
    await expect(
      page.getByText(`#${committedNumber}`, { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Abrir acompanhamento" }),
    ).toHaveAttribute(
      "href",
      `https://sindicondo.app/o/${committedTrackingCode}`,
    );
    expect(attempts).toHaveLength(2);
    expect(attempts[1]).toEqual(attempts[0]);
    expect(
      sql(
        `select count(*) from occurrences where condominium_id=${quote(condo)} and description='Cheiro de gás' and number=${committedNumber};`,
      ),
    ).toBe("1");
    expect(
      sql(
        `select count(*) from occurrence_events e join occurrences o on o.id=e.occurrence_id where o.number=${committedNumber} and e.author_type='reporter' and e.author_profile_id is null and e.author_role='Porteiro';`,
      ),
    ).toBe("1");
    const occurrenceId = sql(
      `select id from occurrences where number=${committedNumber};`,
    );
    for (const path of [
      `/api/occurrences/${occurrenceId}`,
      "/api/occurrences/queue",
    ]) {
      const denied = await request.get(path);
      expect(denied.status()).toBe(401);
      expect(Object.keys(await denied.json())).toEqual(["error"]);
    }
    for (let i = 0; i < 2; i++) {
      const response = await contexts[i].request.get("/api/occurrences/queue");
      expect(response.status()).toBe(200);
      const queue = await response.json();
      expect(
        queue.columns.new.items.some(
          (item: { number: number }) => item.number === residentNumber,
        ),
      ).toBe(i === 0);
      const queuePage = await contexts[i].newPage();
      await queuePage.goto("/fila");
      await queuePage.reload();
      if (i === 0)
        await expect(
          queuePage.getByText(`#${residentNumber}`, { exact: true }),
        ).toBeVisible();
      else
        await expect(
          queuePage.getByText(`#${residentNumber}`, { exact: true }),
        ).toHaveCount(0);
    }
  } finally {
    for (const context of contexts) await context.close();
    sql(`begin;
      delete from private.public_registration_attempts where condominium_id=${quote(condo)};
      delete from occurrence_events where occurrence_id in (select id from occurrences where condominium_id=${quote(condo)});
      delete from occurrences where condominium_id=${quote(condo)};
      delete from condominiums where id=${quote(condo)};
      commit;`);
    for (const id of accounts) {
      const result = await admin.auth.admin.deleteUser(id);
      if (result.error) throw new Error("Local account cleanup failed.");
    }
  }
});
