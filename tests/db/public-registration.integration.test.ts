import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, test, vi } from "vitest";
import { resolvePublicCondominium } from "@/server/occurrences/public.http";
import { POST } from "@/app/api/public/condominiums/[slug]/occurrences/route";
import { GET } from "@/app/api/public/condominiums/[slug]/route";
import type { PublicRegistration } from "@/server/occurrences/contracts";

vi.mock("server-only", () => ({}));

const fixtureId = randomUUID();
const failureName = `ori59_${fixtureId.replaceAll("-", "")}`;
let registration: PublicRegistration;
let fixtureCreated = false;

function quote(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function query(sql: string): string {
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
      { input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
    ).trim();
  } catch {
    throw new Error("Local public registration integration SQL failed.");
  }
}

beforeAll(() => {
  let config: Record<string, string>;
  try {
    config = JSON.parse(
      execFileSync("node_modules/.bin/supabase", ["status", "-o", "json"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }),
    );
  } catch {
    throw new Error(
      "Start the project-local Supabase stack before running public registration integration tests.",
    );
  }
  if (
    config.API_URL !== "http://127.0.0.1:54321" ||
    !config.ANON_KEY ||
    !config.SERVICE_ROLE_KEY
  ) {
    throw new Error(
      "Public registration integration tests require the expected loopback Supabase stack.",
    );
  }
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", config.API_URL);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", config.ANON_KEY);
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", config.SERVICE_ROLE_KEY);
  query(`begin;
    insert into auth.users(id,email) values (${quote(fixtureId)},${quote(`${fixtureId}@example.invalid`)});
    insert into public.condominiums(id,manager_id,name,address) values (${quote(fixtureId)},${quote(fixtureId)},'Synthetic public registration integration','Synthetic address');
    commit;`);
  fixtureCreated = true;
  registration = {
    type: "registered",
    condominiumSlug: query(
      `select slug from public.condominiums where id=${quote(fixtureId)};`,
    ),
    reporterName: "Ana",
    reporterPhone: "11900000000",
    reporterUnitOrRole: "Synthetic unit",
    location: "Hall",
    description: "Synthetic description",
  };
});

afterAll(() => {
  try {
    query(`drop trigger if exists ${failureName} on public.occurrence_events;
      drop function if exists private.${failureName}();`);
    if (fixtureCreated)
      query(`begin;
      delete from private.public_registration_attempts where condominium_id=${quote(fixtureId)};
      delete from public.occurrence_events where occurrence_id in (select id from public.occurrences where condominium_id=${quote(fixtureId)});
      delete from public.occurrences where condominium_id=${quote(fixtureId)};
      delete from public.condominiums where id=${quote(fixtureId)};
      delete from auth.users where id=${quote(fixtureId)};
      commit;`);
  } finally {
    vi.unstubAllEnvs();
  }
});

function payload(overrides: Record<string, unknown> = {}) {
  return {
    reporterName: registration.reporterName,
    reporterPhone: registration.reporterPhone,
    reporterUnitOrRole: registration.reporterUnitOrRole,
    location: registration.location,
    description: registration.description,
    ...overrides,
  };
}

function send(
  key: string = randomUUID(),
  overrides: Record<string, unknown> = {},
  slug = registration.condominiumSlug,
) {
  return POST(
    new Request("http://localhost/api/public", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": key,
        Cookie: "untrusted-session=ignored",
      },
      body: JSON.stringify(payload(overrides)),
    }),
    { params: Promise.resolve({ slug }) },
  );
}

test("resolves only presentation fields and handles missing and unavailable links", async () => {
  expect(await resolvePublicCondominium(registration.condominiumSlug)).toEqual({
    name: "Synthetic public registration integration",
    address: "Synthetic address",
  });
  expect((await send(randomUUID(), {}, "missing-abcd")).status).toBe(404);
  query(`update profiles set is_sindico=false where id=${quote(fixtureId)};`);
  try {
    expect((await send()).status).toBe(404);
    await expect(
      resolvePublicCondominium(registration.condominiumSlug),
    ).rejects.toMatchObject({ code: "not_found" });
  } finally {
    query(`update profiles set is_sindico=true where id=${quote(fixtureId)};`);
  }
});

test("validates fields and rejects forged authority without writes", async () => {
  const before = query(
    `select count(*) from occurrences where condominium_id=${quote(fixtureId)};`,
  );
  for (const field of [
    "reporterName",
    "reporterUnitOrRole",
    "location",
    "description",
    "reporterPhone",
  ]) {
    for (const value of [
      null,
      42,
      [],
      " \t\n",
      "x".repeat(field === "description" ? 10001 : 201),
      "bad\0value",
    ]) {
      const result = await send(randomUUID(), { [field]: value });
      expect(result.status).toBe(400);
      expect((await result.json()).fields).toHaveProperty(field);
    }
  }
  for (const field of [
    "condominiumId",
    "managerId",
    "status",
    "author",
    "suggestedPriority",
    "number",
    "registeredAt",
    "history",
    "toString",
  ]) {
    expect((await send(randomUUID(), { [field]: "forged" })).status).toBe(400);
  }
  for (const phone of ["900000000", "11000000000", "1190000000"]) {
    expect((await send(randomUUID(), { reporterPhone: phone })).status).toBe(
      400,
    );
  }
  expect((await send("invalid-key")).status).toBe(400);
  expect(
    query(
      `select count(*) from occurrences where condominium_id=${quote(fixtureId)};`,
    ),
  ).toBe(before);
});

test("persists reporter snapshot, initial event, priority and server-owned fields", async () => {
  const result = await send(randomUUID(), {
    reporterUnitOrRole: "Porteiro",
    description: "Cheiro de gás",
  });
  expect(result.status).toBe(200);
  const receipt = await result.json();
  expect(Object.keys(receipt)).toEqual(["number"]);
  const row = JSON.parse(
    query(
      `select row_to_json(o) from occurrences o where number=${receipt.number};`,
    ),
  );
  expect(row).toMatchObject({
    status: "new",
    origin: "public_form",
    created_by_profile_id: null,
    condominium_id: fixtureId,
    suggested_priority: "urgent",
    reporter_name: "Ana",
    reporter_unit_or_role: "Porteiro",
  });
  expect(Date.parse(row.registered_at)).toBeGreaterThan(Date.now() - 60000);
  const events = JSON.parse(
    query(
      `select json_agg(e) from occurrence_events e where occurrence_id=${quote(row.id)};`,
    ),
  );
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({
    author_name: "Ana",
    author_phone: "11900000000",
    author_type: "reporter",
    author_profile_id: null,
    internal_description:
      "Registrou a ocorrência pelo formulário. Unidade informada: Porteiro",
  });
});

test("sequential and concurrent retries return one committed number", async () => {
  const key = randomUUID();
  const first = await send(key);
  const receipt = await first.json();
  const retries = await Promise.all(Array.from({ length: 8 }, () => send(key)));
  for (const response of retries) {
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(receipt);
  }
  expect(
    query(`select count(*) from occurrences where number=${receipt.number};`),
  ).toBe("1");
  expect(
    query(
      `select count(*) from occurrence_events e join occurrences o on o.id=e.occurrence_id where o.number=${receipt.number};`,
    ),
  ).toBe("1");
  const concurrentKey = randomUUID();
  const countFixtureRows = () =>
    JSON.parse(
      query(`select json_build_array(
    (select count(*) from occurrences where condominium_id=${quote(fixtureId)}),
    (select count(*) from occurrence_events e join occurrences o on o.id=e.occurrence_id where o.condominium_id=${quote(fixtureId)})
  );`),
    ) as [number, number];
  const beforeConcurrent = countFixtureRows();
  const simultaneous = await Promise.all(
    Array.from({ length: 8 }, () => send(concurrentKey)),
  );
  const numbers = await Promise.all(
    simultaneous.map(async (response) => {
      expect(response.status).toBe(200);
      return (await response.json()).number;
    }),
  );
  expect(new Set(numbers).size).toBe(1);
  expect(countFixtureRows()).toEqual(
    beforeConcurrent.map((count) => count + 1),
  );
  expect(
    query(
      `select count(*) from private.public_registration_attempts a join occurrences o on o.id=a.occurrence_id where a.condominium_id=${quote(fixtureId)} and a.attempt_key=${quote(concurrentKey)} and o.number=${numbers[0]};`,
    ),
  ).toBe("1");
  expect(
    query(
      `select count(*) from occurrence_events e join occurrences o on o.id=e.occurrence_id where o.number=${numbers[0]};`,
    ),
  ).toBe("1");
  expect((await send(key, { description: "Changed" })).status).toBe(409);
  expect(await (await send(key)).json()).toEqual(receipt);
  expect((await (await send()).json()).number).not.toBe(receipt.number);
});

test("event failure rolls back occurrence and attempt and permits retry", async () => {
  const key = randomUUID();
  query(`create function private.${failureName}() returns trigger language plpgsql as $$ begin raise exception 'Controlled failure'; end; $$;
    create trigger ${failureName} after insert on public.occurrence_events for each row when (new.author_name='Ana') execute function private.${failureName}();`);
  try {
    const result = await send(key, { description: "ORI59 rollback sentinel" });
    expect(result.status).toBe(503);
    expect(await result.json()).toEqual({
      code: "unavailable",
      error: "Serviço temporariamente indisponível.",
    });
    expect(
      query(
        "select count(*) from occurrences where description='ORI59 rollback sentinel';",
      ),
    ).toBe("0");
    expect(
      query(
        `select count(*) from private.public_registration_attempts where attempt_key=${quote(key)};`,
      ),
    ).toBe("0");
  } finally {
    query(
      `drop trigger ${failureName} on public.occurrence_events; drop function private.${failureName}();`,
    );
  }
  expect(
    (await send(key, { description: "ORI59 rollback sentinel" })).status,
  ).toBe(200);
});

test("queue RPC isolates public registrations by portfolio", async () => {
  const other = randomUUID();
  const session = randomUUID();
  const otherSession = randomUUID();
  query(`insert into auth.users(id,email,email_confirmed_at) values (${quote(other)},${quote(`${other}@example.invalid`)},now());
    update auth.users set email_confirmed_at=now() where id=${quote(fixtureId)};
    insert into auth.sessions(id,user_id) values (${quote(session)},${quote(fixtureId)}),(${quote(otherSession)},${quote(other)});`);
  try {
    const receipt = await (await send()).json();
    const read = (id: string, sid: string) =>
      JSON.parse(
        query(`begin;
      set local role authenticated;
      do $$ begin perform set_config('request.jwt.claims', '${JSON.stringify({ sub: id, session_id: sid, role: "authenticated" })}', true); end $$;
      select public.portfolio_occurrence_queue()->'columns'->'new'->'items';
      rollback;`),
      );
    expect(
      read(fixtureId, session).some(
        (item: { number: number }) => item.number === receipt.number,
      ),
    ).toBe(true);
    expect(
      read(other, otherSession).some(
        (item: { number: number }) => item.number === receipt.number,
      ),
    ).toBe(false);
  } finally {
    query(
      `delete from auth.sessions where id in (${quote(session)},${quote(otherSession)}); delete from auth.users where id=${quote(other)};`,
    );
  }
});

test("numbers are globally unique under concurrency and keys are scoped by condominium", async () => {
  const second = randomUUID();
  query(
    `insert into public.condominiums(id,manager_id,name,address) values (${quote(second)},${quote(fixtureId)},'Synthetic second condominium','Synthetic address');`,
  );
  const slug = query(
    `select slug from condominiums where id=${quote(second)};`,
  );
  try {
    const key = randomUUID();
    const responses = await Promise.all([
      send(key),
      send(key, {}, slug),
      ...Array.from({ length: 8 }, (_, i) =>
        send(randomUUID(), {}, i % 2 ? slug : registration.condominiumSlug),
      ),
    ]);
    const receipts = await Promise.all(
      responses.map(async (response) => {
        expect(response.status).toBe(200);
        return response.json();
      }),
    );
    expect(new Set(receipts.map((item) => item.number)).size).toBe(10);
    expect(await (await send(key, {}, slug)).json()).toEqual(receipts[1]);
    expect(await (await send(key)).json()).toEqual(receipts[0]);
    expect(
      query(
        `select condominium_id from occurrences where number=${receipts[0].number};`,
      ),
    ).toBe(fixtureId);
    expect(
      query(
        `select condominium_id from occurrences where number=${receipts[1].number};`,
      ),
    ).toBe(second);
  } finally {
    query(`begin;
      delete from private.public_registration_attempts where condominium_id=${quote(second)};
      delete from occurrence_events where occurrence_id in (select id from occurrences where condominium_id=${quote(second)});
      delete from occurrences where condominium_id=${quote(second)};
      delete from condominiums where id=${quote(second)};
      commit;`);
  }
});

test("GET distinguishes backend failure from unavailable links without disclosing internals", async () => {
  const context = {
    params: Promise.resolve({ slug: registration.condominiumSlug }),
  };
  const result = await GET(new Request("http://localhost"), context);
  expect(result.status).toBe(200);
  expect(Object.keys(await result.json()).sort()).toEqual(["address", "name"]);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:1");
  try {
    const failed = await GET(new Request("http://localhost"), context);
    expect(failed.status).toBe(503);
    expect(await failed.json()).toEqual({
      code: "unavailable",
      error: "Serviço temporariamente indisponível.",
    });
  } finally {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  }
});

test("public credentials cannot write private tables or execute the privileged RPC", async () => {
  const config = JSON.parse(
    execFileSync("node_modules/.bin/supabase", ["status", "-o", "json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }),
  );
  const result = await fetch(
    "http://127.0.0.1:54321/rest/v1/rpc/register_public_occurrence_attempt",
    {
      method: "POST",
      headers: {
        apikey: config.ANON_KEY,
        Authorization: `Bearer ${config.ANON_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        condominium_slug: registration.condominiumSlug,
        attempt_key: randomUUID(),
        reporter_name: "Ana",
        reporter_phone: "11900000000",
        reporter_unit_or_role: "Porteiro",
        description: "Synthetic",
        location: "Hall",
        calculated_priority: "normal",
        calculated_reason: "Sem sinal de risco no relato.",
        calculated_source: "rules",
      }),
    },
  );
  expect(result.status).toBe(401);
  expect(
    query(
      "select has_table_privilege('anon','public.occurrences','insert') or has_table_privilege('anon','public.occurrence_events','insert') or has_table_privilege('anon','private.public_registration_attempts','select') or has_table_privilege('anon','public.occurrences','select') or has_table_privilege('anon','public.occurrence_events','select');",
    ),
  ).toBe("f");
});
