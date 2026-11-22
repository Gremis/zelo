import { execFileSync } from "node:child_process";
import { expect, test } from "vitest";
import {
  verifyLocalDestination,
  verifyDockerEndpoint,
} from "../../scripts/demo-occurrences.mjs";
import {
  DEMO_CONDOMINIUMS,
  DEMO_OCCURRENCES,
} from "../../scripts/demo-occurrences.data.mjs";
import { detectRisk } from "@/lib/occurrences/risk-rules";

const config = {
  API_URL: "http://127.0.0.1:54321",
  ANON_KEY: "synthetic-anon",
  SERVICE_ROLE_KEY: "synthetic-service",
};
const containers = () => [
  {
    Name: "/supabase_db_zelo-local",
    State: { Running: true },
    Config: { Labels: { "com.supabase.cli.project": "zelo-local" } },
    NetworkSettings: {
      Ports: { "5432/tcp": [{ HostIp: "127.0.0.1", HostPort: "54322" }] },
    },
  },
  {
    Name: "/supabase_kong_zelo-local",
    State: { Running: true },
    Config: { Labels: { "com.supabase.cli.project": "zelo-local" } },
    NetworkSettings: {
      Ports: { "8000/tcp": [{ HostIp: "127.0.0.1", HostPort: "54321" }] },
    },
  },
];

test("accepts only the verified loopback project", () => {
  expect(() => verifyLocalDestination(config, containers())).not.toThrow();
});

test.each([
  "https://example.invalid",
  "http://localhost:54321",
  "http://127.0.0.1:54322",
])("rejects destination %s", (API_URL) => {
  expect(() =>
    verifyLocalDestination({ ...config, API_URL }, containers()),
  ).toThrow();
});

test.each(["0.0.0.0", "::", "192.0.2.1"])(
  "rejects exposed binding %s",
  (HostIp) => {
    const values = containers();
    values[0].NetworkSettings.Ports["5432/tcp"]![0].HostIp = HostIp;
    expect(() => verifyLocalDestination(config, values)).toThrow();
  },
);

test("rejects missing, stopped, unrelated or wrongly mapped containers", () => {
  expect(() => verifyLocalDestination(config, [])).toThrow();
  const stopped = containers();
  stopped[0].State.Running = false;
  expect(() => verifyLocalDestination(config, stopped)).toThrow();
  const unrelated = containers();
  unrelated[0].Config.Labels["com.supabase.cli.project"] = "other-project";
  expect(() => verifyLocalDestination(config, unrelated)).toThrow();
  const wrongPort = containers();
  wrongPort[0].NetworkSettings.Ports["5432/tcp"]![0].HostPort = "12345";
  expect(() => verifyLocalDestination(config, wrongPort)).toThrow();
});

test("synthetic data covers two condominiums and urgent/normal via the real engine without stored classifications", () => {
  expect(DEMO_CONDOMINIUMS).toHaveLength(2);
  expect(DEMO_OCCURRENCES).toHaveLength(4);
  expect(new Set(DEMO_OCCURRENCES.map(({ key }) => key)).size).toBe(4);
  expect(
    DEMO_OCCURRENCES.map(
      ({ location, description }) => detectRisk(location, description).hasRisk,
    ),
  ).toEqual([false, true, false, true]);
  for (const fixture of DEMO_OCCURRENCES) {
    expect(fixture).not.toHaveProperty("priority");
    expect(fixture).not.toHaveProperty("suggestedPriority");
    expect(fixture).not.toHaveProperty("registeredAt");
    expect(fixture.description).toContain("sintético");
  }
});

test.each([
  { args: [] },
  { args: ["--local", "--stop-after", "0"] },
  { args: ["--local", "--stop-after", "5"] },
  { args: ["--local", "--remote"] },
  { args: ["--local", "--prepare-account", "--stop-after", "1"] },
])("invalid CLI options fail before inspecting services %#", ({ args }) => {
  expect(() =>
    execFileSync(
      process.execPath,
      [
        "--experimental-transform-types",
        "--conditions=react-server",
        "scripts/db-demo.mjs",
        ...args,
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    ),
  ).toThrow();
});

test.each([
  { CI: "true" },
  { NEXT_PUBLIC_SUPABASE_URL: "https://example.invalid" },
])(
  "rejects CI and ambient remote configuration before accessing services %#",
  (env) => {
    expect(() =>
      execFileSync(
        process.execPath,
        [
          "--experimental-transform-types",
          "--conditions=react-server",
          "scripts/db-demo.mjs",
          "--local",
        ],
        {
          env: { ...process.env, ...env },
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        },
      ),
    ).toThrow();
  },
);

test("accepts local Docker Unix sockets", () => {
  expect(() =>
    verifyDockerEndpoint("unix:///var/run/docker.sock"),
  ).not.toThrow();
});

test.each([
  "ssh://example.invalid",
  "tcp://127.0.0.1:2375",
  "tcp://example.invalid:2376",
  "https://example.invalid",
  "unix://example.invalid/run/docker.sock",
  "unix:///",
  undefined,
])("rejects remote or malformed Docker endpoint %s", (endpoint) => {
  expect(() => verifyDockerEndpoint(endpoint)).toThrow();
});

test("rejects a remote Docker host before inspecting containers or reading a password", () => {
  expect(() =>
    execFileSync(
      process.execPath,
      [
        "--experimental-transform-types",
        "--conditions=react-server",
        "scripts/db-demo.mjs",
        "--local",
      ],
      {
        env: { ...process.env, CI: "", DOCKER_HOST: "ssh://example.invalid" },
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    ),
  ).toThrow();
});
