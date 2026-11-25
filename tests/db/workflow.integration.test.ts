import { execFileSync } from "node:child_process";
import { randomUUID, randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, afterAll, test, expect, vi } from "vitest";
import sharp from "sharp";
import {
  prepareUploads,
  processUploadFile,
  manageUploads,
} from "@/server/occurrences/uploads";
import type { UploadState } from "@/lib/occurrences/uploads";
vi.mock("server-only", () => ({}));
let config: Record<string, string>;
let admin: SupabaseClient;
const accounts: { id: string; client: SupabaseClient }[] = [];
const condo = randomUUID(),
  otherCondo = randomUUID(),
  employee = randomUUID(),
  role = randomUUID();
const occurrences: string[] = [];
function sql(input: string) {
  return execFileSync(
    "docker",
    [
      "exec",
      "-i",
      "supabase_db_zelo-local",
      "psql",
      "-X",
      "-qAt",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    { input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
  ).trim();
}
async function createOccurrence(status = "new") {
  const id = randomUUID();
  occurrences.push(id);
  sql(
    `insert into public.occurrences(id,condominium_id,origin,channel,description,status,suggested_priority,suggestion_source,suggestion_at,suggestion_reason) values('${id}','${condo}','manager_panel','web','Synthetic workflow','${status}','normal','rules',now(),'Synthetic rule');`,
  );
  return id;
}
async function detail(id: string) {
  const result = await accounts[0].client.rpc("occurrence_detail", {
    target_occurrence: id,
  });
  expect(result.error).toBeNull();
  return result.data;
}
async function command(
  id: string,
  type: string,
  payload: unknown,
  version: number,
  key = randomUUID(),
  client = accounts[0].client,
) {
  return client.rpc("occurrence_command", {
    target_occurrence: id,
    command_key: key,
    expected_version: version,
    command_type: type,
    payload,
  });
}
beforeAll(async () => {
  config = JSON.parse(
    execFileSync("node_modules/.bin/supabase", ["status", "-o", "json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }),
  );
  if (config.API_URL !== "http://127.0.0.1:54321")
    throw new Error("Local stack required.");
  process.env.NEXT_PUBLIC_SUPABASE_URL = config.API_URL;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = config.ANON_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = config.SERVICE_ROLE_KEY;
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  admin = createClient(config.API_URL, config.SERVICE_ROLE_KEY, options);
  for (let i = 0; i < 2; i++) {
    const email = `ori72-${randomUUID()}@example.invalid`,
      password = `Local${randomUUID()}9`;
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: "Synthetic workflow manager",
        is_sindico: true,
      },
    });
    if (created.error || !created.data.user)
      throw new Error("Synthetic account unavailable.");
    const client = createClient(config.API_URL, config.ANON_KEY, options);
    expect(
      (await client.auth.signInWithPassword({ email, password })).error,
    ).toBeNull();
    accounts.push({ id: created.data.user.id, client });
  }
  sql(
    `insert into public.condominiums(id,manager_id,name,address) values('${condo}','${accounts[0].id}','Synthetic workflow','Synthetic address'),('${otherCondo}','${accounts[1].id}','Synthetic other','Synthetic address'); insert into public.funcoes(id,sindico_id,nome) values('${role}','${accounts[0].id}','Synthetic role'); insert into public.funcionarios(id,sindico_id,condominio_id,funcao_id,nome,celular,horario_trabalho) values('${employee}','${accounts[0].id}','${condo}','${role}','Synthetic employee','11900000001','00:00–00:01');`,
  );
});
afterAll(async () => {
  if (!admin || !accounts.length) return;
  const ids = occurrences.map((id) => `'${id}'`).join(",") || "null";
  const paths = sql(
    `select coalesce(json_agg(path),'[]') from (select source_path path from private.occurrence_upload_files where session_id in(select id from private.occurrence_upload_sessions where manager_id='${accounts[0].id}') union all select evidence_path from private.occurrence_upload_files where session_id in(select id from private.occurrence_upload_sessions where manager_id='${accounts[0].id}')) p;`,
  );
  const objects = JSON.parse(paths) as string[];
  if (objects.length)
    await admin.storage.from("occurrence-evidence").remove(objects);
  sql(
    `begin;delete from private.occurrence_commands where occurrence_id in(${ids});delete from private.occurrence_upload_files where session_id in(select id from private.occurrence_upload_sessions where manager_id='${accounts[0].id}');delete from private.occurrence_upload_sessions where manager_id='${accounts[0].id}';delete from public.occurrence_attachments where occurrence_id in(${ids});delete from public.occurrence_events where occurrence_id in(${ids});delete from public.occurrences where id in(${ids});delete from public.funcionarios where id='${employee}';delete from public.funcoes where id='${role}';delete from public.condominiums where id in('${condo}','${otherCondo}');commit;`,
  );
  for (const account of accounts) await admin.auth.admin.deleteUser(account.id);
});
test("A: responsibility, no-op blur, first timestamp, human priority and idempotent recovery", async () => {
  const id = await createOccurrence();
  const key = randomUUID();
  const input = { kind: "manager" };
  const initial = await command(id, "responsible", input, 0, key);
  expect(initial.error).toBeNull();
  expect(initial.data.status).toBe("in_progress");
  expect(initial.data.suggestionPending).toBe(false);
  const recovered = await command(id, "responsible", input, 0, key);
  expect(recovered.data).toEqual(initial.data);
  expect(
    (
      await command(
        id,
        "responsible",
        { kind: "provider", name: "Synthetic provider" },
        0,
        key,
      )
    ).error?.code,
  ).toBe("P0003");
  const noOp = await command(id, "responsible", input, initial.data.version);
  expect(noOp.data.version).toBe(initial.data.version);
  expect(
    sql(
      `select count(*) from public.occurrence_events where occurrence_id='${id}'`,
    ),
  ).toBe("1");
  await accounts[0].client.rpc("decide_occurrence_priority", {
    target_occurrence: id,
    decided_priority: "urgent",
  });
  const changed = await command(
    id,
    "responsible",
    { kind: "provider", name: "Synthetic provider" },
    (await detail(id)).version,
  );
  expect(changed.error).toBeNull();
  expect(changed.data.firstResponsibleAt).toBe(initial.data.firstResponsibleAt);
  expect(changed.data.finalPriority).toBe("urgent");
  expect(changed.data.events[0].text).toContain("Anterior:");
  expect(
    (
      await command(
        id,
        "responsible",
        input,
        changed.data.version,
        randomUUID(),
        accounts[1].client,
      )
    ).error?.code,
  ).toBe("42501");
});
test("A: concurrent tabs cannot overwrite the winner", async () => {
  const id = await createOccurrence();
  const results = await Promise.all([
    command(id, "responsible", { kind: "manager" }, 0),
    command(id, "responsible", { kind: "provider", name: "Synthetic" }, 0),
  ]);
  expect(results.filter((result) => !result.error)).toHaveLength(1);
  expect(results.find((result) => result.error)?.error?.code).toBe("P0003");
});
test("B/C: civil deadline, delegation clears it, deactivation releases and reactivation does not restore", async () => {
  const id = await createOccurrence();
  let result = await command(id, "responsible", { kind: "manager" }, 0);
  result = await command(
    id,
    "deadline",
    { date: "2027-01-01" },
    result.data.version,
  );
  expect(result.data.dueDate).toBe("2027-01-01");
  result = await command(
    id,
    "delegate",
    { employeeId: employee, message: "Synthetic edited message" },
    result.data.version,
  );
  expect(result.error).toBeNull();
  expect(result.data.status).toBe("delegated");
  expect(result.data.dueDate).toBeNull();
  expect(
    result.data.events.some((event: { text: string }) =>
      event.text.includes("Previsão removida"),
    ),
  ).toBe(true);
  expect(
    (await command(id, "deadline", { date: "2027-02-01" }, result.data.version))
      .error?.code,
  ).toBe("P0003");
  expect(
    (
      await accounts[0].client
        .from("funcionarios")
        .update({ ativo: false })
        .eq("id", employee)
    ).error,
  ).toBeNull();
  const released = await detail(id);
  expect(released.status).toBe("new");
  expect(released.responsibleEmployeeId).toBeNull();
  expect(released.events[0].authorIsViewer).toBe(true);
  expect(
    (
      await command(
        id,
        "delegate",
        { employeeId: employee, message: "Synthetic" },
        released.version,
      )
    ).error?.code,
  ).toBe("22023");
  await accounts[0].client
    .from("funcionarios")
    .update({ ativo: true })
    .eq("id", employee);
  expect((await detail(id)).status).toBe("new");
});
test("C: deadline changes/removal are no-op safe and invalid dates rollback", async () => {
  const id = await createOccurrence();
  let result = await command(id, "responsible", { kind: "manager" }, 0);
  result = await command(
    id,
    "deadline",
    { date: "2028-02-29" },
    result.data.version,
  );
  expect(result.error).toBeNull();
  const v = result.data.version;
  result = await command(id, "deadline", { date: "2028-02-29" }, v);
  expect(result.data.version).toBe(v);
  expect(
    (await command(id, "deadline", { date: "2027-02-29" }, v)).error,
  ).not.toBeNull();
  expect((await detail(id)).version).toBe(v);
  result = await command(id, "deadline", { date: null }, v);
  expect(result.data.dueDate).toBeNull();
});
test("D: new rejects completion, simultaneous completion wins once and terminal writes fail", async () => {
  const id = await createOccurrence();
  expect((await command(id, "complete", {}, 0)).error?.code).toBe("P0003");
  let result = await command(id, "responsible", { kind: "manager" }, 0);
  const key = randomUUID();
  const results = await Promise.all([
    command(
      id,
      "complete",
      { comment: "Synthetic resolution" },
      result.data.version,
      key,
    ),
    command(
      id,
      "complete",
      { comment: "Other resolution" },
      result.data.version,
    ),
  ]);
  expect(results.filter((item) => !item.error)).toHaveLength(1);
  result = results.find((item) => !item.error)!;
  const completed = await detail(id);
  expect(completed.status).toBe("completed");
  expect(completed.completedAt).toBeTruthy();
  expect(
    (await command(id, "responsible", { kind: "manager" }, completed.version))
      .error?.code,
  ).toBe("P0003");
  expect(
    (await command(id, "deadline", { date: null }, completed.version)).error
      ?.code,
  ).toBe("P0003");
  expect(
    (
      await accounts[0].client.rpc("append_occurrence_note", {
        target_occurrence: id,
        note: "Late note",
      })
    ).error?.code,
  ).toBe("P0003");
  expect(
    (
      await accounts[0].client.rpc("decide_occurrence_priority", {
        target_occurrence: id,
        decided_priority: "low",
      })
    ).error?.code,
  ).toBe("55000");
  expect(
    sql(
      `select count(*) from public.occurrence_events where occurrence_id='${id}' and event_type='completed'`,
    ),
  ).toBe("1");
  expect(
    (
      await accounts[0].client
        .from("occurrence_events")
        .update({ internal_description: "Changed" })
        .eq("occurrence_id", id)
    ).error,
  ).not.toBeNull();
});
test("D: verified private upload links atomically and retries preserve linked evidence", async () => {
  const id = await createOccurrence();
  const start = await command(id, "responsible", { kind: "manager" }, 0);
  const scope = { occurrenceId: id, actorId: accounts[0].id };
  const key = randomUUID(),
    secret = randomBytes(32).toString("hex");
  const png = await sharp({
    create: { width: 4, height: 4, channels: 3, background: "white" },
  })
    .png()
    .toBuffer();
  const request = (method = "POST", body?: unknown) =>
    new Request("http://localhost/upload", {
      method,
      headers: {
        "Upload-Token": secret,
        "Idempotency-Key": key,
        "Content-Type": "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  const prepared = await prepareUploads(
    request("POST", [
      { name: "synthetic.png", contentType: "image/png", size: png.length },
    ]),
    "",
    scope,
  );
  expect(prepared.status).toBe(200);
  const state = (await prepared.json()) as UploadState;
  const file = state.files[0];
  const denied = await manageUploads(request("GET"), "", key, {
    occurrenceId: id,
    actorId: accounts[1].id,
  });
  expect(denied.status).toBe(404);
  const incomplete = await command(
    id,
    "complete",
    { uploadKey: key, uploadSecret: secret },
    start.data.version,
  );
  expect(incomplete.error?.code).toBe("P0003");
  expect((await detail(id)).status).toBe("in_progress");
  const authorized = await processUploadFile(
    request(),
    "",
    key,
    file.id,
    "authorize",
    scope,
  );
  expect(authorized.status).toBe(200);
  const auth = await authorized.json();
  expect(
    (
      await admin.storage
        .from(auth.bucket)
        .uploadToSignedUrl(auth.path, auth.token, png, {
          contentType: "image/png",
          upsert: false,
        })
    ).error,
  ).toBeNull();
  expect(
    (await processUploadFile(request(), "", key, file.id, "validate", scope))
      .status,
  ).toBe(200);
  const commandKey = randomUUID();
  const payload = {
    comment: "Synthetic completion",
    uploadKey: key,
    uploadSecret: secret,
  };
  const completed = await command(
    id,
    "complete",
    payload,
    start.data.version,
    commandKey,
  );
  expect(completed.error).toBeNull();
  expect(completed.data.events[0].attachments).toHaveLength(1);
  expect(
    (await command(id, "complete", payload, start.data.version, commandKey))
      .data,
  ).toEqual(completed.data);
  expect((await manageUploads(request("DELETE"), "", key, scope)).status).toBe(
    409,
  );
  const attachment = sql(
    `select storage_path from public.occurrence_attachments where occurrence_id='${id}'`,
  );
  expect(
    (await admin.storage.from("occurrence-evidence").download(attachment))
      .error,
  ).toBeNull();
});

test("B: selection racing deactivation never leaves an inactive assignee", async () => {
  const id = await createOccurrence();
  const assumed = await command(id, "responsible", { kind: "manager" }, 0);
  const [delegation, deactivation] = await Promise.all([
    command(
      id,
      "delegate",
      { employeeId: employee, message: "Synthetic race" },
      assumed.data.version,
    ),
    accounts[0].client
      .from("funcionarios")
      .update({ ativo: false })
      .eq("id", employee),
  ]);
  expect(deactivation.error).toBeNull();
  const current = await detail(id);
  expect(current.responsibleEmployeeId).toBeNull();
  expect(current.status).toBe(delegation.error ? "in_progress" : "new");
  await accounts[0].client
    .from("funcionarios")
    .update({ ativo: true })
    .eq("id", employee);
});

test("B/D: employee and role edits preserve snapshots and deactivation preserves completed occurrences", async () => {
  const id = await createOccurrence();
  const delegated = await command(
    id,
    "delegate",
    { employeeId: employee, message: "Synthetic snapshot" },
    0,
  );
  expect(delegated.error).toBeNull();
  const before = sql(
    `select json_build_object('name',responsible_name,'role',responsible_role,'author',author_name)::text from public.occurrence_events where occurrence_id='${id}' and event_type='responsible_changed';`,
  );
  await accounts[0].client
    .from("funcionarios")
    .update({ nome: "Renamed synthetic employee" })
    .eq("id", employee);
  await accounts[0].client
    .from("funcoes")
    .update({ nome: "Renamed synthetic role" })
    .eq("id", role);
  expect(
    sql(
      `select json_build_object('name',responsible_name,'role',responsible_role,'author',author_name)::text from public.occurrence_events where occurrence_id='${id}' and event_type='responsible_changed';`,
    ),
  ).toBe(before);
  const completed = await command(id, "complete", {}, delegated.data.version);
  expect(completed.error).toBeNull();
  await accounts[0].client
    .from("funcionarios")
    .update({ ativo: false })
    .eq("id", employee);
  expect((await detail(id)).completedAt).toBe(completed.data.completedAt);
  expect((await detail(id)).status).toBe("completed");
  await accounts[0].client
    .from("funcionarios")
    .update({ ativo: true })
    .eq("id", employee);
});

test("A: concurrent retries of the same command return one receipt and event", async () => {
  const id = await createOccurrence(),
    key = randomUUID();
  const results = await Promise.all([
    command(id, "responsible", { kind: "manager" }, 0, key),
    command(id, "responsible", { kind: "manager" }, 0, key),
  ]);
  expect(results[0].error).toBeNull();
  expect(results[1].data).toEqual(results[0].data);
  expect(
    sql(
      `select count(*) from public.occurrence_events where occurrence_id='${id}'`,
    ),
  ).toBe("1");
  expect(results[0].data.events[0].text).toContain(
    "Prioridade sugerida mantida",
  );
});
