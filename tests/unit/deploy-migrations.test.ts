import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, vi } from "vitest";
import {
  buildMigrationConnection,
  maskCredential,
  sanitizeOutput,
  MigrationCommandError,
  runMigrations,
} from "../../scripts/deploy-migrations.mjs";

const config = {
  GITHUB_ACTIONS: "true",
  SUPABASE_PROJECT_ID: "abcdefghijklmnopqrst",
  SUPABASE_DB_HOST: "aws-0-us-east-1.pooler.supabase.com",
  SUPABASE_DB_PASSWORD: "test-only:p@ss/word?#% !'()*ação",
};

test("encodes the raw password once and fixes the Session pooler target and TLS", () => {
  const { url, encodedPassword } = buildMigrationConnection(config);
  const parsed = new URL(url);
  expect(decodeURIComponent(parsed.password)).toBe(config.SUPABASE_DB_PASSWORD);
  expect(encodedPassword).toContain("%40");
  expect(encodedPassword).toContain("%25");
  expect(encodedPassword).toContain("%27");
  expect(parsed.username).toBe(`postgres.${config.SUPABASE_PROJECT_ID}`);
  expect(parsed.hostname).toBe(config.SUPABASE_DB_HOST);
  expect(parsed.port).toBe("5432");
  expect(parsed.pathname).toBe("/postgres");
  expect([...parsed.searchParams]).toEqual([["sslmode", "require"]]);
});

test.each([
  { SUPABASE_PROJECT_ID: "invalid/project" },
  { SUPABASE_PROJECT_ID: "" },
  { SUPABASE_DB_HOST: "db.abcdefghijklmnopqrst.supabase.co" },
  { SUPABASE_DB_HOST: "pooler.supabase.com.attacker.example" },
  { SUPABASE_DB_HOST: "aws-0-us-east-1.pooler.supabase.com:6543" },
  {
    SUPABASE_DB_HOST:
      "postgresql://credentials@aws-0-us-east-1.pooler.supabase.com",
  },
  { SUPABASE_DB_HOST: "127.0.0.1" },
  { SUPABASE_DB_HOST: "::1" },
  { SUPABASE_DB_HOST: "" },
  { SUPABASE_DB_PASSWORD: "" },
  { SUPABASE_DB_PASSWORD: "test\npassword" },
])(
  "rejects invalid configuration without exposing supplied values: %j",
  (override) => {
    expect(() => buildMigrationConnection({ ...config, ...override })).toThrow(
      "Invalid Session pooler configuration.",
    );
  },
);

test("escapes GitHub workflow-command data before registering masks", () => {
  const output = vi.spyOn(process.stdout, "write").mockReturnValue(true);
  try {
    maskCredential("test%value\r\n::warning::test");
    expect(output).toHaveBeenCalledWith(
      "::add-mask::test%25value%0D%0A::warning::test\n",
    );
  } finally {
    output.mockRestore();
  }
});

test.each(["dry-run", "apply"])(
  "masks every derived credential before executing %s",
  (mode) => {
    const events: string[] = [];
    const mask = vi.fn((value: string) => events.push(value));
    const execute = vi.fn(() => {
      events.push("executed");
      return { status: 0, error: undefined, stdout: "", stderr: "" };
    });
    runMigrations(mode, config, execute, mask);
    const connection = buildMigrationConnection(config);
    expect(events).toEqual([
      connection.password,
      connection.encodedPassword,
      connection.url,
      "executed",
    ]);
    const [command, args, options] = execute.mock.calls[0] as unknown as [
      string,
      string[],
      { stdio: string[]; encoding: string },
    ];
    expect(command).toMatch(/node_modules\/\.bin\/supabase$/);
    expect(args).toEqual([
      "db",
      "push",
      "--db-url",
      connection.url,
      "--skip-vault",
      "--yes",
      "--dns-resolver",
      "https",
      ...(mode === "dry-run" ? ["--dry-run"] : []),
    ]);
    expect(args).not.toContain("--linked");
    expect(options.stdio).toEqual(["ignore", "pipe", "pipe"]);
    expect(options.encoding).toBe("utf8");
  },
);

test("sanitizes thrown subprocess errors", () => {
  const execute = vi.fn(() => {
    throw new Error(config.SUPABASE_DB_PASSWORD);
  });
  expect(() => runMigrations("apply", config, execute, vi.fn())).toThrow(
    "Session pooler migration command failed. Review the sanitized diagnostics.",
  );
});

test.each(["reset", "--linked"])(
  "rejects unsupported mode %s before execution or masking",
  (mode) => {
    const execute = vi.fn();
    const mask = vi.fn();
    expect(() => runMigrations(mode, config, execute, mask)).toThrow(
      "Invalid migration mode.",
    );
    expect(execute).not.toHaveBeenCalled();
    expect(mask).not.toHaveBeenCalled();
  },
);

test("refuses local execution before printing masks or starting the CLI", () => {
  const execute = vi.fn();
  const mask = vi.fn();
  expect(() =>
    runMigrations(
      "apply",
      { ...config, GITHUB_ACTIONS: "false" },
      execute,
      mask,
    ),
  ).toThrow("Deployment migrations require GitHub Actions.");
  expect(execute).not.toHaveBeenCalled();
  expect(mask).not.toHaveBeenCalled();
});

test.each([0, 17])(
  "sanitizes stdout and stderr while retaining useful diagnostics for status %i",
  (status) => {
    const connection = buildMigrationConnection(config);
    const write = vi.fn();
    const execute = vi.fn().mockReturnValue({
      status,
      stdout: `Connected to Session pooler\nPending migrations: 20261117_change.sql\n${connection.url}\npassword=${connection.password}\n`,
      stderr: `Migration ${status === 0 ? "succeeded" : "failed"}: ${connection.encodedPassword}\npostgres://other:credential@example.invalid:5432/postgres\n`,
    });
    if (status === 0) {
      expect(() =>
        runMigrations("dry-run", config, execute, vi.fn(), write),
      ).not.toThrow();
    } else {
      try {
        runMigrations("apply", config, execute, vi.fn(), write);
        throw new Error("Expected migration failure");
      } catch (error) {
        expect(error).toBeInstanceOf(MigrationCommandError);
        expect((error as MigrationCommandError).exitCode).toBe(status);
      }
    }
    const logged = write.mock.calls.map(([, text]) => text).join("");
    expect(write.mock.calls.map(([channel]) => channel)).toEqual([
      "stdout",
      "stderr",
    ]);
    expect(logged).toContain("Connected to Session pooler");
    expect(logged).toContain("Pending migrations: 20261117_change.sql");
    expect(logged).toContain(
      status === 0 ? "Migration succeeded" : "Migration failed",
    );
    for (const secret of [
      connection.password,
      connection.encodedPassword,
      connection.url,
      "postgres://other:credential",
    ]) {
      expect(logged).not.toContain(secret);
    }
  },
);

test("redacts raw-password URLs, encoded variants and terminal/workflow escapes", () => {
  const connection = buildMigrationConnection(config);
  const parsed = new URL(connection.url);
  const rawUrl = `postgresql://${parsed.username}:${connection.password}@${parsed.host}${parsed.pathname}${parsed.search}`;
  const output = sanitizeOutput(
    `${rawUrl}\n${connection.encodedPassword.toLowerCase()}\n${String.fromCharCode(27)}[31m${connection.password}${String.fromCharCode(27)}[0m\n::warning::diagnostic`,
    connection,
  );
  expect(output).not.toContain(connection.password);
  expect(output).not.toContain(connection.encodedPassword.toLowerCase());
  expect(output).not.toMatch(/postgres(?:ql)?:\/\//i);
  expect(output).not.toContain(String.fromCharCode(27));
  expect(output).not.toContain("::warning::");
  expect(output).toContain("diagnostic");
});

test("reports captured diagnostics but never raw spawn errors and fails with code 1", () => {
  const write = vi.fn();
  const execute = vi.fn().mockReturnValue({
    status: null,
    error: new Error(config.SUPABASE_DB_PASSWORD),
    stderr: "Could not launch the CLI",
  });
  try {
    runMigrations("apply", config, execute, vi.fn(), write);
    throw new Error("Expected migration failure");
  } catch (error) {
    expect(error).toBeInstanceOf(MigrationCommandError);
    expect((error as MigrationCommandError).exitCode).toBe(1);
    expect((error as Error).message).not.toContain(config.SUPABASE_DB_PASSWORD);
  }
  expect(write).toHaveBeenCalledWith("stderr", "Could not launch the CLI");
});

test("the entry point preserves the CLI failure code and emits only sanitized diagnostics after masks", () => {
  const root = realpathSync(
    mkdtempSync(join(tmpdir(), "zelo-migration-output-")),
  );
  try {
    mkdirSync(join(root, "scripts"));
    mkdirSync(join(root, "node_modules/.bin"), { recursive: true });
    copyFileSync(
      "scripts/deploy-migrations.mjs",
      join(root, "scripts/deploy-migrations.mjs"),
    );
    writeFileSync(
      join(root, "node_modules/.bin/supabase"),
      `#!/usr/bin/env node
process.stdout.write("Pending migrations: 20261117_change.sql\\n" + process.env.SUPABASE_DB_PASSWORD + "\\n");
process.stderr.write("Connection failed " + process.argv[process.argv.indexOf("--db-url") + 1] + "\\n");
process.exit(19);
`,
      { mode: 0o755 },
    );
    const result = spawnSync(
      process.execPath,
      [join(root, "scripts/deploy-migrations.mjs"), "dry-run"],
      {
        cwd: root,
        env: { NODE_ENV: "test", PATH: process.env.PATH, ...config },
        encoding: "utf8",
      },
    );
    expect(result.status).toBe(19);
    const masks = result.stdout
      .split("\n")
      .filter((line) => line.startsWith("::add-mask::"));
    expect(masks).toHaveLength(3);
    const diagnostics =
      result.stdout
        .split("\n")
        .filter((line) => !line.startsWith("::add-mask::"))
        .join("\n") + result.stderr;
    expect(diagnostics).toContain("Pending migrations: 20261117_change.sql");
    expect(diagnostics).toContain("Connection failed");
    expect(diagnostics).toContain("Migration step failed");
    const connection = buildMigrationConnection(config);
    for (const secret of [
      connection.password,
      connection.encodedPassword,
      connection.url,
    ]) {
      expect(diagnostics).not.toContain(secret);
    }
    expect(diagnostics).not.toMatch(/postgres(?:ql)?:\/\//i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
