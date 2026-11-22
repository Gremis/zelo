import { spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { afterEach, expect, test } from "vitest";

const roots: string[] = [];
afterEach(() =>
  roots
    .splice(0)
    .forEach((root) => rmSync(root, { recursive: true, force: true })),
);

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "zelo-smtp-test-"));
  roots.push(root);
  for (const path of [
    "scripts",
    "supabase/templates",
    "node_modules/.bin",
    "node_modules/supabase",
    "bin",
  ])
    mkdirSync(join(root, path), { recursive: true });
  for (const path of [
    "scripts/db-smtp.mjs",
    "supabase/config.toml",
    "supabase/smtp-manual.toml",
    "supabase/smtp.env.example",
    "supabase/templates/confirmation.html",
    "supabase/templates/recovery.html",
  ])
    copyFileSync(path, join(root, path));
  writeFileSync(
    join(root, "node_modules/supabase/package.json"),
    JSON.stringify({ version: "2.122.1" }),
  );
  writeFileSync(
    join(root, "node_modules/.bin/supabase"),
    `#!/usr/bin/env node
const fs = require("node:fs");
if (process.argv.includes("--version")) console.log("2.122.1");
else { fs.appendFileSync("operations.jsonl", JSON.stringify(process.argv.slice(2)) + "\\n"); console.log("synthetic-private-output"); }
`,
    { mode: 0o700 },
  );
  writeFileSync(
    join(root, "scripts/db-start.mjs"),
    `import { appendFileSync } from "node:fs";
appendFileSync("operations.jsonl", JSON.stringify(["start", process.env.ZELO_LOCAL_DB_PROFILE]) + "\\n");
console.error("synthetic-private-output");
if (process.env.ZELO_SMTP_TEST_FAIL === "yes" && process.env.ZELO_LOCAL_DB_PROFILE === "gmail") process.exit(9);
`,
  );
  writeFileSync(
    join(root, "scripts/auth-template-readiness.mjs"),
    `import { appendFileSync } from "node:fs";
export class AuthTemplateReadinessError extends Error {}
export async function waitForAuthTemplates(expected) {
  appendFileSync("readiness.jsonl", JSON.stringify(Object.keys(expected)) + "\\n");
  if (!Object.values(expected).every((value) => value.includes("{{ .Token }}"))) throw new Error("Invalid fixture templates");
  if (process.env.ZELO_SMTP_TEST_READINESS === "failed") throw new AuthTemplateReadinessError("Templates not loaded by Auth.");
  if (process.env.ZELO_SMTP_TEST_READINESS === "private") throw new Error("synthetic-private-output");
}
`,
  );
  writeFileSync(
    join(root, "bin/docker"),
    `#!/usr/bin/env node
if (process.argv[2] === "ps") console.log("synthetic-container");
else console.log(JSON.stringify({ Networks: { "zelo-local-loopback": {} }, Ports: { "8000/tcp": [{ HostIp: process.env.ZELO_SMTP_TEST_UNSAFE === "yes" ? "0.0.0.0" : "127.0.0.1", HostPort: "54321" }] } }));
`,
    { mode: 0o700 },
  );
  return root;
}

function run(
  root: string,
  command: string,
  extra: Record<string, string> = {},
) {
  return spawnSync(
    process.execPath,
    [join(root, "scripts/db-smtp.mjs"), command],
    {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${join(root, "bin")}${delimiter}${process.env.PATH}`,
        ...extra,
      },
    },
  );
}

function fillSyntheticCredentials(root: string) {
  writeFileSync(
    join(root, ".env.smtp.local"),
    "SUPABASE_AUTH_SMTP_USER=synthetic@example.invalid\nSUPABASE_AUTH_SMTP_PASS=synthetic-private-output\nSUPABASE_AUTH_SMTP_ADMIN_EMAIL=synthetic@example.invalid\n",
    { mode: 0o600 },
  );
}

test("prepares separate profiles without changing canonical config or invoking services", () => {
  const root = fixture();
  const original = readFileSync(join(root, "supabase/config.toml"), "utf8");
  expect(run(root, "prepare").status).toBe(0);
  expect(readFileSync(join(root, "supabase/config.toml"), "utf8")).toBe(
    original,
  );
  expect(existsSync(join(root, "operations.jsonl"))).toBe(false);
  const gmail = readFileSync(
    join(root, "supabase/.smtp-manual/gmail/supabase/config.toml"),
    "utf8",
  );
  expect(gmail).toContain('pass = "env(SUPABASE_AUTH_SMTP_PASS)"');
  expect(gmail).toMatch(/\[db\.migrations\]\s+enabled = false/u);
  expect(gmail).toMatch(/\[db\.seed\]\s+enabled = false/u);
  expect(
    readFileSync(
      join(root, "supabase/.smtp-manual/mailpit/supabase/config.toml"),
      "utf8",
    ),
  ).not.toContain("[auth.email.smtp]");
  expect(statSync(join(root, ".env.smtp.local")).mode & 0o777).toBe(0o600);
});

test("preparation preserves an existing private file without inspecting its contents", () => {
  const root = fixture();
  fillSyntheticCredentials(root);
  expect(run(root, "prepare").status).toBe(0);
  expect(readFileSync(join(root, ".env.smtp.local"), "utf8")).toContain(
    "synthetic-private-output",
  );
});

test("activation targets only this project and suppresses provider output", () => {
  const root = fixture();
  fillSyntheticCredentials(root);
  const result = run(root, "start");
  expect(result.status).toBe(0);
  expect(result.stdout).toContain(
    "Auth loaded the custom signup and recovery OTP templates",
  );
  expect(readFileSync(join(root, "readiness.jsonl"), "utf8")).toContain(
    '["confirmation","recovery"]',
  );
  expect(result.stdout + result.stderr).not.toContain(
    "synthetic-private-output",
  );
  expect(
    readFileSync(join(root, "operations.jsonl"), "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line)),
  ).toEqual([
    ["stop", "--project-id", "zelo-local"],
    ["start", "gmail"],
  ]);
  expect(existsSync(join(root, "supabase/.smtp-manual/active"))).toBe(true);
});

test("restores Mailpit after a failed activation without requiring credentials", () => {
  const root = fixture();
  fillSyntheticCredentials(root);
  const failed = run(root, "start", { ZELO_SMTP_TEST_FAIL: "yes" });
  expect(failed.status).toBe(1);
  expect(failed.stdout + failed.stderr).not.toContain(
    "synthetic-private-output",
  );
  expect(existsSync(join(root, "supabase/.smtp-manual/active"))).toBe(true);
  rmSync(join(root, ".env.smtp.local"));
  expect(run(root, "restore").status).toBe(0);
  expect(existsSync(join(root, "supabase/.smtp-manual/active"))).toBe(false);
  expect(readFileSync(join(root, "operations.jsonl"), "utf8")).toContain(
    '["start","mailpit"]',
  );
});

test("rejects unsafe ownership or private-file permissions before stopping containers", () => {
  const root = fixture();
  fillSyntheticCredentials(root);
  chmodSync(join(root, ".env.smtp.local"), 0o644);
  expect(run(root, "start").status).toBe(1);
  chmodSync(join(root, ".env.smtp.local"), 0o600);
  expect(run(root, "start", { ZELO_SMTP_TEST_UNSAFE: "yes" }).status).toBe(1);
  expect(existsSync(join(root, "operations.jsonl"))).toBe(false);
});

test.each(["start", "restore"])(
  "does not announce %s readiness or clear the marker when templates are unconfirmed",
  (command) => {
    const root = fixture();
    fillSyntheticCredentials(root);
    const result = run(root, command, { ZELO_SMTP_TEST_READINESS: "failed" });
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain(
      "SMTP is not ready: Templates not loaded by Auth.",
    );
    expect(existsSync(join(root, "supabase/.smtp-manual/active"))).toBe(true);
    expect(existsSync(join(root, "supabase/.smtp-manual/operation.lock"))).toBe(
      false,
    );
  },
);

test("suppresses unexpected readiness diagnostics and still permits restoration", () => {
  const root = fixture();
  fillSyntheticCredentials(root);
  const result = run(root, "start", { ZELO_SMTP_TEST_READINESS: "private" });
  expect(result.status).toBe(1);
  expect(result.stdout + result.stderr).not.toContain(
    "synthetic-private-output",
  );
  expect(result.stderr).toContain("provider output suppressed");
  expect(run(root, "restore").status).toBe(0);
});
