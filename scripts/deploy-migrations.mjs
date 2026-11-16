import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { stripVTControlCharacters } from "node:util";

function encodeCredential(value) {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

export function buildMigrationConnection(env) {
  const project = env.SUPABASE_PROJECT_ID;
  const host = env.SUPABASE_DB_HOST;
  const password = env.SUPABASE_DB_PASSWORD;
  if (
    typeof project !== "string" ||
    !/^[a-z]{20}$/.test(project) ||
    typeof host !== "string" ||
    host.length > 253 ||
    !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.pooler\.supabase\.com$/.test(
      host,
    ) ||
    typeof password !== "string" ||
    password.length === 0 ||
    /[\r\n\0]/.test(password)
  ) {
    throw new Error("Invalid Session pooler configuration.");
  }
  const encodedPassword = encodeCredential(password);
  const username = `postgres.${project}`;
  const url = `postgresql://${username}:${encodedPassword}@${host}:5432/postgres?sslmode=require`;
  return { url, password, encodedPassword };
}

export function maskCredential(value) {
  const escaped = value
    .replace(/%/g, "%25")
    .replace(/\r/g, "%0D")
    .replace(/\n/g, "%0A");
  process.stdout.write(`::add-mask::${escaped}\n`);
}

export function sanitizeOutput(output, connection) {
  const parsed = new URL(connection.url);
  const rawUrl = `${parsed.protocol}//${parsed.username}:${connection.password}@${parsed.host}${parsed.pathname}${parsed.search}`;
  const encodedPattern = connection.encodedPassword.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&",
  );
  function redact(text) {
    return text
      .split(rawUrl)
      .join("[REDACTED_CONNECTION_URL]")
      .replace(
        /\bpostgres(?:ql)?:\/\/[^\s<>"']+/gi,
        "[REDACTED_CONNECTION_URL]",
      )
      .replace(new RegExp(encodedPattern, "gi"), "[REDACTED]")
      .split(connection.password)
      .join("[REDACTED]");
  }
  return redact(stripVTControlCharacters(redact(String(output ?? ""))))
    .replace(/\r\n?/g, "\n")
    .replace(/::/g, ": :");
}

export class MigrationCommandError extends Error {
  constructor(status) {
    super(
      "Session pooler migration command failed. Review the sanitized diagnostics.",
    );
    this.exitCode =
      Number.isInteger(status) && status > 0 && status <= 255 ? status : 1;
  }
}

function executeCli(command, args, options) {
  const result = spawnSync(command, args, options);
  return {
    status: result.status,
    error: result.error,
    stdout: result.stdout?.toString() ?? "",
    stderr: result.stderr?.toString() ?? "",
  };
}

function writeOutput(channel, text) {
  process[channel].write(text);
}

export function runMigrations(
  mode,
  env,
  execute = executeCli,
  mask = maskCredential,
  write = writeOutput,
) {
  if (env.GITHUB_ACTIONS !== "true") {
    throw new Error("Deployment migrations require GitHub Actions.");
  }
  if (!["dry-run", "apply"].includes(mode)) {
    throw new Error("Invalid migration mode.");
  }
  const connection = buildMigrationConnection(env);
  for (const value of new Set([
    connection.password,
    connection.encodedPassword,
    connection.url,
  ])) {
    mask(value);
  }
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const cli = resolve(root, "node_modules/.bin/supabase");
  const args = [
    "db",
    "push",
    "--db-url",
    connection.url,
    "--skip-vault",
    "--yes",
    "--dns-resolver",
    "https",
  ];
  if (mode === "dry-run") args.push("--dry-run");
  let result;
  try {
    result = execute(cli, args, {
      cwd: root,
      env: { ...env, SUPABASE_TELEMETRY_DISABLED: "1" },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch {
    throw new MigrationCommandError(1);
  }
  for (const channel of ["stdout", "stderr"]) {
    const sanitized = sanitizeOutput(result[channel], connection);
    if (sanitized) write(channel, sanitized);
  }
  if (result.error || result.status !== 0) {
    throw new MigrationCommandError(result.status);
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    if (process.argv.length !== 3)
      throw new Error("Invalid migration arguments.");
    runMigrations(process.argv[2], process.env);
    console.log("Session pooler migration command completed successfully.");
  } catch (error) {
    console.error(
      "Migration step failed. Verify the Session pooler host, project, password, TLS and migration state privately; no connection details are logged.",
    );
    process.exitCode =
      error instanceof MigrationCommandError ? error.exitCode : 1;
  }
}
