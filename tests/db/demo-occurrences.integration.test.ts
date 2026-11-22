import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { beforeAll, expect, test, vi } from "vitest";
import { occurrenceEvents } from "@/server/occurrences/event.factory";
import { detectRisk } from "@/lib/occurrences/risk-rules";
import { parsePortfolioQueue } from "@/server/occurrences/queue.contract";
import {
  localContext,
  loadDemo,
  quote,
} from "../../scripts/demo-occurrences.mjs";
import {
  DEMO_KEY,
  DEMO_EMAIL,
  DEMO_OCCURRENCES,
} from "../../scripts/demo-occurrences.data.mjs";

vi.mock("server-only", () => ({}));
let context: ReturnType<typeof localContext>;
let password: string;

function cases() {
  return JSON.parse(
    context.sql(
      `select json_agg(f order by fixture_key) from local_demo.occurrences f where fixture_key like '${DEMO_KEY}:%';`,
    ),
  ) as {
    fixture_key: string;
    input: Parameters<ReturnType<typeof occurrenceEvents>["registerPublic"]>[0];
    occurrence_id: string | null;
    event_id: number | null;
  }[];
}

beforeAll(() => {
  context = localContext();
  const supplied =
    process.env.ZELO_DEMO_PASSWORD ??
    parseEnv(readFileSync(".env.demo.local", "utf8")).ZELO_DEMO_PASSWORD;
  if (!supplied || cases().length !== 4)
    throw new Error(
      "Prepare the dedicated demo account and run the manual local loader before validating it.",
    );
  password = supplied;
});

test("a registration failure rolls back occurrence and manifest together, preserving existing history", async () => {
  const values = cases();
  const target =
    DEMO_OCCURRENCES.map(({ key }) =>
      values.find(({ fixture_key }) => fixture_key === `${DEMO_KEY}:${key}`)!,
    ).find(({ occurrence_id }) => !occurrence_id) ?? values[0];
  const before = context.sql(
    `select count(*) from public.occurrences where condominium_id in (select condominium_id from local_demo.condominiums where fixture_key like '${DEMO_KEY}:%');`,
  );
  context.sql(`create or replace function local_demo.test_fail_event() returns trigger language plpgsql set search_path='' as $$
    begin
      if exists (select 1 from local_demo.occurrences f where f.fixture_key=${quote(target.fixture_key)} and f.occurrence_id=new.occurrence_id) then raise exception 'Synthetic demo interruption'; end if;
      return new;
    end; $$;
    create trigger ori76_test_failure after insert on public.occurrence_events for each row when(new.event_type='registered') execute function local_demo.test_fail_event();`);
  try {
    if (target.occurrence_id) {
      const old = Object.fromEntries(
        [
          "NEXT_PUBLIC_SUPABASE_URL",
          "NEXT_PUBLIC_SUPABASE_ANON_KEY",
          "SUPABASE_SERVICE_ROLE_KEY",
        ].map((key) => [key, process.env[key]]),
      );
      try {
        process.env.NEXT_PUBLIC_SUPABASE_URL = context.config.API_URL;
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = context.config.ANON_KEY;
        process.env.SUPABASE_SERVICE_ROLE_KEY = context.config.SERVICE_ROLE_KEY;
        await expect(
          occurrenceEvents().registerPublic(target.input),
        ).rejects.toMatchObject({ code: "unavailable" });
      } finally {
        for (const [key, value] of Object.entries(old))
          if (value === undefined) delete process.env[key];
          else process.env[key] = value;
      }
    } else {
      await expect(loadDemo(context, password)).rejects.toThrow(
        "Registration did not commit",
      );
    }
    expect(cases()).toEqual(values);
    expect(
      context.sql(
        `select count(*) from public.occurrences where condominium_id in (select condominium_id from local_demo.condominiums where fixture_key like '${DEMO_KEY}:%');`,
      ),
    ).toBe(before);
  } finally {
    context.sql(
      "drop trigger ori76_test_failure on public.occurrence_events; drop function local_demo.test_fail_event();",
    );
  }
});

test("resumes pending fixtures even when the real service response is lost after commit", async () => {
  const before = cases();
  const pending = before.filter(({ occurrence_id }) => !occurrence_id).length;
  const result = await loadDemo(context, password, {
    register: async (
      input: Parameters<
        ReturnType<typeof occurrenceEvents>["registerPublic"]
      >[0],
    ) => {
      await occurrenceEvents().registerPublic(input);
      throw new Error("Synthetic response lost after commit");
    },
  });
  expect(result).toMatchObject({
    created: 0,
    recovered: pending,
    reused: 4 - pending,
    pending: 0,
    urgent: 2,
    normal: 2,
  });
  expect(
    cases().every(({ occurrence_id, event_id }) => occurrence_id && event_id),
  ).toBe(true);
});

test("the actual CLI reuses all four records without changing occurrence or event identifiers", () => {
  const before = cases();
  const output = execFileSync(
    process.execPath,
    [
      "--experimental-transform-types",
      "--conditions=react-server",
      "scripts/db-demo.mjs",
      "--local",
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  expect(JSON.parse(output.trim())).toMatchObject({
    created: 0,
    reused: 4,
    recovered: 0,
    pending: 0,
    urgent: 2,
    normal: 2,
  });
  expect(cases()).toEqual(before);
});

async function queue(email: string) {
  const jar = new Map<string, string>();
  const client = createServerClient(
    context.config.API_URL,
    context.config.ANON_KEY,
    {
      cookies: {
        getAll: () => [],
        setAll: (values) =>
          values.forEach(({ name, value }) => jar.set(name, value)),
      },
    },
  );
  const login = await client.auth.signInWithPassword({ email, password });
  if (login.error) throw new Error("Local demo validation login failed.");
  try {
    const response = await fetch(
      "http://127.0.0.1:3100/api/occurrences/queue",
      {
        headers: {
          cookie: [...jar]
            .map(([name, value]) => `${name}=${value}`)
            .join("; "),
        },
        redirect: "manual",
      },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    return parsePortfolioQueue(await response.json());
  } finally {
    await client.auth.signOut({ scope: "local" });
  }
}

test("the real demo HTTP queue has two urgent and two normal new cards in the required order", async () => {
  const result = await queue(DEMO_EMAIL);
  expect(result.columns.new.count).toBe(4);
  expect(result.openByPriority).toEqual({
    urgent: 2,
    normal: 2,
    low: 0,
    unclassified: 0,
  });
  expect([
    result.columns.in_progress.count,
    result.columns.delegated.count,
    result.columns.completed.count,
  ]).toEqual([0, 0, 0]);
  const entries = cases();
  const byId = new Map(entries.map((entry) => [entry.occurrence_id, entry]));
  expect(
    result.columns.new.items.map(({ id }) => byId.get(id)?.fixture_key),
  ).toEqual([
    `${DEMO_KEY}:urgent-old`,
    `${DEMO_KEY}:urgent-new`,
    `${DEMO_KEY}:normal-old`,
    `${DEMO_KEY}:normal-new`,
  ]);
  expect(
    new Set(result.columns.new.items.map(({ condominium }) => condominium.id))
      .size,
  ).toBe(2);
  for (const card of result.columns.new.items) {
    const risk = detectRisk(card.location!, card.description);
    expect(card.suggestedPriority).toBe(risk.hasRisk ? "urgent" : "normal");
    expect(card.suggestionReason).toBe(
      risk.hasRisk
        ? `Menciona ${risk.term}: risco à segurança.`
        : "Sem sinal de risco no relato.",
    );
    expect(card.suggestionSource).toBe("rules");
    expect(card.finalPriority).toBeNull();
    expect(card.suggestionPending).toBe(true);
    expect(card.reporterName).toContain("Sintétic");
    expect(card.reporterUnitOrRole).toBeTruthy();
  }
  expect(
    context.sql(
      `select count(*) from public.occurrence_events e join local_demo.occurrences f on f.occurrence_id=e.occurrence_id where f.fixture_key like '${DEMO_KEY}:%' and e.event_type='registered';`,
    ),
  ).toBe("4");
});

test("another explicitly synthetic verification portfolio cannot see the demo", async () => {
  const email = "ori76-isolation@example.invalid";
  const existing = context.sql(
    `select id::text from auth.users where lower(email)=${quote(email)} and raw_app_meta_data->>'zelo_demo_dataset'='ori76-isolation-v1';`,
  );
  if (!existing) {
    const created = await context.admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: "Conta Sintética Verificação ORI-76",
        is_sindico: true,
      },
      app_metadata: { zelo_demo_dataset: "ori76-isolation-v1" },
    });
    if (created.error)
      throw new Error(
        "Could not prepare the dedicated local verification identity; no account was reset.",
      );
  }
  const result = await queue(email);
  expect(result.columns.new.items).toEqual([]);
  expect(result.openByPriority).toEqual({
    urgent: 0,
    normal: 0,
    low: 0,
    unclassified: 0,
  });
  const client = createClient(context.config.API_URL, context.config.ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const login = await client.auth.signInWithPassword({ email, password });
  if (login.error) throw new Error("Verification identity unavailable.");
  try {
    const direct = await client
      .from("occurrences")
      .select("id")
      .in(
        "id",
        cases().map(({ occurrence_id }) => occurrence_id!),
      );
    expect(direct.error).toBeNull();
    expect(direct.data).toEqual([]);
  } finally {
    await client.auth.signOut({ scope: "local" });
  }
});
