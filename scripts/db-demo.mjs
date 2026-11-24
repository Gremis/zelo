import { readFileSync, existsSync, statSync } from "node:fs";
import { parseEnv } from "node:util";
import { registerServerImports } from "./demo-occurrences.runtime.mjs";
import {
  DemoError,
  localContext,
  prepareDemoAccount,
  loadDemo,
} from "./demo-occurrences.mjs";

try {
  const args = process.argv.slice(2);
  if (
    !args.includes("--local") ||
    args.some(
      (arg, index) =>
        !["--local", "--prepare-account", "--stop-after"].includes(arg) &&
        args[index - 1] !== "--stop-after",
    ) ||
    new Set(args).size !== args.length
  )
    throw new DemoError(
      "Use --local, optionally --prepare-account or --stop-after 1..4.",
    );
  if (process.versions.node.split(".")[0] !== "24")
    throw new DemoError("Use the project's Node.js 24 version.");
  const stopIndex = args.indexOf("--stop-after");
  const stopAfter = stopIndex < 0 ? 4 : Number(args[stopIndex + 1]);
  if (
    !Number.isInteger(stopAfter) ||
    stopAfter < 1 ||
    stopAfter > 4 ||
    (args.includes("--prepare-account") && stopIndex >= 0)
  )
    throw new DemoError(
      "--stop-after must be 1..4 and cannot be combined with --prepare-account.",
    );
  const context = localContext();
  const file = new URL("../.env.demo.local", import.meta.url);
  if (existsSync(file) && statSync(file).mode & 0o077)
    throw new DemoError(
      "The dedicated ignored demo password file must have mode 0600.",
    );
  const password =
    process.env.ZELO_DEMO_PASSWORD ??
    (existsSync(file)
      ? parseEnv(readFileSync(file, "utf8")).ZELO_DEMO_PASSWORD
      : undefined);
  if (!password || password.length < 12)
    throw new DemoError(
      "Set ZELO_DEMO_PASSWORD in the shell or a mode-0600 .env.demo.local file; never print or commit it.",
    );
  if (args.includes("--prepare-account")) {
    await prepareDemoAccount(context, password);
    console.log(
      "Dedicated local ORI-76 demo account prepared; no email was sent and no existing password was reset.",
    );
  } else {
    registerServerImports(new URL("../", import.meta.url));
    const result = await loadDemo(context, password, { stopAfter });
    console.log(JSON.stringify({ dataset: "ORI-76 local demo", ...result }));
  }
} catch (error) {
  console.error(
    error instanceof DemoError
      ? error.message
      : "Local demo operation failed. Provider details and receipts were suppressed; inspect local state and retry safely.",
  );
  process.exitCode = 1;
}
