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
  const condo = randomUUID();
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
    sql(
      `insert into condominiums(id,manager_id,name,address) values (${quote(condo)},${quote(accounts[0])},'Synthetic HTTP condominium','Synthetic address');`,
    );
    const slug = sql(`select slug from condominiums where id=${quote(condo)};`);
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
    expect(Object.keys(receipt)).toEqual(["number"]);
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
    const lostKey = randomUUID();
    const page = await contexts[1].newPage();
    await page.goto(`/c/${slug}`);
    let committedNumber: number | undefined;
    await page.route(
      `**${endpoint}/occurrences`,
      async (route) => {
        const response = await route.fetch();
        expect(response.status()).toBe(200);
        const confirmed = await response.json();
        expect(Object.keys(confirmed)).toEqual(["number"]);
        committedNumber = confirmed.number;
        await route.abort("connectionreset");
      },
      { times: 1 },
    );
    const outcome = await page.evaluate(
      async ({ endpoint, data, lostKey }) => {
        try {
          await fetch(`${endpoint}/occurrences`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Idempotency-Key": lostKey,
            },
            body: JSON.stringify(data),
          });
          return "unexpected_response";
        } catch {
          return "network_failure";
        }
      },
      { endpoint, data, lostKey },
    );
    expect(outcome).toBe("network_failure");
    expect(committedNumber).toBeGreaterThan(0);
    expect(
      sql(
        `select o.number from private.public_registration_attempts a join occurrences o on o.id=a.occurrence_id where a.condominium_id=${quote(condo)} and a.attempt_key=${quote(lostKey)};`,
      ),
    ).toBe(String(committedNumber));
    const recovered = await request.post(`${endpoint}/occurrences`, {
      headers: { "Idempotency-Key": lostKey },
      data,
    });
    expect(recovered.status()).toBe(200);
    expect(await recovered.json()).toEqual({ number: committedNumber });
    expect(
      sql(
        `select count(*) from occurrence_events e join occurrences o on o.id=e.occurrence_id where o.number=${committedNumber};`,
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
          (item: { number: number }) => item.number === receipt.number,
        ),
      ).toBe(i === 0);
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
