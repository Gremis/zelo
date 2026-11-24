import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, test, vi } from "vitest";
import { createOccurrenceEventService } from "@/server/occurrences/event.service";
import { createOccurrenceEventRepository } from "@/server/occurrences/event.repository";
import type { PublicRegistration } from "@/server/occurrences/contracts";

vi.mock("server-only", () => ({}));

const fixtureId = randomUUID();
const failureName = `ori74_${fixtureId.replaceAll("-", "")}`;
const service = createOccurrenceEventService(createOccurrenceEventRepository());
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
    throw new Error("Local priority integration SQL failed.");
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
      "Start the project-local Supabase stack before running priority integration tests.",
    );
  }
  if (
    config.API_URL !== "http://127.0.0.1:54321" ||
    !config.ANON_KEY ||
    !config.SERVICE_ROLE_KEY
  ) {
    throw new Error(
      "Priority integration tests require the expected loopback Supabase stack.",
    );
  }
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", config.API_URL);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", config.ANON_KEY);
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", config.SERVICE_ROLE_KEY);
  query(`begin;
    insert into auth.users(id,email) values (${quote(fixtureId)},${quote(`${fixtureId}@example.invalid`)});
    insert into public.condominiums(id,manager_id,name,address) values (${quote(fixtureId)},${quote(fixtureId)},'Synthetic priority integration','Synthetic address');
    commit;`);
  fixtureCreated = true;
  registration = {
    type: "registered",
    condominiumSlug: query(
      `select slug from public.condominiums where id=${quote(fixtureId)};`,
    ),
    reporterName: "Synthetic reporter",
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
      delete from public.occurrence_events where occurrence_id in (select id from public.occurrences where condominium_id=${quote(fixtureId)});
      delete from public.occurrences where condominium_id=${quote(fixtureId)};
      delete from public.condominiums where id=${quote(fixtureId)};
      delete from auth.users where id=${quote(fixtureId)};
      commit;`);
  } finally {
    vi.unstubAllEnvs();
  }
});

test.each([
  [
    "Hall",
    "Cheiro de gás no hall do 5º andar",
    "urgent",
    "Menciona gás: risco à segurança.",
  ],
  [
    "Hall",
    "Gasto alto com a conta de água",
    "normal",
    "Sem sinal de risco no relato.",
  ],
  [
    "GÁS",
    "Relato sem expressão de risco",
    "urgent",
    "Menciona gás: risco à segurança.",
  ],
  [
    "cheiro de",
    "QUEIMADO",
    "urgent",
    "Menciona cheiro de queimado: risco à segurança.",
  ],
  ["fogo", "ga\u0301s", "urgent", "Menciona gás: risco à segurança."],
  [
    "Hall",
    "Tomada dando   choque",
    "urgent",
    "Menciona dando choque: risco à segurança.",
  ],
])(
  "persists calculated priority atomically for %s / %s",
  async (location, description, priority, reason) => {
    const receipt = await service.registerPublic({
      ...registration,
      location,
      description,
    });
    const stored = JSON.parse(
      query(
        `select row_to_json(o) from public.occurrences o where id=${quote(receipt.occurrenceId)};`,
      ),
    );
    expect(stored).toMatchObject({
      location,
      description,
      suggested_priority: priority,
      suggestion_reason: reason,
      suggestion_source: "rules",
      final_priority: null,
      priority_decided_at: null,
      decided_suggested_priority: null,
      decided_priority: null,
      priority_change_reason: null,
      category: null,
      ai_failure_reason: null,
    });
    expect(Date.parse(stored.suggestion_at)).toBeGreaterThan(0);
    const events = JSON.parse(
      query(
        `select json_agg(e) from public.occurrence_events e where occurrence_id=${quote(receipt.occurrenceId)};`,
      ),
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      event_type: "registered",
      is_human_action: false,
      priority_snapshot: null,
      author_name: "Synthetic reporter",
    });
    expect(events[0].occurred_at).toBe(stored.registered_at);
  },
);

test("initial event failure leaves no occurrence, suggestion or partial history", async () => {
  const report = `Synthetic rollback ${fixtureId}`;
  query(`create function private.${failureName}() returns trigger language plpgsql set search_path='' as $$
    begin
      if exists (select 1 from public.occurrences where id=new.occurrence_id and description=${quote(report)}) then
        raise exception 'Synthetic initial event failure';
      end if;
      return new;
    end;
    $$;
    create trigger ${failureName} after insert on public.occurrence_events for each row when (new.event_type='registered') execute function private.${failureName}();`);
  const before = query(
    `select count(*) from public.occurrence_events e join public.occurrences o on o.id=e.occurrence_id where o.condominium_id=${quote(fixtureId)};`,
  );
  try {
    await expect(
      service.registerPublic({
        ...registration,
        location: "Gás",
        description: report,
      }),
    ).rejects.toMatchObject({ code: "unavailable" });
    expect(
      query(
        `select count(*) from public.occurrences where description=${quote(report)};`,
      ),
    ).toBe("0");
    expect(
      query(
        `select count(*) from public.occurrence_events e join public.occurrences o on o.id=e.occurrence_id where o.condominium_id=${quote(fixtureId)};`,
      ),
    ).toBe(before);
  } finally {
    query(
      `drop trigger ${failureName} on public.occurrence_events; drop function private.${failureName}();`,
    );
  }
});
