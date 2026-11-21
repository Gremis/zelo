import { execFileSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  renameSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { parseEnv } from "node:util";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

class ProfileError extends Error {}

const root = fileURLToPath(new URL("../", import.meta.url));
const directory = join(root, "supabase/.smtp-manual");
const privateFile = join(root, ".env.smtp.local");
const marker = join(directory, "active");
const lock = join(directory, "operation.lock");
const cli = join(root, "node_modules/.bin/supabase");
const required = [
  "SUPABASE_AUTH_SMTP_USER",
  "SUPABASE_AUTH_SMTP_PASS",
  "SUPABASE_AUTH_SMTP_ADMIN_EMAIL",
];
const baseEnv = { ...process.env, SUPABASE_TELEMETRY_DISABLED: "1" };
const command = process.argv[2] ?? "check";

function capture(program, args, env = baseEnv) {
  try {
    return execFileSync(program, args, {
      cwd: root,
      env,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch {
    throw new ProfileError(
      "Local command failed. Provider output was suppressed; no credentials were logged.",
    );
  }
}

function verifyVersion() {
  const installed = JSON.parse(
    readFileSync(join(root, "node_modules/supabase/package.json"), "utf8"),
  ).version;
  if (
    installed !== "2.122.1" ||
    capture(cli, ["--version"]).split(/\s/u)[0] !== installed
  )
    throw new ProfileError(
      "Use the locked project-local Supabase CLI 2.122.1.",
    );
}

function atomicWrite(path, contents) {
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, contents, { flag: "wx", mode: 0o600 });
  renameSync(temporary, path);
}

function prepare() {
  const config = readFileSync(join(root, "supabase/config.toml"), "utf8");
  const overlay = readFileSync(join(root, "supabase/smtp-manual.toml"), "utf8");
  if (
    !/^project_id = "zelo-local"$/m.test(config) ||
    /^\[auth\.email\.smtp\]/m.test(config)
  )
    throw new ProfileError(
      "Expected the unchanged local project and default Mailpit configuration.",
    );
  const safeConfig = config
    .replace(/(\[db\.migrations\][^[]*?enabled\s*=\s*)true/u, "$1false")
    .replace(/(\[db\.seed\][^[]*?enabled\s*=\s*)true/u, "$1false");
  if (
    !/\[db\.migrations\]\s+enabled = false/u.test(safeConfig) ||
    !/\[db\.seed\]\s+enabled = false/u.test(safeConfig)
  )
    throw new ProfileError(
      "Unable to disable migration and seed execution in the temporary profiles.",
    );
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  mkdirSync(join(root, "supabase/.temp"), { recursive: true, mode: 0o700 });
  for (const profile of ["gmail", "mailpit"]) {
    const target = join(directory, profile, "supabase");
    mkdirSync(join(target, "templates"), { recursive: true, mode: 0o700 });
    if (!existsSync(join(target, ".temp")))
      symlinkSync(join(root, "supabase/.temp"), join(target, ".temp"), "dir");
    atomicWrite(join(target, "seed.sql"), "");
    atomicWrite(
      join(target, "config.toml"),
      safeConfig + (profile === "gmail" ? `\n${overlay}` : ""),
    );
    for (const template of ["confirmation.html", "recovery.html"])
      atomicWrite(
        join(target, "templates", template),
        readFileSync(join(root, "supabase/templates", template), "utf8"),
      );
  }
  if (!existsSync(privateFile))
    writeFileSync(
      privateFile,
      readFileSync(join(root, "supabase/smtp.env.example"), "utf8"),
      { flag: "wx", mode: 0o600 },
    );
}

function verifyOwnership() {
  const ids = capture("docker", [
    "ps",
    "-aq",
    "--filter",
    "label=com.supabase.cli.project=zelo-local",
  ])
    .split(/\s/u)
    .filter(Boolean);
  for (const id of ids) {
    const settings = JSON.parse(
      capture("docker", [
        "inspect",
        "--format",
        "{{json .NetworkSettings}}",
        id,
      ]),
    );
    const bindings = Object.values(settings.Ports ?? {})
      .flat()
      .filter(Boolean);
    if (
      !settings.Networks?.["zelo-local-loopback"] ||
      bindings.some(({ HostIp }) => !["127.0.0.1", "::1"].includes(HostIp))
    )
      throw new ProfileError(
        "Unrecognized or non-loopback local stack. No containers were stopped.",
      );
  }
}

function credentialEnv() {
  const file = lstatSync(privateFile);
  if (!file.isFile() || file.isSymbolicLink() || (file.mode & 0o077) !== 0)
    throw new ProfileError(
      "The private SMTP file must be a regular file accessible only to its owner.",
    );
  const values = parseEnv(readFileSync(privateFile, "utf8"));
  const env = { ...baseEnv };
  for (const field of required) {
    if (!values[field]?.trim() || /[\r\n]/u.test(values[field]))
      throw new ProfileError(`Fill ${field} privately before activation.`);
    env[field] = values[field].trim();
  }
  env.SUPABASE_AUTH_SMTP_PASS = env.SUPABASE_AUTH_SMTP_PASS.replace(/\s/gu, "");
  return env;
}

let acquired = false;
try {
  if (!["prepare", "check", "start", "restore"].includes(command))
    throw new ProfileError("Use prepare, check, start or restore.");
  verifyVersion();
  if (command === "check") {
    console.log(
      "Supabase CLI version verified. Static profile commands are available; no services were changed.",
    );
  } else if (command === "prepare") {
    prepare();
    console.log(
      "Temporary profiles prepared. Fill .env.smtp.local privately. No services were changed.",
    );
  } else {
    prepare();
    if (existsSync(lock)) {
      const owner = Number(readFileSync(lock, "utf8"));
      if (!Number.isSafeInteger(owner) || owner <= 0)
        throw new ProfileError(
          "Invalid operation lock; inspect it before retrying.",
        );
      let alive = true;
      try {
        process.kill(owner, 0);
      } catch (error) {
        if (error.code === "ESRCH") alive = false;
      }
      if (alive)
        throw new ProfileError("Another local profile operation is active.");
      unlinkSync(lock);
    }
    writeFileSync(lock, String(process.pid), { flag: "wx", mode: 0o600 });
    acquired = true;
    const profile = command === "start" ? "gmail" : "mailpit";
    const env = command === "start" ? credentialEnv() : baseEnv;
    verifyOwnership();
    atomicWrite(
      marker,
      "manual profile transition; restore Mailpit before automated Auth tests\n",
    );
    capture(cli, ["stop", "--project-id", "zelo-local"], baseEnv);
    capture(process.execPath, [join(root, "scripts/db-start.mjs")], {
      ...env,
      ZELO_LOCAL_DB_PROFILE: profile,
    });
    if (command === "restore") unlinkSync(marker);
    console.log(
      command === "start"
        ? "Manual Gmail profile active. Only run the intended manual signup, then restore Mailpit."
        : "Default Mailpit routing restored. Local data volumes were preserved.",
    );
  }
} catch (error) {
  console.error(
    error instanceof ProfileError
      ? error.message
      : "Local profile operation failed. Check local file permissions and configuration privately.",
  );
  console.error(
    "If a transition was interrupted, run npm run db:smtp:restore. The canonical config.toml was never replaced.",
  );
  process.exitCode = 1;
} finally {
  if (acquired) unlinkSync(lock);
}
