import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import {
  DEMO_KEY,
  DEMO_EMAIL,
  DEMO_CONDOMINIUMS,
  DEMO_OCCURRENCES,
} from "./demo-occurrences.data.mjs";

export class DemoError extends Error {}
const options = { auth: { persistSession: false, autoRefreshToken: false } };
export const quote = (value) => `'${value.replaceAll("'", "''")}'`;

function execute(command, args, input) {
  try {
    return execFileSync(command, args, {
      cwd: fileURLToPath(new URL("../", import.meta.url)),
      encoding: "utf8",
      input,
      stdio: [input ? "pipe" : "ignore", "pipe", "pipe"],
    }).trim();
  } catch {
    throw new DemoError(
      "Local demo command failed; provider output was suppressed.",
    );
  }
}

export function verifyLocalDestination(config, containers) {
  if (
    config.API_URL !== "http://127.0.0.1:54321" ||
    !config.ANON_KEY ||
    !config.SERVICE_ROLE_KEY
  )
    throw new DemoError("Only the known loopback Supabase stack is allowed.");
  for (const name of ["supabase_db_zelo-local", "supabase_kong_zelo-local"]) {
    const container = containers.find(({ Name }) => Name === `/${name}`);
    const ports = Object.values(container?.NetworkSettings?.Ports ?? {})
      .flat()
      .filter(Boolean);
    if (
      !container?.State?.Running ||
      container.Config?.Labels?.["com.supabase.cli.project"] !== "zelo-local" ||
      !ports.length ||
      ports.some(({ HostIp }) => !["127.0.0.1", "::1"].includes(HostIp))
    )
      throw new DemoError(
        "Expected running project containers with loopback-only bindings.",
      );
    const port = name.includes("_db_") ? "5432/tcp" : "8000/tcp";
    const expected = name.includes("_db_") ? "54322" : "54321";
    if (
      !container.NetworkSettings.Ports[port]?.some(
        ({ HostPort }) => HostPort === expected,
      )
    )
      throw new DemoError("Unexpected local project port.");
  }
}

export function verifyDockerEndpoint(endpoint) {
  let parsed;
  try {
    parsed = new URL(endpoint);
  } catch {
    throw new DemoError("A local Docker Unix socket is required.");
  }
  if (
    parsed.protocol !== "unix:" ||
    parsed.host ||
    !parsed.pathname.startsWith("/") ||
    parsed.pathname === "/" ||
    parsed.search ||
    parsed.hash
  )
    throw new DemoError(
      "Remote Docker endpoints are not permitted; select a local Unix-socket context.",
    );
}

export function localContext() {
  if (process.env.CI)
    throw new DemoError("The demo loader is manual and cannot run in CI.");
  if (
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_URL !== "http://127.0.0.1:54321"
  )
    throw new DemoError("Remote Supabase environment rejected.");
  if (process.env.DOCKER_HOST) verifyDockerEndpoint(process.env.DOCKER_HOST);
  const selectedContext =
    process.env.DOCKER_CONTEXT || execute("docker", ["context", "show"]);
  const dockerContext = JSON.parse(
    execute("docker", ["context", "inspect", selectedContext]),
  );
  if (!Array.isArray(dockerContext) || dockerContext.length !== 1)
    throw new DemoError("A single local Docker context is required.");
  verifyDockerEndpoint(dockerContext[0]?.Endpoints?.docker?.Host);
  let config, containers;
  try {
    config = JSON.parse(
      execute("node_modules/.bin/supabase", ["status", "-o", "json"]),
    );
    containers = JSON.parse(
      execute("docker", [
        "inspect",
        "supabase_db_zelo-local",
        "supabase_kong_zelo-local",
      ]),
    );
  } catch {
    throw new DemoError(
      "Start and inspect the project-local Supabase stack first.",
    );
  }
  verifyLocalDestination(config, containers);
  const sql = (statement) =>
    execute(
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
      statement,
    );
  if (
    sql(
      "select to_regprocedure('public.register_public_occurrence_with_suggestion(text,text,text,text,text,text,text,text,text)') is not null and to_regprocedure('public.portfolio_occurrence_queue()') is not null;",
    ) !== "t"
  )
    throw new DemoError(
      "Apply the existing ORI-74/75 local migrations before loading demo fixtures.",
    );
  return {
    config,
    sql,
    admin: createClient(config.API_URL, config.SERVICE_ROLE_KEY, options),
  };
}

function dedicatedAccount(context) {
  const raw = context.sql(
    `select json_build_object('id',u.id,'dedicated',u.raw_app_meta_data->>'zelo_demo_dataset'=${quote(DEMO_KEY)},'manager',p.is_sindico,'confirmed',u.email_confirmed_at is not null) from auth.users u join public.profiles p on p.id=u.id where lower(u.email)=${quote(DEMO_EMAIL)};`,
  );
  const account = raw ? JSON.parse(raw) : null;
  if (account && (!account.dedicated || !account.manager || !account.confirmed))
    throw new DemoError(
      "The dedicated demo identity is missing its ownership marker, confirmation or manager role; no existing account was changed.",
    );
  return account;
}

export async function prepareDemoAccount(context, password) {
  if (typeof password !== "string" || password.length < 12)
    throw new DemoError(
      "A dedicated demo password of at least 12 characters is required.",
    );
  let account = dedicatedAccount(context);
  if (!account) {
    const { error } = await context.admin.auth.admin.createUser({
      email: DEMO_EMAIL,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: "Conta Sintética ORI-76",
        phone: "11900000000",
        is_sindico: true,
      },
      app_metadata: { zelo_demo_dataset: DEMO_KEY },
    });
    account = dedicatedAccount(context);
    if (error && !account)
      throw new DemoError(
        "Could not prepare the local dedicated demo account.",
      );
  }
  if (!account) throw new DemoError("Dedicated account unavailable.");
  return account.id;
}

async function login(context, password) {
  const expected = dedicatedAccount(context);
  if (!expected)
    throw new DemoError("Prepare the dedicated demo account first.");
  const client = createClient(
    context.config.API_URL,
    context.config.ANON_KEY,
    options,
  );
  const result = await client.auth.signInWithPassword({
    email: DEMO_EMAIL,
    password,
  });
  if (
    result.error ||
    !result.data.session ||
    result.data.user?.id !== expected.id
  )
    throw new DemoError(
      "Dedicated demo login failed; no password or account was reset.",
    );
  return { client, session: result.data.session, accountId: expected.id };
}

function setup(context, identity) {
  context.sql(
    readFileSync(new URL("./demo-occurrences.sql", import.meta.url), "utf8"),
  );
  context.sql(
    `insert into local_demo.accounts(fixture_key,user_id) values (${quote(DEMO_KEY)},${quote(identity.accountId)}) on conflict do nothing;`,
  );
  if (
    context.sql(
      `select user_id::text from local_demo.accounts where fixture_key=${quote(DEMO_KEY)};`,
    ) !== identity.accountId
  )
    throw new DemoError(
      "Local fixture ownership differs; existing metadata was preserved.",
    );
  const untracked = context.sql(`select
    (select count(*) from public.condominiums c where c.manager_id=${quote(identity.accountId)} and not exists (select 1 from local_demo.condominiums f where f.condominium_id=c.id and f.fixture_key like '${DEMO_KEY}:%'))
    + (select count(*) from public.occurrences o join public.condominiums c on c.id=o.condominium_id where c.manager_id=${quote(identity.accountId)} and not exists (select 1 from local_demo.occurrences f where f.occurrence_id=o.id and f.fixture_key like '${DEMO_KEY}:%'));`);
  if (untracked !== "0")
    throw new DemoError(
      "Dedicated data exists outside the fixture registry; refusing to adopt, duplicate or delete it.",
    );
  const decoded = JSON.parse(
    Buffer.from(
      identity.session.access_token.split(".")[1],
      "base64url",
    ).toString(),
  );
  const claims = JSON.stringify({
    sub: identity.accountId,
    role: "authenticated",
    session_id: decoded.session_id,
  });
  for (const condominium of DEMO_CONDOMINIUMS) {
    const key = `${DEMO_KEY}:${condominium.key}`;
    context.sql(`begin;
      select pg_advisory_xact_lock(760076);
      create temporary table ori76_needed on commit drop as select ${quote(condominium.name)}::text as name,${quote(condominium.address)}::text as address where not exists (select 1 from local_demo.condominiums where fixture_key=${quote(key)});
      create temporary table ori76_created(id uuid) on commit drop;
      grant select on ori76_needed to authenticated;
      grant insert on ori76_created to authenticated;
      set local request.jwt.claims=${quote(claims)};
      set local role authenticated;
      insert into ori76_created select c.id from ori76_needed n cross join lateral public.create_condominium(n.name,n.address) c;
      reset role;
      insert into local_demo.condominiums(fixture_key,condominium_id) select ${quote(key)},id from ori76_created;
      commit;`);
    const valid = context.sql(
      `select count(*) from local_demo.condominiums f join public.condominiums c on c.id=f.condominium_id where f.fixture_key=${quote(key)} and c.manager_id=${quote(identity.accountId)} and c.name=${quote(condominium.name)} and c.address=${quote(condominium.address)};`,
    );
    if (valid !== "1")
      throw new DemoError(
        "Dedicated condominium changed or is unavailable; no existing data was overwritten.",
      );
  }
}

function manifest(context, fixture) {
  const condominium = JSON.parse(
    context.sql(
      `select json_build_object('id',c.id,'slug',c.slug) from local_demo.condominiums f join public.condominiums c on c.id=f.condominium_id where f.fixture_key=${quote(`${DEMO_KEY}:${fixture.condominium}`)};`,
    ),
  );
  const { key, condominium: ignored, ...fields } = fixture;
  void ignored;
  const input = {
    type: "registered",
    condominiumSlug: condominium.slug,
    ...fields,
  };
  const fixtureKey = `${DEMO_KEY}:${key}`;
  context.sql(
    `insert into local_demo.occurrences(fixture_key,condominium_id,input) values (${quote(fixtureKey)},${quote(condominium.id)},${quote(JSON.stringify(input))}::jsonb) on conflict do nothing;`,
  );
  const matches = context.sql(
    `select count(*) from local_demo.occurrences where fixture_key=${quote(fixtureKey)} and condominium_id=${quote(condominium.id)} and input=${quote(JSON.stringify(input))}::jsonb;`,
  );
  if (matches !== "1")
    throw new DemoError(
      "Fixture definition changed; use a reviewed new fixture version rather than overwriting data.",
    );
  return { input, fixtureKey };
}

export function inspectDemoCase(context, fixtureKey) {
  const raw = context.sql(`select json_build_object(
    'mapped',f.occurrence_id is not null,'valid',
    o.status='new' and o.origin='public_form' and o.channel='web' and o.condominium_id=f.condominium_id
    and o.reporter_name=f.input->>'reporterName' and o.reporter_phone=f.input->>'reporterPhone'
    and o.reporter_unit_or_role=f.input->>'reporterUnitOrRole' and o.location=f.input->>'location' and o.description=f.input->>'description'
    and o.suggestion_source='rules' and o.suggested_priority in ('urgent','normal') and o.suggestion_reason is not null and o.suggestion_at is not null
    and o.final_priority is null and o.priority_decided_at is null and o.decided_priority is null and o.decided_suggested_priority is null
    and o.priority_change_reason is null and o.category is null and o.responsible_profile_id is null and o.completed_at is null
    and e.event_type='registered' and e.occurred_at=o.registered_at and e.author_name=o.reporter_name and e.author_phone=o.reporter_phone and e.author_role=o.reporter_unit_or_role
    and e.author_type='reporter' and e.author_profile_id is null and e.visible_to_resident and e.public_text=e.internal_description
    and not e.is_human_action and e.priority_snapshot is null and e.data='{"identity":"self_declared"}'::jsonb
    and (select count(*) from public.occurrence_events x where x.occurrence_id=o.id)=1,
    'priority',o.suggested_priority)
    from local_demo.occurrences f left join public.occurrences o on o.id=f.occurrence_id left join public.occurrence_events e on e.id=f.event_id where f.fixture_key=${quote(fixtureKey)};`);
  if (!raw) throw new DemoError("Local fixture manifest is unavailable.");
  const state = JSON.parse(raw);
  if (state.mapped && state.valid !== true)
    throw new DemoError(
      "A mapped demo record changed; refusing to repair or recreate occurrence/history.",
    );
  return state;
}

async function registerOccurrence(input) {
  const { occurrenceEvents } =
    await import("../src/server/occurrences/event.factory.ts");
  return occurrenceEvents().registerPublic(input);
}

export async function loadDemo(
  context,
  password,
  { stopAfter = DEMO_OCCURRENCES.length, register = registerOccurrence } = {},
) {
  const identity = await login(context, password);
  const previous = Object.fromEntries(
    [
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
    ].map((key) => [key, process.env[key]]),
  );
  try {
    setup(context, identity);
    process.env.NEXT_PUBLIC_SUPABASE_URL = context.config.API_URL;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = context.config.ANON_KEY;
    process.env.SUPABASE_SERVICE_ROLE_KEY = context.config.SERVICE_ROLE_KEY;
    const result = {
      created: 0,
      reused: 0,
      recovered: 0,
      pending: 0,
      urgent: 0,
      normal: 0,
    };
    for (const [index, fixture] of DEMO_OCCURRENCES.entries()) {
      const { fixtureKey, input } = manifest(context, fixture);
      let state = inspectDemoCase(context, fixtureKey);
      if (state.mapped) result.reused += 1;
      else if (index >= stopAfter) {
        result.pending += 1;
        continue;
      } else {
        try {
          await register(input);
          result.created += 1;
        } catch {
          state = inspectDemoCase(context, fixtureKey);
          if (!state.mapped)
            throw new DemoError(
              "Registration did not commit; rerun the same command to resume without recreating completed fixtures.",
            );
          result.recovered += 1;
        }
        state = inspectDemoCase(context, fixtureKey);
        if (!state.mapped)
          throw new DemoError(
            "Registration was not atomically captured in the local manifest.",
          );
      }
      result[state.priority] += 1;
    }
    return result;
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await identity.client.auth.signOut({ scope: "local" });
  }
}
