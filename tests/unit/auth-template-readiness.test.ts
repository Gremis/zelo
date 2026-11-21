import { expect, test, vi } from "vitest";
import {
  loadedAuthTemplates,
  waitForAuthTemplates,
} from "../../scripts/auth-template-readiness.mjs";

const start = "2026-11-21T20:00:00.500Z";
const templates = {
  confirmation: "<p>Cadastro {{ .Token }}</p>",
  recovery: "<p>Recuperar {{ .Token }}</p>",
};
const state = {
  id: "synthetic-container",
  image: "public.ecr.aws/supabase/gotrue:v2.197.0",
  startedAt: start,
  running: true,
  templates: {
    GOTRUE_MAILER_TEMPLATES_CONFIRMATION:
      "http://supabase_kong_zelo-local:8088/email/confirmation.html",
    GOTRUE_MAILER_TEMPLATES_RECOVERY:
      "http://supabase_kong_zelo-local:8088/email/recovery.html",
  },
};
function event(type: string, seconds: number, failed = false) {
  return JSON.stringify({
    time: `2026-11-21T20:00:${String(seconds).padStart(2, "0")}Z`,
    level: failed ? "error" : "info",
    event: failed
      ? "templatemailer_template_body_http_error"
      : "templatemailer_reloader_template_update",
    mail_type: type,
  });
}
function fixture(initialLogs = "") {
  let time = 0;
  const lines = { value: initialLogs };
  return {
    lines,
    inspect: vi.fn(() => structuredClone(state)),
    fetch: vi.fn((type: keyof typeof templates) => templates[type]),
    logs: vi.fn(() => lines.value),
    now: () => time,
    sleep: vi.fn(async (ms: number) => {
      time += ms;
    }),
    timeoutMs: 3000,
  };
}

test("accepts both loaded templates from the current startup even with second-precision log timestamps", async () => {
  const f = fixture(event("confirmation", 0) + "\n" + event("recovery", 0));
  await expect(waitForAuthTemplates(templates, f)).resolves.toBeUndefined();
  expect(f.sleep).not.toHaveBeenCalled();
});

test("rejects accessible template files without Auth load evidence", async () => {
  const f = fixture();
  await expect(waitForAuthTemplates(templates, f)).rejects.toThrow(
    "Timed out confirming",
  );
  expect(f.fetch).toHaveBeenCalled();
});

test("does not mistake the initial fallback reload events for loaded custom templates", async () => {
  const failure = [
    event("confirmation", 0, true),
    event("recovery", 0, true),
    event("confirmation", 0),
    event("recovery", 0),
  ].join("\n");
  expect(loadedAuthTemplates(failure, start)).toEqual([]);
  const f = fixture(failure);
  f.sleep.mockImplementation(async () => {
    f.lines.value =
      failure + "\n" + event("confirmation", 10) + "\n" + event("recovery", 10);
  });
  await expect(waitForAuthTemplates(templates, f)).resolves.toBeUndefined();
  expect(f.sleep).toHaveBeenCalledTimes(1);
});

test("fails when fallback reload events are the only available evidence", async () => {
  const f = fixture(
    [
      event("recovery", 0),
      event("confirmation", 0),
      event("recovery", 0, true),
    ].join("\n"),
  );
  await expect(waitForAuthTemplates(templates, f)).rejects.toThrow(
    "do not request emails",
  );
});

test("requires evidence for both purposes, ignoring unrelated events and previous startups", async () => {
  const f = fixture(
    [
      event("recovery", 0),
      event("invite", 0),
      JSON.stringify({
        time: "2026-11-21T19:59:59Z",
        event: "templatemailer_reloader_template_update",
        level: "info",
        mail_type: "confirmation",
      }),
    ].join("\n"),
  );
  await expect(waitForAuthTemplates(templates, f)).rejects.toThrow("Timed out");
});

test("rejects later template errors even when older success events exist", async () => {
  const f = fixture(
    [
      event("confirmation", 0),
      event("recovery", 0),
      event("recovery", 10, true),
    ].join("\n"),
  );
  await expect(waitForAuthTemplates(templates, f)).rejects.toThrow("Timed out");
});

test("requires the exact project content, not just reachable files and load events", async () => {
  const f = fixture(event("confirmation", 0) + "\n" + event("recovery", 0));
  f.fetch.mockReturnValue("<p>Default link template</p>");
  await expect(waitForAuthTemplates(templates, f)).rejects.toThrow("Timed out");
});

test("retries unavailable template endpoints and missing logs without sending email", async () => {
  const f = fixture(event("confirmation", 0) + "\n" + event("recovery", 0));
  f.fetch.mockImplementationOnce(() => {
    throw new Error("synthetic-private-output");
  });
  await expect(waitForAuthTemplates(templates, f)).resolves.toBeUndefined();
  expect(f.sleep).toHaveBeenCalledTimes(1);
});

test("fails closed for unsupported diagnostics or missing configuration", async () => {
  const unsupported = fixture();
  unsupported.inspect.mockReturnValue({ ...state, image: "gotrue:unverified" });
  await expect(waitForAuthTemplates(templates, unsupported)).rejects.toThrow(
    "Unsupported local Auth version",
  );
  const missing = fixture();
  missing.inspect.mockReturnValue({
    ...state,
    templates: { ...state.templates, GOTRUE_MAILER_TEMPLATES_RECOVERY: "" },
  });
  await expect(waitForAuthTemplates(templates, missing)).rejects.toThrow(
    "configuration does not match",
  );
});

test("rejects a restarted Auth instead of accepting another container's events", async () => {
  const f = fixture(event("confirmation", 0) + "\n" + event("recovery", 0));
  f.inspect
    .mockReturnValueOnce(state)
    .mockReturnValue({ ...state, id: "replacement" });
  await expect(waitForAuthTemplates(templates, f)).rejects.toThrow(
    "Auth restarted",
  );
});

test("does not trust a plain reload message without the structured provider event", async () => {
  const f = fixture(
    JSON.stringify({
      time: "2026-11-21T20:00:10Z",
      level: "info",
      msg: "mailer: reloaded template type: recovery",
    }),
  );
  await expect(waitForAuthTemplates(templates, f)).rejects.toThrow("Timed out");
});

test("fails safely when logs are unavailable despite reachable templates", async () => {
  const f = fixture();
  f.logs.mockImplementation(() => {
    throw new Error("synthetic-private-output");
  });
  await expect(waitForAuthTemplates(templates, f)).rejects.toThrow(
    "Timed out confirming",
  );
});

test("does not accept a restart between evidence collection and the final identity check", async () => {
  const f = fixture(event("confirmation", 0) + "\n" + event("recovery", 0));
  f.inspect
    .mockReturnValueOnce(state)
    .mockReturnValueOnce(state)
    .mockReturnValue({ ...state, startedAt: "2026-11-21T20:01:00Z" });
  await expect(waitForAuthTemplates(templates, f)).rejects.toThrow(
    "Auth restarted",
  );
});

test("rejects the first fallback reload even when it crosses into a later second", async () => {
  const f = fixture(
    [
      event("confirmation", 0),
      event("recovery", 0, true),
      event("recovery", 1),
    ].join("\n"),
  );
  await expect(waitForAuthTemplates(templates, f)).rejects.toThrow("Timed out");
});

test("orders stderr failures before stdout reload evidence rather than trusting stream concatenation", () => {
  const fallback = [
    event("confirmation", 0),
    event("recovery", 1),
    event("recovery", 0, true),
  ].join("\n");
  expect(loadedAuthTemplates(fallback, start)).toEqual(["confirmation"]);
  expect(
    loadedAuthTemplates(fallback + "\n" + event("recovery", 10), start),
  ).toEqual(["confirmation", "recovery"]);
});
