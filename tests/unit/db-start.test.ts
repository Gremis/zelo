import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { afterEach, expect, test } from "vitest";

const directories: string[] = [];

afterEach(() => {
  directories
    .splice(0)
    .forEach((directory) =>
      rmSync(directory, { recursive: true, force: true }),
    );
});

function runStartup(scenario: string, profile?: string) {
  const root = mkdtempSync(join(tmpdir(), "zelo-network-test-"));
  directories.push(root);
  mkdirSync(join(root, "scripts"));
  mkdirSync(join(root, "bin"));
  mkdirSync(join(root, "node_modules/supabase/dist"), { recursive: true });
  copyFileSync("scripts/db-start.mjs", join(root, "scripts/db-start.mjs"));
  writeFileSync(
    join(root, "node_modules/supabase/dist/supabase.js"),
    `const fs = require("node:fs");
fs.writeFileSync("cli-arguments.json", JSON.stringify(process.argv.slice(2)));
if (["startup-failure", "cleanup-failure", "cleanup-list-failure", "no-running"].includes(process.env.ZELO_TEST_SCENARIO)) {
  console.error("Original startup failure");
  process.exit(23);
}`,
  );
  writeFileSync(
    join(root, "bin/docker"),
    `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
fs.appendFileSync("docker-calls.jsonl", JSON.stringify(args) + "\\n");
const scenario = process.env.ZELO_TEST_SCENARIO;
if (scenario === "denied") process.exit(1);
if (args[0] === "network" && args[1] === "ls") {
  console.log(scenario === "new" ? "" : "network-id");
} else if (args[0] === "network" && args[1] === "inspect") {
  console.log(JSON.stringify([{
    Driver: "bridge",
    Labels: { "dev.zelo.project": "zelo-local" },
    Options: { "com.docker.network.bridge.host_binding_ipv4": scenario === "unsafe-network" ? "0.0.0.0" : "127.0.0.1" }
  }]));
} else if (args[0] === "ps") {
  if (!args.includes("-a")) {
    if (scenario === "cleanup-list-failure") process.exit(1);
    console.log(scenario === "no-running" ? "" : "running-one\\nrunning-two");
  } else {
    console.log(scenario === "unsafe-port" || (scenario === "post-unsafe" && fs.existsSync("cli-arguments.json")) ? "container-id" : "");
  }
} else if (args[0] === "stop") {
  if (scenario === "cleanup-failure" && args[1] === "running-one") process.exit(1);
} else if (args[0] === "inspect") {
  console.log(JSON.stringify({ Networks: { "zelo-local-loopback": {} }, Ports: { "8000/tcp": [{ HostIp: "0.0.0.0", HostPort: "54321" }] } }));
}
`,
    { mode: 0o755 },
  );
  const result = spawnSync(
    process.execPath,
    [join(root, "scripts/db-start.mjs")],
    {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${join(root, "bin")}${delimiter}${process.env.PATH}`,
        ZELO_TEST_SCENARIO: scenario,
        ...(profile ? { ZELO_LOCAL_DB_PROFILE: profile } : {}),
      },
    },
  );
  const calls = readFileSync(join(root, "docker-calls.jsonl"), "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as string[]);
  return { root, result, calls };
}

test("creates a loopback network and starts the local CLI on that network", () => {
  const { root, result, calls } = runStartup("new");
  expect(result.status).toBe(0);
  expect(calls).toContainEqual([
    "network",
    "create",
    "--driver",
    "bridge",
    "--label",
    "dev.zelo.project=zelo-local",
    "--opt",
    "com.docker.network.bridge.host_binding_ipv4=127.0.0.1",
    "zelo-local-loopback",
  ]);
  expect(
    JSON.parse(readFileSync(join(root, "cli-arguments.json"), "utf8")),
  ).toEqual(["start", "--network-id", "zelo-local-loopback"]);
});

test.each(["unsafe-network", "unsafe-port", "denied"])(
  "rejects %s without starting Supabase or modifying existing resources",
  (scenario) => {
    const { root, result, calls } = runStartup(scenario);
    expect(result.status).not.toBe(0);
    expect(() => readFileSync(join(root, "cli-arguments.json"))).toThrow();
    expect(
      calls.every(([command]) =>
        ["network", "ps", "inspect"].includes(command),
      ),
    ).toBe(true);
    expect(
      calls.some(([, operation]) =>
        ["create", "rm", "disconnect"].includes(operation),
      ),
    ).toBe(false);
  },
);

test.each(["startup-failure", "post-unsafe"])(
  "stops only running project containers after %s, preserving the original error",
  (scenario) => {
    const { result, calls } = runStartup(scenario);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      scenario === "startup-failure"
        ? "Original startup failure"
        : "non-loopback Docker port binding",
    );
    expect(calls).toContainEqual([
      "ps",
      "--filter",
      "label=com.supabase.cli.project=zelo-local",
      "--format",
      "{{.ID}}",
    ]);
    expect(calls.filter(([command]) => command === "stop")).toEqual([
      ["stop", "running-one"],
      ["stop", "running-two"],
    ]);
    expect(
      calls.some((args) =>
        args.some((arg) =>
          ["rm", "prune", "volume", "disconnect"].includes(arg),
        ),
      ),
    ).toBe(false);
  },
);

test.each(["cleanup-failure", "cleanup-list-failure"])(
  "reports %s separately without replacing the startup failure",
  (scenario) => {
    const { result, calls } = runStartup(scenario);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Original startup failure");
    expect(result.stderr).toContain("Cleanup failed:");
    expect(result.stderr.indexOf("Original startup failure")).toBeLessThan(
      result.stderr.indexOf("Cleanup failed:"),
    );
    if (scenario === "cleanup-failure") {
      expect(calls).toContainEqual(["stop", "running-two"]);
    }
  },
);

test("does not invoke stop when no project containers are running after failure", () => {
  const { result, calls } = runStartup("no-running");
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("Original startup failure");
  expect(calls.some(([command]) => command === "stop")).toBe(false);
  expect(result.stderr).not.toContain("Cleanup failed:");
});

test.each(["gmail", "mailpit"])(
  "keeps network checks and targets the isolated %s workdir",
  (profile) => {
    const { root, result } = runStartup("new", profile);
    expect(result.status).toBe(0);
    expect(
      JSON.parse(readFileSync(join(root, "cli-arguments.json"), "utf8")),
    ).toEqual([
      "start",
      "--network-id",
      "zelo-local-loopback",
      "--workdir",
      `${join(realpathSync(root), "supabase/.smtp-manual", profile)}/`,
    ]);
  },
);
