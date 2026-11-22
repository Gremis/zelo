import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  createClient,
  type SupabaseClient,
  type Session,
} from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { afterAll, beforeAll, expect, test, vi } from "vitest";
import { loadPortfolioQueue } from "@/server/occurrences/queue.service";
import {
  parsePortfolioQueue,
  type PortfolioQueue,
} from "@/server/occurrences/queue.contract";

vi.mock("server-only", () => ({}));

const origin = "http://127.0.0.1:3100";
const accounts: { id: string; client: SupabaseClient; cookie: string }[] = [];
const condos = [randomUUID(), randomUUID(), randomUUID()];
const ids = Array.from({ length: 12 }, () => randomUUID());
let admin: SupabaseClient;
let anon: SupabaseClient;

function sql(statement: string): string {
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
    throw new Error("Local queue fixture SQL failed.");
  }
}

function requireSuccess(value: unknown) {
  if (!value) throw new Error("Local queue fixture operation failed.");
}

async function cookie(url: string, key: string, session: Session) {
  const jar = new Map<string, string>();
  const client = createServerClient(url, key, {
    cookies: {
      getAll: () => [],
      setAll: (values) =>
        values.forEach(({ name, value }) => jar.set(name, value)),
    },
  });
  const result = await client.auth.setSession(session);
  requireSuccess(!result.error);
  return [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
}

async function response(index?: number, search = "") {
  return fetch(`${origin}/api/occurrences/queue${search}`, {
    headers: index === undefined ? {} : { cookie: accounts[index].cookie },
    redirect: "manual",
  });
}

async function queue(index = 0): Promise<PortfolioQueue> {
  const result = await response(index);
  expect(result.status).toBe(200);
  expect(result.headers.get("cache-control")).toBe(
    "private, no-store, max-age=0",
  );
  return parsePortfolioQueue(await result.json());
}

beforeAll(async () => {
  let config: Record<string, string>;
  try {
    config = JSON.parse(
      execFileSync("node_modules/.bin/supabase", ["status", "-o", "json"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }),
    );
    const ready = await response();
    requireSuccess(ready.status === 401);
  } catch {
    throw new Error(
      "Queue integration requires the local Supabase stack and a production server at 127.0.0.1:3100 using that stack.",
    );
  }
  if (
    config.API_URL !== "http://127.0.0.1:54321" ||
    !config.ANON_KEY ||
    !config.SERVICE_ROLE_KEY
  )
    throw new Error(
      "Only the project-local loopback Supabase stack is allowed.",
    );
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  admin = createClient(config.API_URL, config.SERVICE_ROLE_KEY, options);
  anon = createClient(config.API_URL, config.ANON_KEY, options);
  for (const manager of [true, true, true, false, true]) {
    const email = `ori75-${randomUUID()}@example.invalid`;
    const password = `Local${randomUUID()}9`;
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: "Synthetic queue account",
        is_sindico: manager,
      },
    });
    requireSuccess(!created.error && created.data.user);
    const client = createClient(config.API_URL, config.ANON_KEY, options);
    const account = { id: created.data.user!.id, client, cookie: "" };
    accounts.push(account);
    const login = await client.auth.signInWithPassword({ email, password });
    requireSuccess(!login.error && login.data.session);
    account.cookie = await cookie(
      config.API_URL,
      config.ANON_KEY,
      login.data.session!,
    );
  }
  sql(`begin;
    insert into public.condominiums(id,manager_id,name,address) values
    ('${condos[0]}','${accounts[0].id}','Synthetic queue A1','Synthetic address'),
    ('${condos[1]}','${accounts[0].id}','Synthetic queue A2','Synthetic address'),
    ('${condos[2]}','${accounts[1].id}','Synthetic queue B','Synthetic address');
    commit;`);
  const definitions = [
    [0, 0, "new", "normal", null, "2026-01-01", null],
    [1, 1, "new", "urgent", null, "2026-01-05", null],
    [2, 0, "new", "urgent", null, "2026-01-02", null],
    [3, 1, "new", "urgent", null, "2026-01-03", null],
    [4, 0, "new", "urgent", null, "2026-01-03", null],
    [5, 0, "new", "urgent", "low", "2026-01-01", null],
    [6, 1, "new", null, null, "2026-01-01", null],
    [7, 0, "in_progress", "urgent", null, "2026-01-02", null],
    [8, 1, "delegated", "normal", null, "2026-01-02", null],
    [9, 0, "completed", "normal", null, "2026-01-01", "2026-01-20"],
    [10, 1, "completed", "urgent", null, "2026-01-01", "2026-01-10"],
    [11, 2, "new", "urgent", null, "2026-01-01", null],
  ] as const;
  for (const [
    index,
    condominium,
    status,
    priority,
    final,
    registered,
    completed,
  ] of definitions) {
    const literal = (value: string | null) =>
      value === null ? "null" : `'${value}'`;
    sql(`insert into public.occurrences(id,condominium_id,origin,channel,description,status,location,reporter_name,reporter_phone,reporter_unit_or_role,internal_note,
      suggested_priority,suggestion_source,suggestion_reason,suggestion_at,final_priority,priority_decided_at,decided_priority,decided_suggested_priority,registered_at,completed_at)
      values ('${ids[index]}','${condos[condominium]}','public_form','web','Synthetic queue report ${index}','${status}',${priority ? "'Synthetic hall'" : "null"},'Synthetic reporter','11900000000','Synthetic unit','Sensitive internal note',
      ${literal(priority)},${priority ? "'rules'" : "null"},${priority ? "'Synthetic persisted reason'" : "null"},${priority ? "'2026-01-01'" : "null"},${literal(final)},${final ? "'2026-01-06'" : "null"},${literal(final)},${final ? literal(priority) : "null"},'${registered}',${literal(completed)});`);
  }
  sql(`insert into public.occurrences(condominium_id,origin,channel,description,status,registered_at,suggested_priority,suggestion_source,suggestion_reason,suggestion_at)
    select '${condos[0]}','manager_panel','phone','Synthetic batch '||s,'in_progress','2026-02-01','low','rules','Synthetic persisted reason','2026-02-01' from generate_series(1,1005) s;`);
}, 60_000);

afterAll(async () => {
  if (accounts.length) {
    sql(`begin;
      delete from public.occurrence_events where occurrence_id in (select id from public.occurrences where condominium_id in ('${condos.join("','")}'));
      delete from public.occurrences where condominium_id in ('${condos.join("','")}');
      delete from public.condominiums where id in ('${condos.join("','")}');
      commit;`);
  }
  for (const account of accounts) {
    const removed = await admin.auth.admin.deleteUser(account.id);
    requireSuccess(!removed.error);
  }
});

test("real HTTP and session RPC return all portfolio condominiums and all 1016 rows without truncation", async () => {
  const result = await queue();
  expect(result.columns.new.count).toBe(7);
  expect(result.columns.in_progress.count).toBe(1006);
  expect(result.columns.delegated.count).toBe(1);
  expect(result.columns.completed.count).toBe(2);
  expect(
    Object.values(result.columns).flatMap(({ items }) => items),
  ).toHaveLength(1016);
  expect(result.openByPriority).toEqual({
    urgent: 5,
    normal: 2,
    low: 1006,
    unclassified: 1,
  });
  const actualCondos = new Set(
    Object.values(result.columns).flatMap(({ items }) =>
      items.map((item) => item.condominium.id),
    ),
  );
  expect(actualCondos).toEqual(new Set([condos[0], condos[1]]));
  expect(await loadPortfolioQueue(accounts[0].client)).toEqual(result);
});

test("orders urgent before normal, older within priority, stable ties and unclassified last", async () => {
  const first = await queue();
  expect(first.columns.new.items.map(({ id }) => id)).toEqual([
    ids[2],
    ids[3],
    ids[4],
    ids[1],
    ids[0],
    ids[5],
    ids[6],
  ]);
  expect((await queue()).columns.new.items.map(({ id }) => id)).toEqual(
    first.columns.new.items.map(({ id }) => id),
  );
  expect(first.columns.in_progress.items[0].id).toBe(ids[7]);
});

test("completed uses newest completion first and includes completions older than seven days", async () => {
  const result = await queue();
  expect(result.columns.completed.items.map(({ id }) => id)).toEqual([
    ids[9],
    ids[10],
  ]);
  expect(
    result.columns.completed.items.every(
      ({ completedAt }) => Date.parse(completedAt!) < Date.now() - 7 * 86400000,
    ),
  ).toBe(true);
});

test("human decision prevails while the original suggestion and pending flag remain explicit", async () => {
  const rows = (await queue()).columns.new.items;
  expect(rows.find(({ id }) => id === ids[5])).toMatchObject({
    suggestedPriority: "urgent",
    finalPriority: "low",
    effectivePriority: "low",
    suggestionPending: false,
  });
  expect(rows.find(({ id }) => id === ids[1])).toMatchObject({
    suggestedPriority: "urgent",
    finalPriority: null,
    effectivePriority: "urgent",
    suggestionPending: true,
  });
  expect(rows.find(({ id }) => id === ids[6])).toMatchObject({
    suggestedPriority: null,
    effectivePriority: null,
    location: null,
    suggestionPending: false,
  });
});

test("empty portfolio is a valid all-zero queue", async () => {
  const result = await queue(2);
  expect(
    Object.values(result.columns).every(
      ({ count, items }) => count === 0 && items.length === 0,
    ),
  ).toBe(true);
  expect(result.openByPriority).toEqual({
    urgent: 0,
    normal: 0,
    low: 0,
    unclassified: 0,
  });
});

test("other portfolio remains isolated in HTTP, direct RPC and direct table access", async () => {
  const result = await queue(1);
  expect(result.columns.new.items.map(({ id }) => id)).toEqual([ids[11]]);
  expect(result.openByPriority.urgent).toBe(1);
  const direct = await loadPortfolioQueue(accounts[1].client);
  expect(direct).toEqual(result);
  const table = await accounts[1].client
    .from("occurrences")
    .select("id")
    .in("condominium_id", [condos[0], condos[1]]);
  requireSuccess(!table.error);
  expect(table.data).toEqual([]);
  const forged = await accounts[1].client.rpc("portfolio_occurrence_queue", {
    manager_id: accounts[0].id,
  });
  expect(forged.error?.code).toBe("PGRST202");
  expect((await response(1, `?manager_id=${accounts[0].id}`)).status).toBe(400);
});

test("response excludes private phone, tracking, notes and event payloads", async () => {
  const result = await response(0);
  const raw = await result.text();
  for (const value of [
    "reporter_phone",
    "reporterPhone",
    "tracking_code",
    "trackingCode",
    "internal_note",
    "internalNote",
    "Sensitive internal note",
    "11900000000",
    "author_phone",
    "priority_change_reason",
  ])
    expect(raw).not.toContain(value);
});

test("query does not write, reclassify or append history", async () => {
  const fingerprint = () =>
    sql(
      `select md5(jsonb_agg(to_jsonb(o) order by id)::text) from public.occurrences o where condominium_id in ('${condos.join("','")}');`,
    );
  const before = fingerprint();
  await queue();
  await loadPortfolioQueue(accounts[0].client);
  expect(fingerprint()).toBe(before);
  expect(
    sql(
      `select count(*) from public.occurrence_events where occurrence_id in (select id from public.occurrences where condominium_id in ('${condos.join("','")}'));`,
    ),
  ).toBe("0");
});

test("absent/invalid sessions yield 401 and a non-manager yields 403", async () => {
  expect((await response()).status).toBe(401);
  const invalid = await fetch(`${origin}/api/occurrences/queue`, {
    headers: { cookie: "sb-127-auth-token=invalid" },
  });
  expect(invalid.status).toBe(401);
  expect((await response(3)).status).toBe(403);
  const anonymous = await anon.rpc("portfolio_occurrence_queue");
  expect(anonymous.error?.code).toBe("42501");
  const resident = await accounts[3].client.rpc("portfolio_occurrence_queue");
  expect(resident.error?.code).toBe("42501");
});

test("unconfirmed and revoked real sessions cannot read via HTTP or direct RPC", async () => {
  const account = accounts[4];
  sql(
    `update auth.users set email_confirmed_at=null where id='${account.id}';`,
  );
  expect((await response(4)).status).toBe(401);
  expect(
    (await account.client.rpc("portfolio_occurrence_queue")).error?.code,
  ).toBe("28000");
  sql(
    `update auth.users set email_confirmed_at=clock_timestamp() where id='${account.id}'; delete from auth.sessions where user_id='${account.id}';`,
  );
  expect((await response(4)).status).toBe(401);
  expect(
    (await account.client.rpc("portfolio_occurrence_queue")).error?.code,
  ).toBe("28000");
});
