import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const baseline = "b591c8af0a781994ddda74dac06b6d005e57b33f";
const cutoff = "20261122152000";
const cli = join(root, "node_modules/.bin/supabase");
const environment = { ...process.env, SUPABASE_TELEMETRY_DISABLED: "1" };
const migrations = (await readdir(join(root, "supabase/migrations")))
  .filter((name) => /^\d{14}_.+\.sql$/.test(name))
  .sort();
if (
  new Set(migrations.map((name) => name.slice(0, 14))).size !==
  migrations.length
)
  throw new Error("Duplicate migration versions.");
const baseFiles = execFileSync(
  "git",
  ["ls-tree", "-r", "--name-only", baseline, "supabase/migrations"],
  { cwd: root, encoding: "utf8" },
)
  .trim()
  .split("\n")
  .filter((name) => name.endsWith(".sql"));
if (baseFiles.length !== 16)
  throw new Error("Expected the verified sixteen-migration baseline.");
for (const path of baseFiles) {
  const original = execFileSync("git", ["show", `${baseline}:${path}`], {
    cwd: root,
  });
  if (!original.equals(await readFile(join(root, path))))
    throw new Error(`Applied migration changed: ${path}`);
}

function execute(command, args, options = {}) {
  try {
    return execFileSync(command, args, {
      cwd: root,
      env: environment,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      maxBuffer: 16 * 1024 * 1024,
      ...options,
    }).trim();
  } catch (error) {
    const text = `${error.stdout ?? ""}\n${error.stderr ?? ""}`;
    const diagnostics = text
      .split("\n")
      .filter((line) =>
        /(ERROR:|# Failed test|#\s+(caught|wanted):|Files=|Result:|Parse errors:|Non-zero exit|No plan|Dubious)/.test(
          line,
        ),
      )
      .join("\n");
    throw new Error(
      `${command} ${args.slice(0, 3).join(" ")} failed.${diagnostics ? `\n${diagnostics}` : ""}`,
    );
  }
}
function sql(container, input) {
  return execute(
    "docker",
    [
      "exec",
      "-i",
      container,
      "psql",
      "-X",
      "-qAt",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    { input },
  );
}
const ledgerQuery =
  "select version||':'||name from supabase_migrations.schema_migrations order by version;";
const schemaQuery = `select jsonb_build_object(
  'functions',(select jsonb_agg(pg_get_functiondef(p.oid) order by n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.prokind='f'),
  'columns',(select jsonb_agg(jsonb_build_array(table_schema,table_name,column_name,data_type,is_nullable,column_default) order by table_schema,table_name,ordinal_position) from information_schema.columns where table_schema in ('public','private')),
  'policies',(select jsonb_agg(to_jsonb(p) order by schemaname,tablename,policyname) from pg_policies p where schemaname in ('public','private')),
  'constraints',(select jsonb_agg(jsonb_build_array(n.nspname,c.relname,k.conname,pg_get_constraintdef(k.oid)) order by n.nspname,c.relname,k.conname) from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private')),
  'indexes',(select jsonb_agg(indexdef order by schemaname,tablename,indexname) from pg_indexes where schemaname in ('public','private')),
  'triggers',(select jsonb_agg(pg_get_triggerdef(t.oid) order by n.nspname,c.relname,t.tgname) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') and not t.tgisinternal),
  'grants',(select jsonb_agg(jsonb_build_array(n.nspname,c.relname,c.relacl) order by n.nspname,c.relname) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private'))
)::text;`;
function fingerprint(input) {
  return createHash("sha256").update(input).digest("hex");
}
const protectedContainer = "supabase_db_zelo-local";
const existingContainers = execute("docker", [
  "ps",
  "-a",
  "--format",
  "{{.Names}}",
]);
if (!existingContainers.split("\n").includes(protectedContainer))
  throw new Error(
    "Expected the existing local database for preservation checks.",
  );
const protectedState = () =>
  fingerprint(
    sql(protectedContainer, ledgerQuery) +
      sql(protectedContainer, schemaQuery) +
      sql(
        protectedContainer,
        "select md5(coalesce(string_agg(row_to_json(o)::text,'' order by o.id),'')) from public.occurrences o;",
      ),
  );
const before = protectedState();
const workspace = await mkdtemp(join(tmpdir(), "zelo-migration-chain-"));
const results = [];
const seedCompatibility = process.argv.includes("--employee-seed");
if (seedCompatibility) {
  const trackingSource =
    "origin/geovannijdazevedo/ori-67-link-de-acompanhamento-do-morador";
  const inherited = [
    [
      "20261120130000_create_funcionario_rpc.sql",
      "20261124130000_create_funcionario_rpc.sql",
    ],
    [
      "20261124120000_public_registration_attempts.sql",
      "20261124121000_public_registration_attempts.sql",
    ],
    [
      "20261124160000_occurrence_tracking_lookup.sql",
      "20261126130000_occurrence_tracking_lookup.sql",
    ],
    [
      "20261124170000_occurrence_detail_tracking_code.sql",
      "20261124170000_occurrence_detail_tracking_code.sql",
    ],
  ];
  for (const [source, target] of inherited) {
    if (source !== target && migrations.includes(source))
      throw new Error(
        `Legacy tracking dependency alias reintroduced: ${source}`,
      );
    const original = execute("git", [
      "show",
      `${trackingSource}:supabase/migrations/${source}`,
    ]);
    if (
      (
        await readFile(join(root, "supabase/migrations", target), "utf8")
      ).trim() !== original
    )
      throw new Error(`Inherited tracking dependency drifted: ${target}`);
  }
  const richEmployee = execute("git", [
    "show",
    "9022f929f38f2f4924a271b0cc0a7d39dece5bfe:supabase/migrations/20261124120000_create_funcionarios.sql",
  ]);
  if (
    execute("git", [
      "show",
      `${trackingSource}:supabase/migrations/20261120120000_create_funcionarios.sql`,
    ]) !== richEmployee
  )
    throw new Error(
      "The inherited employee definition needs a separate compatibility review.",
    );
}

try {
  const scenarios = seedCompatibility
    ? [
        ["minimal", 55320],
        ["enriched", 56320],
      ]
    : [
        ["empty", 55320],
        ["upgrade", 56320],
      ];
  for (const [scenario, port] of scenarios) {
    const project = `zelo-migration-${scenario}`;
    const network = `${project}-loopback`;
    const container = `supabase_db_${project}`;
    if (existingContainers.includes(project))
      throw new Error(`Disposable project name already occupied: ${project}`);
    const directory = join(workspace, scenario);
    await mkdir(join(directory, "scripts"), { recursive: true });
    await mkdir(join(directory, "supabase/migrations"), { recursive: true });
    await symlink(join(root, "node_modules"), join(directory, "node_modules"));
    await cp(
      join(root, "supabase/templates"),
      join(directory, "supabase/templates"),
      { recursive: true },
    );
    await writeFile(join(directory, "supabase/seed.sql"), "");
    let config = await readFile(join(root, "supabase/config.toml"), "utf8");
    config = config
      .replace('project_id = "zelo-local"', `project_id = "${project}"`)
      .replace(/\b543(\d{2})\b/g, (_, suffix) =>
        String(port + Number(suffix) - 20),
      );
    config = config
      .replace(/(\[studio\]\s+enabled = )true/, "$1false")
      .replace(/(\[local_smtp\]\s+enabled = )true/, "$1false");
    await writeFile(join(directory, "supabase/config.toml"), config);
    const starter = (await readFile(join(root, "scripts/db-start.mjs"), "utf8"))
      .replace('const project = "zelo-local";', `const project = "${project}";`)
      .replace(
        'const networkName = "zelo-local-loopback";',
        `const networkName = "${network}";`,
      );
    await writeFile(join(directory, "scripts/db-start.mjs"), starter);
    await writeFile(
      join(directory, "package.json"),
      JSON.stringify({
        private: true,
        scripts: { "db:start": "node scripts/db-start.mjs" },
      }),
    );
    const initial =
      scenario === "upgrade" || seedCompatibility
        ? migrations.filter((name) => name.slice(0, 14) <= cutoff)
        : migrations;
    for (const name of initial)
      await cp(
        join(root, "supabase/migrations", name),
        join(directory, "supabase/migrations", name),
      );
    console.log(`${scenario}: starting isolated CLI-managed stack`);
    try {
      execute("npm", ["run", "db:start"], { cwd: directory });
      const ports = JSON.parse(
        execute("docker", [
          "inspect",
          "--format",
          "{{json .NetworkSettings.Ports}}",
          container,
        ]),
      );
      if (
        Object.values(ports)
          .flat()
          .filter(Boolean)
          .some(({ HostIp }) => !["127.0.0.1", "::1"].includes(HostIp))
      )
        throw new Error("Disposable database has a non-loopback binding.");
      const state = JSON.parse(
        sql(
          container,
          "select json_build_object('users',(select count(*) from auth.users),'occurrences',(select count(*) from public.occurrences));",
        ),
      );
      if (state.users || state.occurrences)
        throw new Error("Disposable database was not empty.");
      if (scenario === "upgrade" || seedCompatibility) {
        const current = sql(container, ledgerQuery).split("\n");
        if (current.length !== 16)
          throw new Error("Upgrade baseline contains unexpected migrations.");
        sql(
          container,
          await readFile(
            join(root, "tests/db/migration-upgrade-fixture.sql"),
            "utf8",
          ),
        );
        const seedFile = "20261124120500_employee_role_seed_backfill.sql";
        if (seedCompatibility) {
          sql(
            container,
            await readFile(
              join(root, "tests/db/employee-seed-before-base.sql"),
              "utf8",
            ),
          );
          for (const name of migrations.filter(
            (name) =>
              name.slice(0, 14) > cutoff &&
              name.slice(0, 14) <= "20261124120000",
          )) {
            await cp(
              join(root, "supabase/migrations", name),
              join(directory, "supabase/migrations", name),
            );
          }
          if (scenario === "enriched") {
            const enriched = execute("git", [
              "show",
              "9022f929f38f2f4924a271b0cc0a7d39dece5bfe:supabase/migrations/20261124120000_create_funcionarios.sql",
            ]);
            await writeFile(
              join(
                directory,
                "supabase/migrations/20261124120000_create_funcionarios.sql",
              ),
              enriched + "\n",
            );
          }
          execute(cli, [
            "db",
            "push",
            "--local",
            "--dry-run",
            "--workdir",
            directory,
          ]);
          execute(cli, [
            "db",
            "push",
            "--local",
            "--yes",
            "--workdir",
            directory,
          ]);
          sql(
            container,
            await readFile(
              join(root, "tests/db/employee-seed-before-patch.sql"),
              "utf8",
            ),
          );
          await cp(
            join(root, "supabase/migrations", seedFile),
            join(directory, "supabase/migrations", seedFile),
          );
          execute(cli, [
            "db",
            "push",
            "--local",
            "--yes",
            "--workdir",
            directory,
          ]);
          sql(
            container,
            "update private.employee_seed_compatibility set roles_after=(select jsonb_agg(to_jsonb(f) order by id) from public.funcoes f);",
          );
          sql(
            container,
            await readFile(join(root, "supabase/migrations", seedFile), "utf8"),
          );
          const seedOutput = execute(cli, [
            "test",
            "db",
            "--local",
            "--network-id",
            network,
            "--workdir",
            directory,
            join(root, "tests/db/employee-seed-compatibility.test.sql"),
          ]);
          if (!seedOutput.includes("Result: PASS"))
            throw new Error("Employee seed compatibility tests failed.");
          console.log(
            `${scenario}: employee seed and repeated application passed; ${seedOutput.match(/Files=.*$/m)?.[0] ?? ""}`,
          );
          sql(container, "drop table private.employee_seed_compatibility;");
        }
        for (const name of migrations) {
          if (
            scenario === "enriched" &&
            name === "20261124120000_create_funcionarios.sql"
          )
            continue;
          await cp(
            join(root, "supabase/migrations", name),
            join(directory, "supabase/migrations", name),
          );
        }
        execute(cli, [
          "db",
          "push",
          "--local",
          "--dry-run",
          "--workdir",
          directory,
        ]);
        execute(cli, [
          "db",
          "push",
          "--local",
          "--yes",
          "--workdir",
          directory,
        ]);
        sql(
          container,
          await readFile(
            join(root, "tests/db/migration-upgrade-assertions.sql"),
            "utf8",
          ),
        );
      }
      const ledger = sql(container, ledgerQuery);
      const expected = migrations
        .map((name) => `${name.slice(0, 14)}:${name.slice(15, -4)}`)
        .join("\n");
      if (ledger !== expected)
        throw new Error("Canonical ledger differs from the migration files.");
      execute(cli, [
        "db",
        "push",
        "--local",
        "--dry-run",
        "--workdir",
        directory,
      ]);
      execute(cli, ["db", "push", "--local", "--yes", "--workdir", directory]);
      if (sql(container, ledgerQuery) !== ledger)
        throw new Error("Second push changed the migration ledger.");
      const output = execute(cli, [
        "test",
        "db",
        "--local",
        "--network-id",
        network,
        "--workdir",
        directory,
        ...(seedCompatibility
          ? [
              join(root, "supabase/tests/database/tracking.test.sql"),
              join(root, "supabase/tests/database/occurrence-detail.test.sql"),
            ]
          : [join(root, "supabase/tests/database")]),
        join(root, "tests/db/migration-chain.test.sql"),
      ]);
      if (!output.includes("Result: PASS"))
        throw new Error("Database contract tests did not pass.");
      console.log(
        `${scenario}: ${migrations.length} canonical migrations; ${output.match(/Files=.*$/m)?.[0] ?? "database contracts passed"}`,
      );
      results.push(fingerprint(sql(container, schemaQuery)));
    } finally {
      execute(cli, [
        "stop",
        "--project-id",
        project,
        "--no-backup",
        "--workdir",
        directory,
      ]);
      execute("docker", ["network", "rm", network]);
    }
  }
  if (results[0] !== results[1])
    throw new Error(
      "Empty and upgrade paths produced different application schemas.",
    );
  if (protectedState() !== before)
    throw new Error("Existing local database changed during validation.");
  console.log(
    "Both paths converge to the same schema. Existing zelo-local ledger, schema and occurrences are unchanged.",
  );
} finally {
  await rm(workspace, { recursive: true, force: true });
}
