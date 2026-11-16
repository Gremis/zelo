import { execFileSync } from "node:child_process";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { format } from "prettier";

const root = fileURLToPath(new URL("../", import.meta.url));
const directory = new URL("../src/lib/supabase/", import.meta.url);
const temporary = new URL(`database.types.ts.${process.pid}.tmp`, directory);
const destination = new URL("database.types.ts", directory);
const cli = fileURLToPath(
  new URL("../node_modules/supabase/dist/supabase.js", import.meta.url),
);

try {
  const output = execFileSync(
    process.execPath,
    [cli, "gen", "types", "typescript", "--local", "--schema", "public"],
    { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
  );
  if (!output.trim()) {
    throw new Error("Local database type generation returned no output.");
  }
  const formatted = await format(output, { parser: "typescript" });
  const withoutComments = formatted.replace(/^\/\/.*\n/gm, "");
  await mkdir(directory, { recursive: true });
  await writeFile(temporary, withoutComments, { flag: "wx" });
  await rename(temporary, destination);
} finally {
  await rm(temporary, { force: true });
}
