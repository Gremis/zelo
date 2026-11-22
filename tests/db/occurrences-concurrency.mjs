import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { randomUUID, randomInt } from "node:crypto";

const container = "supabase_db_zelo-local";
const user = randomUUID();
const condominiums = [randomUUID(), randomUUID()];
const lock = randomInt(1, 2147483647);
const args = [
  "exec",
  "-i",
  container,
  "psql",
  "-X",
  "-qAt",
  "-v",
  "ON_ERROR_STOP=1",
  "-U",
  "postgres",
  "-d",
  "postgres",
];
function query(sql) {
  return execFileSync("docker", args, { input: sql, encoding: "utf8" }).trim();
}
function session(sql) {
  const child = spawn("docker", args, { stdio: ["pipe", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  const done = new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve(stdout) : reject(new Error(stderr)),
    );
  });
  child.stdin.write(sql);
  return { child, done, output: () => stdout };
}
const gate = session(`select pg_advisory_lock(${lock});\nselect 'ready';\n`);
const workers = [];
try {
  const deadline = Date.now() + 30000;
  while (!gate.output().includes("ready")) {
    assert.ok(Date.now() < deadline, "Coordinator lock timeout");
    await new Promise(setImmediate);
  }
  query(`begin;
    insert into auth.users(id,email) values ('${user}','${user}@example.invalid');
    insert into public.condominiums(id,manager_id,name,address) values
      ('${condominiums[0]}','${user}','Synthetic concurrency A','Synthetic address'),
      ('${condominiums[1]}','${user}','Synthetic concurrency B','Synthetic address');
    commit;`);
  for (let index = 0; index < 8; index++) {
    const worker = session(`begin;
      set local statement_timeout='30s';
      insert into public.occurrences(condominium_id,origin,channel,description)
      select '${condominiums[index % 2]}','manager_panel','phone','Synthetic concurrent report' from generate_series(1,25)
      returning number || ':' || tracking_code;
      select pg_advisory_xact_lock(${lock});
      rollback;\n`);
    worker.child.stdin.end();
    workers.push(worker);
  }
  const deadlineWorkers = Date.now() + 30000;
  while (
    Number(
      query(
        `select count(*) from pg_locks where locktype='advisory' and objid=${lock} and not granted;`,
      ),
    ) < 8
  ) {
    assert.ok(
      Date.now() < deadlineWorkers,
      "Concurrent transaction barrier timeout",
    );
    await new Promise(setImmediate);
  }
  gate.child.stdin.end(`select pg_advisory_unlock(${lock});\n`);
  await gate.done;
  const outputs = await Promise.all(workers.map((worker) => worker.done));
  const rows = outputs.flatMap((output) =>
    output.split("\n").filter((line) => /^\d+:[0-9a-f]{64}$/.test(line)),
  );
  assert.equal(rows.length, 200);
  assert.equal(new Set(rows.map((row) => row.split(":")[0])).size, 200);
  assert.equal(new Set(rows.map((row) => row.split(":")[1])).size, 200);
  console.log(
    "Passed: 8 overlapping transactions, 200 globally unique numbers and tracking codes across 2 condominiums; inserts rolled back.",
  );
} finally {
  gate.child.stdin.end();
  await gate.done.catch(() => {});
  await Promise.allSettled(workers.map((worker) => worker.done));
  query(`begin;
    delete from public.condominiums where id in ('${condominiums[0]}','${condominiums[1]}');
    delete from auth.users where id='${user}';
    commit;`);
}
