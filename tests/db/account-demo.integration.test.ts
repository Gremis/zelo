import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { chromium } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { afterAll, beforeAll, expect, test, vi } from "vitest";
import { prepareAccountDemo } from "@/server/demo/prepare";
import { parsePortfolioQueue } from "@/server/occurrences/queue.contract";
import data from "@/lib/demo/data.json";

vi.mock("server-only", () => ({}));
const origin = "http://localhost:3000";
const accounts: {
  id: string;
  email: string;
  password: string;
  client: SupabaseClient;
  cookie: string;
}[] = [];
const failureName = `demo_${randomUUID().replaceAll("-", "")}`;
let admin: SupabaseClient;
let baseline: string;

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
      {
        input: statement,
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      },
    ).trim();
  } catch {
    throw new Error("Local account demo SQL failed.");
  }
}
function existingSnapshot() {
  const ids = accounts.map(({ id }) => `'${id}'`).join(",") || "null";
  return (
    sql(
      `select md5(coalesce(string_agg(row_to_json(c)::text, '' order by c.id),'')) from public.condominiums c where manager_id not in (${ids});`,
    ) +
    sql(
      `select md5(coalesce(string_agg(row_to_json(o)::text, '' order by o.id),'')) from public.occurrences o join public.condominiums c on c.id=o.condominium_id where c.manager_id not in (${ids});`,
    )
  );
}
function requireSuccess(value: unknown) {
  if (!value) throw new Error("Synthetic account preparation failed.");
}
async function post(index: number) {
  return fetch(`${origin}/api/demo/prepare`, {
    method: "POST",
    headers: { cookie: accounts[index].cookie, origin },
  });
}
async function queue(index: number) {
  const response = await fetch(`${origin}/api/occurrences/queue`, {
    headers: { cookie: accounts[index].cookie },
  });
  expect(response.status).toBe(200);
  return parsePortfolioQueue(await response.json());
}
function counts(index: number) {
  const id = accounts[index].id;
  const result = sql(
    `select json_build_array(
      (select count(*) from public.condominiums where manager_id='${id}'),
      (select count(*) from public.occurrences o join public.condominiums c on c.id=o.condominium_id where c.manager_id='${id}'),
      (select count(*) from public.occurrence_events e join public.occurrences o on o.id=e.occurrence_id join public.condominiums c on c.id=o.condominium_id where c.manager_id='${id}')
    )`,
  );
  expect(
    Number(
      sql(
        `select count(*) from private.account_demo_occurrences where manager_id='${id}';`,
      ),
    ),
  ).toBe(JSON.parse(result)[1]);
  expect(
    sql(
      `select count(*) from public.occurrences o join public.condominiums c on c.id=o.condominium_id where c.manager_id='${id}' and (select count(*) from public.occurrence_events e where e.occurrence_id=o.id and e.event_type='registered') <> 1;`,
    ),
  ).toBe("0");
  return result;
}

beforeAll(async () => {
  const config = JSON.parse(
    execFileSync("node_modules/.bin/supabase", ["status", "-o", "json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }),
  );
  if (config.API_URL !== "http://127.0.0.1:54321")
    throw new Error("Only project-local Supabase is allowed.");
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  admin = createClient(config.API_URL, config.SERVICE_ROLE_KEY, options);
  vi.stubEnv("ACCOUNT_DEMO_ENABLED", "true");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", config.API_URL);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", config.ANON_KEY);
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", config.SERVICE_ROLE_KEY);
  for (const [confirmed, manager] of [
    [true, true],
    [true, true],
    [true, true],
    [true, true],
    [false, true],
    [true, false],
    [true, true],
    [true, true],
    [true, true],
  ]) {
    const email = `synthetic-demo-${randomUUID()}@example.invalid`;
    const password = `Synthetic${randomUUID()}9`;
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: confirmed,
      user_metadata: {
        full_name: "Synthetic demo validation",
        is_sindico: manager,
      },
    });
    requireSuccess(!created.error && created.data.user);
    const jar = new Map<string, string>();
    const client = createServerClient(config.API_URL, config.ANON_KEY, {
      cookies: {
        getAll: () => [],
        setAll: (values) =>
          values.forEach(({ name, value }) => jar.set(name, value)),
      },
    });
    const account = {
      id: created.data.user!.id,
      email,
      password,
      client,
      cookie: "",
    };
    accounts.push(account);
    if (confirmed) {
      const login = await client.auth.signInWithPassword({ email, password });
      requireSuccess(!login.error && login.data.session);
      account.cookie = [...jar]
        .map(([name, value]) => `${name}=${value}`)
        .join("; ");
    }
  }
  baseline = existingSnapshot();
  sql(`delete from private.account_demo where manager_id='${accounts[6].id}';
    update auth.users set created_at='2020-01-01' where id='${accounts[6].id}';
    update public.profiles set created_at='2020-01-01' where id='${accounts[6].id}';`);
});

afterAll(async () => {
  try {
    sql(
      `drop trigger if exists ${failureName} on public.occurrence_events; drop function if exists private.${failureName}();`,
    );
    if (baseline) expect(existingSnapshot()).toBe(baseline);
    for (const account of accounts) {
      await account.client.auth.signOut({ scope: "local" });
      sql(`begin;
        delete from private.account_demo_occurrences where manager_id='${account.id}';
        delete from private.account_demo_condominiums where manager_id='${account.id}';
        delete from private.account_demo where manager_id='${account.id}';
        delete from public.occurrence_events where occurrence_id in (select o.id from public.occurrences o join public.condominiums c on c.id=o.condominium_id where c.manager_id='${account.id}');
        delete from public.occurrences where condominium_id in (select id from public.condominiums where manager_id='${account.id}');
        delete from public.condominiums where manager_id='${account.id}';
        delete from auth.users where id='${account.id}'; commit;`);
    }
  } finally {
    vi.unstubAllEnvs();
  }
});

test("two fresh confirmed accounts receive separate real examples through POST, with real ordering and snapshots", async () => {
  for (const index of [0, 1]) {
    expect((await queue(index)).columns.new.count).toBe(0);
    const response = await post(index);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ready" });
    expect(JSON.parse(counts(index))).toEqual([2, 4, 4]);
    const result = await queue(index);
    expect(result.columns.new.count).toBe(4);
    expect(result.openByPriority).toEqual({
      urgent: 2,
      normal: 2,
      low: 0,
      unclassified: 0,
    });
    expect(
      new Set(result.columns.new.items.map((item) => item.condominium.id)).size,
    ).toBe(2);
    expect(result.columns.new.items.map((item) => item.description)).toEqual(
      [1, 3, 0, 2].map((i) => data.DEMO_OCCURRENCES[i].description),
    );
    expect(
      result.columns.new.items.every(
        (item) =>
          item.isDemo &&
          item.suggestionSource === "rules" &&
          item.finalPriority === null,
      ),
    ).toBe(true);
    expect(
      result.columns.new.items.map((item) => item.suggestionReason),
    ).toEqual([
      "Menciona gás: risco à segurança.",
      "Menciona dando choque: risco à segurança.",
      "Sem sinal de risco no relato.",
      "Sem sinal de risco no relato.",
    ]);
    const panel = await fetch(`${origin}/api/panel`, {
      headers: { cookie: accounts[index].cookie },
    });
    expect(panel.status).toBe(200);
    const payload = await panel.json();
    expect(payload.firstSteps.completed).toEqual([]);
    expect(payload.user.condominiumCount).toBe(0);
    expect(
      sql(
        `select bool_and(e.event_type='registered' and e.author_name=o.reporter_name and e.author_phone=o.reporter_phone and e.author_role=o.reporter_unit_or_role and e.occurred_at=o.registered_at and not e.is_human_action) from public.occurrence_events e join public.occurrences o on o.id=e.occurrence_id join private.account_demo_occurrences m on m.occurrence_id=o.id where m.manager_id='${accounts[index].id}';`,
      ),
    ).toBe("t");
  }
  const a = (await queue(0)).columns.new.items.map((item) => item.id);
  const b = (await queue(1)).columns.new.items.map((item) => item.id);
  expect(a.some((id) => b.includes(id))).toBe(false);
  const foreign = await accounts[1].client
    .from("occurrences")
    .select("id")
    .in("id", a);
  expect(foreign.error).toBeNull();
  expect(foreign.data).toEqual([]);
});

test("repetition and simultaneous preparation reuse all occurrence and event IDs", async () => {
  const before = (await queue(0)).columns.new.items.map((item) => item.id);
  const results = await Promise.all(Array.from({ length: 4 }, () => post(0)));
  expect(results.map((result) => result.status)).toEqual([200, 200, 200, 200]);
  expect((await queue(0)).columns.new.items.map((item) => item.id)).toEqual(
    before,
  );
  expect(JSON.parse(counts(0))).toEqual([2, 4, 4]);
  const fresh = await Promise.all(Array.from({ length: 4 }, () => post(2)));
  expect(fresh.map((result) => result.status)).toEqual([200, 200, 200, 200]);
  expect(JSON.parse(counts(2))).toEqual([2, 4, 4]);
});

test("an event failure rolls back that occurrence and manifest entry; retry preserves earlier IDs", async () => {
  sql(`create function private.${failureName}() returns trigger language plpgsql set search_path='' as $$ begin
    if exists (select 1 from public.occurrences o join public.condominiums c on c.id=o.condominium_id where o.id=new.occurrence_id and c.manager_id='${accounts[3].id}' and o.description='Exemplo sintético: cheiro de gás na cozinha.') then raise exception 'Synthetic failure'; end if; return new; end; $$;
    create trigger ${failureName} before insert on public.occurrence_events for each row execute function private.${failureName}();`);
  try {
    const result = await post(3);
    expect(result.status).toBe(503);
    expect(await result.json()).toEqual({
      error: "Não foi possível preparar os exemplos. Tente novamente.",
    });
    expect(JSON.parse(counts(3))).toEqual([2, 1, 1]);
  } finally {
    sql(
      `drop trigger ${failureName} on public.occurrence_events; drop function private.${failureName}();`,
    );
  }
  const before = (await queue(3)).columns.new.items[0].id;
  expect((await post(3)).status).toBe(200);
  expect(JSON.parse(counts(3))).toEqual([2, 4, 4]);
  expect(
    (await queue(3)).columns.new.items.some((item) => item.id === before),
  ).toBe(true);
});

test("disabled configuration makes no writes and never deletes existing examples", async () => {
  vi.stubEnv("ACCOUNT_DEMO_ENABLED", "false");
  expect(await prepareAccountDemo(accounts[7].id)).toEqual({
    status: "disabled",
  });
  expect(await prepareAccountDemo(accounts[0].id)).toEqual({
    status: "disabled",
  });
  expect(JSON.parse(counts(7))).toEqual([0, 0, 0]);
  expect(JSON.parse(counts(0))).toEqual([2, 4, 4]);
  vi.stubEnv("ACCOUNT_DEMO_ENABLED", "true");
});

test("unconfirmed, nonmanager and unauthenticated accounts cannot seed", async () => {
  expect((await post(4)).status).toBe(401);
  expect((await post(5)).status).toBe(403);
  await expect(prepareAccountDemo(accounts[4].id)).rejects.toThrow();
  for (const index of [4, 5])
    expect(JSON.parse(counts(index))).toEqual([0, 0, 0]);
  expect(
    (await fetch(`${origin}/api/demo/prepare`, { method: "POST" })).status,
  ).toBe(401);
  expect(
    (
      await fetch(`${origin}/api/demo/prepare`, {
        method: "POST",
        headers: { origin: "https://untrusted.invalid" },
      })
    ).status,
  ).toBe(403);
  const direct = await accounts[0].client.rpc("prepare_account_demo", {
    target_manager: accounts[1].id,
    fixtures: data.DEMO_CONDOMINIUMS,
  });
  expect(direct.error).not.toBeNull();
});

test("an unconfirmed account can resume only after email confirmation", async () => {
  const result = await admin.auth.admin.updateUserById(accounts[4].id, {
    email_confirm: true,
  });
  requireSuccess(!result.error);
  expect(await prepareAccountDemo(accounts[4].id)).toEqual({ status: "ready" });
  expect(JSON.parse(counts(4))).toEqual([2, 4, 4]);
});

test("old and new confirmed accounts receive real labeled cards without signing in again", async () => {
  expect(JSON.parse(counts(6))).toEqual([0, 0, 0]);
  expect(JSON.parse(counts(7))).toEqual([0, 0, 0]);
  const browser = await chromium.launch();
  try {
    for (const index of [6, 7]) {
      const context = await browser.newContext({
        viewport: { width: 1728, height: 1000 },
      });
      await context.addCookies(
        accounts[index].cookie.split("; ").map((part) => {
          const separator = part.indexOf("=");
          return {
            name: part.slice(0, separator),
            value: part.slice(separator + 1),
            url: origin,
            sameSite: "Lax" as const,
          };
        }),
      );
      const page = await context.newPage();
      let failOnce = index === 6;
      await page.route("**/api/demo/prepare", async (route) => {
        if (failOnce) {
          failOnce = false;
          await route.fulfill({
            status: 503,
            json: { error: "Synthetic preparation failure" },
          });
        } else await route.continue();
      });
      for (let iteration = 0; iteration < 2; iteration++) {
        const preparation = page.waitForResponse((response) =>
          response.url().endsWith("/api/demo/prepare"),
        );
        await page.goto(`${origin}/fila`);
        if (index === 6 && iteration === 0) {
          expect((await preparation).status()).toBe(503);
          await page
            .getByRole("alert")
            .filter({ hasText: "retomar com segurança" })
            .waitFor();
          expect(await page.getByRole("article").count()).toBe(0);
          const retry = page.waitForResponse((response) =>
            response.url().endsWith("/api/demo/prepare"),
          );
          await page
            .getByRole("button", { name: "Tentar novamente", exact: true })
            .click();
          expect((await retry).status()).toBe(200);
        } else expect((await preparation).status()).toBe(200);
        await page.getByText("Demo", { exact: true }).first().waitFor();
        expect(await page.getByRole("article").count()).toBe(4);
        expect(await page.getByText("Demo", { exact: true }).count()).toBe(4);
        expect(
          await page
            .getByLabel("Ocorrências abertas por prioridade")
            .textContent(),
        ).toBe("Urgente2Normal2Baixa0");
        expect(JSON.parse(counts(index))).toEqual([2, 4, 4]);
      }
      if (index === 7) {
        const before = (await queue(index)).columns.new.items.map(
          (item) => item.id,
        );
        await page
          .getByRole("button", { name: "Abrir menu", exact: true })
          .click();
        await page.getByRole("button", { name: "Sair", exact: true }).click();
        await page.waitForURL("**/login", { waitUntil: "commit" });
        await page.locator('input[name="email"]').fill(accounts[index].email);
        await page
          .locator('input[name="password"]')
          .fill(accounts[index].password);
        await page.getByRole("button", { name: "Entrar", exact: true }).click();
        await page.waitForURL("**/fila", { waitUntil: "commit" });
        await page.getByText("Demo", { exact: true }).first().waitFor();
        expect(await page.getByRole("article").count()).toBe(4);
        expect(
          await page
            .getByRole("heading", { name: "Primeiros passos", exact: true })
            .count(),
        ).toBe(0);
        const after = await page.evaluate(async () => {
          const result = await fetch("/api/occurrences/queue", {
            cache: "no-store",
          });
          return result.json();
        });
        expect(
          after.columns.new.items.map((item: { id: string }) => item.id),
        ).toEqual(before);
        expect(JSON.parse(counts(index))).toEqual([2, 4, 4]);
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }
});

test("preserves real condominiums and prevents client changes to demo provenance", async () => {
  const created = await accounts[1].client.rpc("create_condominium", {
    p_name: "Condomínio Sintético de Cadastro Real",
    p_address: "Endereço sintético de validação",
  });
  requireSuccess(!created.error && created.data);
  const before = await accounts[1].client
    .from("condominiums")
    .select("id,name,address,demo_dataset")
    .is("demo_dataset", null);
  expect(before.error).toBeNull();
  expect(before.data).toHaveLength(1);
  expect((await post(1)).status).toBe(200);
  const after = await accounts[1].client
    .from("condominiums")
    .select("id,name,address,demo_dataset")
    .is("demo_dataset", null);
  expect(after.data).toEqual(before.data);
  expect(JSON.parse(counts(1))).toEqual([3, 4, 4]);
  const panel = await fetch(`${origin}/api/panel`, {
    headers: { cookie: accounts[1].cookie },
  });
  const payload = await panel.json();
  expect(payload.user.condominiumCount).toBe(1);
  expect(payload.firstSteps.completed).toEqual(["condominium"]);
  const forged = await accounts[1].client
    .from("condominiums")
    .update({ demo_dataset: "ori76-v1" })
    .eq("id", before.data![0].id);
  expect(forged.error).not.toBeNull();
});

test("empty demo manifest preserves normal account deletion", async () => {
  sql(
    `insert into private.account_demo(manager_id) values ('${accounts[8].id}');`,
  );
  expect(
    sql(
      `select count(*) from private.account_demo where manager_id='${accounts[8].id}';`,
    ),
  ).toBe("1");
  const result = await admin.auth.admin.deleteUser(accounts[8].id);
  expect(result.error).toBeNull();
  expect(
    sql(
      `select count(*) from private.account_demo where manager_id='${accounts[8].id}';`,
    ),
  ).toBe("0");
});
