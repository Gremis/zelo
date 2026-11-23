import { spawnSync } from "node:child_process";
import { setTimeout as pause } from "node:timers/promises";

export class AuthTemplateReadinessError extends Error {}

const container = "supabase_auth_zelo-local";
const types = ["confirmation", "recovery"];
const templateUrl = (type) =>
  `http://supabase_kong_zelo-local:8088/email/${type}.html`;
const metadataFormat =
  '{"id":{{json .Id}},"startedAt":{{json .State.StartedAt}},"running":{{json .State.Running}},"image":{{json .Config.Image}}}';
const templateFormat =
  '{{range .Config.Env}}{{if or (eq (index (split . "=") 0) "GOTRUE_MAILER_TEMPLATES_CONFIRMATION") (eq (index (split . "=") 0) "GOTRUE_MAILER_TEMPLATES_RECOVERY")}}{{println .}}{{end}}{{end}}';

function docker(args) {
  const result = spawnSync("docker", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 5000,
    maxBuffer: 4 * 1024 * 1024,
  });
  if (result.error || result.status !== 0)
    throw new AuthTemplateReadinessError(
      "Local Auth readiness inspection failed; output suppressed.",
    );
  return args[0] === "logs"
    ? `${result.stdout}\n${result.stderr}`
    : result.stdout;
}

function inspectAuth() {
  let metadata;
  try {
    metadata = JSON.parse(
      docker(["inspect", "--format", metadataFormat, container]),
    );
  } catch {
    throw new AuthTemplateReadinessError(
      "Local Auth metadata could not be verified; output suppressed.",
    );
  }
  const templates = Object.fromEntries(
    docker(["inspect", "--format", templateFormat, container])
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((entry) => {
        const separator = entry.indexOf("=");
        return [entry.slice(0, separator), entry.slice(separator + 1)];
      }),
  );
  return { ...metadata, templates };
}

function readLogs(startedAt) {
  return docker(["logs", "--since", startedAt, container]);
}

function fetchTemplate(type) {
  return docker([
    "exec",
    container,
    "wget",
    "-q",
    "-T",
    "3",
    "-O",
    "-",
    templateUrl(type),
  ]);
}

export function loadedAuthTemplates(logs, startedAt) {
  const start = Math.floor(Date.parse(startedAt) / 1000) * 1000;
  if (!Number.isFinite(start)) return [];
  const states = Object.fromEntries(
    types.map((type) => [
      type,
      {
        errorAt: -Infinity,
        loadedAt: -Infinity,
        reloadSeen: false,
        initialFailure: false,
      },
    ]),
  );
  const events = [];
  for (const line of logs.split("\n")) {
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (!entry || typeof entry !== "object") continue;
    const at = Date.parse(entry.time);
    if (!Number.isFinite(at) || at < start) continue;
    if (typeof entry.event !== "string") continue;
    if (!entry.event.startsWith("templatemailer_")) continue;
    if (!types.includes(entry.mail_type)) continue;
    const failed = entry.level === "error" || entry.level === "fatal";
    const updated =
      entry.event === "templatemailer_reloader_template_update" &&
      entry.level === "info";
    if (failed || updated) events.push({ at, type: entry.mail_type, failed });
  }
  events.sort((a, b) => a.at - b.at || Number(b.failed) - Number(a.failed));
  for (const entry of events) {
    const state = states[entry.type];
    if (entry.failed) {
      state.errorAt = entry.at;
      if (!state.reloadSeen) state.initialFailure = true;
    } else {
      const ambiguousInitialReload = !state.reloadSeen && state.initialFailure;
      state.reloadSeen = true;
      if (!ambiguousInitialReload) state.loadedAt = entry.at;
    }
  }
  return types.filter(
    (type) =>
      Number.isFinite(states[type].loadedAt) &&
      states[type].loadedAt > states[type].errorAt,
  );
}

function assertConfiguration(state) {
  if (
    !state.running ||
    typeof state.id !== "string" ||
    !state.id ||
    !Number.isFinite(Date.parse(state.startedAt))
  )
    throw new AuthTemplateReadinessError(
      "Local Auth is not running with a verifiable start time.",
    );
  if (!/(?:^|\/)gotrue:v2\.197\.0$/.test(state.image ?? ""))
    throw new AuthTemplateReadinessError(
      "Unsupported local Auth version for template readiness verification.",
    );
  for (const type of types) {
    if (
      state.templates?.[`GOTRUE_MAILER_TEMPLATES_${type.toUpperCase()}`] !==
      templateUrl(type)
    )
      throw new AuthTemplateReadinessError(
        `Local Auth ${type} template configuration does not match the project.`,
      );
  }
}

export async function waitForAuthTemplates(
  expected,
  {
    inspect = inspectAuth,
    fetch = fetchTemplate,
    logs = readLogs,
    now = Date.now,
    sleep = (ms) => pause(ms),
    timeoutMs = 45_000,
  } = {},
) {
  const deadline = now() + timeoutMs;
  const initial = inspect();
  assertConfiguration(initial);
  for (const type of types) {
    if (
      typeof expected[type] !== "string" ||
      !expected[type].includes("{{ .Token }}") ||
      expected[type].includes(".ConfirmationURL")
    )
      throw new AuthTemplateReadinessError(
        `Expected ${type} template must contain the project OTP.`,
      );
  }
  while (now() < deadline) {
    const state = inspect();
    assertConfiguration(state);
    if (state.id !== initial.id || state.startedAt !== initial.startedAt)
      throw new AuthTemplateReadinessError(
        "Local Auth restarted during template readiness verification.",
      );
    let ready = false;
    try {
      const contentMatches = types.every(
        (type) => fetch(type) === expected[type],
      );
      const loaded = loadedAuthTemplates(
        logs(initial.startedAt),
        initial.startedAt,
      );
      ready = contentMatches && types.every((type) => loaded.includes(type));
    } catch {}
    if (ready) {
      const final = inspect();
      assertConfiguration(final);
      if (final.id !== initial.id || final.startedAt !== initial.startedAt)
        throw new AuthTemplateReadinessError(
          "Local Auth restarted during template readiness verification.",
        );
      return;
    }
    await sleep(Math.min(1000, Math.max(0, deadline - now())));
  }
  throw new AuthTemplateReadinessError(
    "Timed out confirming that local Auth loaded both custom OTP templates. SMTP readiness was not confirmed; do not request emails. Restore Mailpit with npm run db:smtp:restore.",
  );
}
