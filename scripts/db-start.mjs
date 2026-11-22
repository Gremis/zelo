import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const project = "zelo-local";
const networkName = "zelo-local-loopback";
const bindingOption = "com.docker.network.bridge.host_binding_ipv4";
const label = "dev.zelo.project";
const root = fileURLToPath(new URL("../", import.meta.url));
const profile = process.env.ZELO_LOCAL_DB_PROFILE;
if (profile && !["gmail", "mailpit"].includes(profile)) {
  throw new Error("Unknown local database profile.");
}
const profileArgs = profile
  ? [
      "--workdir",
      fileURLToPath(
        new URL(`../supabase/.smtp-manual/${profile}/`, import.meta.url),
      ),
    ]
  : [];

function docker(args) {
  return execFileSync("docker", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function verifyContainers() {
  const ids = docker([
    "ps",
    "-a",
    "--filter",
    `label=com.supabase.cli.project=${project}`,
    "--format",
    "{{.ID}}",
  ])
    .split(/\s+/)
    .filter(Boolean);

  for (const id of ids) {
    const settings = JSON.parse(
      docker(["inspect", "--format", "{{json .NetworkSettings}}", id]),
    );
    if (!settings.Networks?.[networkName]) {
      throw new Error(
        "Existing Zelo containers use another network. Intentionally stop only this project with npm run db:stop, then retry db:start. Do not reset or stop other projects.",
      );
    }
    const bindings = Object.values(settings.Ports ?? {})
      .flat()
      .filter(Boolean);
    if (bindings.some(({ HostIp }) => !["127.0.0.1", "::1"].includes(HostIp))) {
      throw new Error(
        "Zelo has a non-loopback Docker port binding. Stop only this project with npm run db:stop and inspect its Docker network configuration before restarting.",
      );
    }
  }
}

let startupAttempted = false;

function stopRunningProjectContainers() {
  const ids = docker([
    "ps",
    "--filter",
    `label=com.supabase.cli.project=${project}`,
    "--format",
    "{{.ID}}",
  ])
    .split(/\s+/)
    .filter(Boolean);
  const failures = [];
  for (const id of ids) {
    try {
      docker(["stop", id]);
    } catch {
      failures.push(id);
    }
  }
  if (failures.length > 0) {
    throw new Error(`Could not stop Zelo containers: ${failures.join(", ")}`);
  }
}

try {
  const existing = docker([
    "network",
    "ls",
    "--filter",
    `name=^${networkName}$`,
    "--format",
    "{{.ID}}",
  ]);
  if (!existing) {
    docker([
      "network",
      "create",
      "--driver",
      "bridge",
      "--label",
      `${label}=${project}`,
      "--opt",
      `${bindingOption}=127.0.0.1`,
      networkName,
    ]);
  }
  const [network] = JSON.parse(docker(["network", "inspect", networkName]));
  if (
    network.Driver !== "bridge" ||
    network.Labels?.[label] !== project ||
    network.Options?.[bindingOption] !== "127.0.0.1"
  ) {
    throw new Error(
      "The Zelo network name is occupied by an unrecognized or unsafe network. Inspect it manually; this script will not modify it.",
    );
  }
  verifyContainers();
  const cli = fileURLToPath(
    new URL("../node_modules/supabase/dist/supabase.js", import.meta.url),
  );
  startupAttempted = true;
  execFileSync(
    process.execPath,
    [cli, "start", "--network-id", networkName, ...profileArgs],
    {
      cwd: root,
      stdio: "inherit",
    },
  );
  verifyContainers();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
  if (startupAttempted) {
    try {
      stopRunningProjectContainers();
    } catch (cleanupError) {
      console.error(
        "Cleanup failed:",
        cleanupError instanceof Error
          ? cleanupError.message
          : String(cleanupError),
      );
    }
  }
}
