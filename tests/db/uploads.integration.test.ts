import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import sharp from "sharp";
import { PDFDocument } from "pdf-lib";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, expect, test, vi } from "vitest";
import {
  prepareUploads,
  manageUploads,
  processUploadFile,
  cleanupUploads,
  uploadOperation,
} from "@/server/occurrences/uploads";
import { registerPublicRequest } from "@/server/occurrences/public.http";
import type {
  UploadState,
  UploadManifestFile,
} from "@/lib/occurrences/uploads";

vi.mock("server-only", () => ({}));

const bucket = "occurrence-evidence";
const owner = randomUUID();
const otherOwner = randomUUID();
const condominiums: string[] = [];
let admin: SupabaseClient;
let anon: SupabaseClient;
let config: Record<string, string>;
let png: Buffer;
const fields = {
  reporterName: "Synthetic reporter",
  reporterPhone: "11900000000",
  reporterUnitOrRole: "Synthetic unit",
  location: "Synthetic hall",
  description: "Synthetic attachment report",
};
type Attempt = {
  key: string;
  secret: string;
  slug: string;
  condominium: string;
  state: UploadState;
};

function q(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}
function sql(value: string) {
  try {
    return execFileSync(
      "docker",
      [
        "exec",
        "-i",
        "supabase_db_zelo-local",
        "psql",
        "-X",
        "-qAt",
        "-v",
        "ON_ERROR_STOP=1",
        "-U",
        "postgres",
        "-d",
        "postgres",
      ],
      { input: value, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
    ).trim();
  } catch {
    throw new Error("Local upload integration SQL failed.");
  }
}
function request(
  attempt: Pick<Attempt, "key" | "secret">,
  method = "POST",
  body?: unknown,
) {
  return new Request("http://localhost/api/upload-test", {
    method,
    headers: {
      "Idempotency-Key": attempt.key,
      "Upload-Token": attempt.secret,
      "Content-Type": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
async function condominium(manager = owner) {
  const id = randomUUID();
  sql(
    `insert into public.condominiums(id,manager_id,name,address) values(${q(id)},${q(manager)},'Synthetic upload condominium','Synthetic address');`,
  );
  condominiums.push(id);
  return {
    id,
    slug: sql(`select slug from public.condominiums where id=${q(id)}`),
  };
}
function manifest(
  bytes: Buffer,
  contentType: UploadManifestFile["contentType"] = "image/png",
  name = "synthetic.png",
) {
  return { name, contentType, size: bytes.length };
}
async function prepare(
  files: UploadManifestFile[] = [manifest(png)],
  manager = owner,
): Promise<Attempt> {
  const c = await condominium(manager);
  const attempt = {
    key: randomUUID(),
    secret: randomBytes(32).toString("hex"),
    slug: c.slug,
    condominium: c.id,
  };
  const response = await prepareUploads(
    request(attempt, "POST", files),
    c.slug,
  );
  expect(response.status).toBe(200);
  return { ...attempt, state: await response.json() };
}
async function authorize(a: Attempt, fileId = a.state.files[0].id) {
  const response = await processUploadFile(
    request(a),
    a.slug,
    a.key,
    fileId,
    "authorize",
  );
  expect(response.status).toBe(200);
  return (await response.json()) as {
    path: string;
    token: string;
    signedUrl: string;
  };
}
async function put(a: Attempt, bytes = png, index = 0) {
  const auth = await authorize(a, a.state.files[index].id);
  const { error } = await anon.storage
    .from(bucket)
    .uploadToSignedUrl(auth.path, auth.token, bytes, {
      contentType: a.state.files[index].contentType,
    });
  expect(error).toBeNull();
  return auth;
}
function validate(a: Attempt, index = 0) {
  return processUploadFile(
    request(a),
    a.slug,
    a.key,
    a.state.files[index].id,
    "validate",
  );
}
function finish(a: Attempt, body = fields) {
  return registerPublicRequest(request(a, "POST", body), a.slug);
}
function age(a: Attempt) {
  sql(
    `update private.occurrence_upload_sessions set last_activity_at=clock_timestamp()-interval '73 hours',expires_at=clock_timestamp()-interval '49 hours' where id=${q(a.key)}`,
  );
}
function cron() {
  return cleanupUploads(
    new Request("http://localhost/api/internal/attachments/cleanup", {
      headers: { Authorization: "Bearer synthetic-cleanup-secret" },
    }),
  );
}

beforeAll(async () => {
  config = JSON.parse(
    execFileSync("node_modules/.bin/supabase", ["status", "-o", "json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }),
  );
  if (
    config.API_URL !== "http://127.0.0.1:54321" ||
    !config.SERVICE_ROLE_KEY ||
    !config.ANON_KEY
  )
    throw new Error("Expected local loopback Supabase stack.");
  if (sql("select count(*) from private.occurrence_upload_sessions") !== "0")
    throw new Error(
      "Upload integration cleanup requires an initially empty upload-session table.",
    );
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", config.API_URL);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", config.ANON_KEY);
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", config.SERVICE_ROLE_KEY);
  vi.stubEnv("CRON_SECRET", "synthetic-cleanup-secret");
  admin = createClient(config.API_URL, config.SERVICE_ROLE_KEY);
  anon = createClient(config.API_URL, config.ANON_KEY);
  sql(
    `insert into auth.users(id,email) values(${q(owner)},${q(`${owner}@example.invalid`)}),(${q(otherOwner)},${q(`${otherOwner}@example.invalid`)});`,
  );
  png = await sharp({
    create: { width: 16, height: 16, channels: 3, background: "#116644" },
  })
    .png()
    .toBuffer();
});

afterAll(async () => {
  if (admin && condominiums.length) {
    const ids = condominiums.map(q).join(",");
    const paths = sql(
      `select json_agg(p.path) from private.occurrence_upload_files f join private.occurrence_upload_sessions s on s.id=f.session_id cross join lateral(values(f.source_path),(f.evidence_path)) p(path) where s.condominium_id in (${ids})`,
    );
    if (paths && paths !== "null")
      await admin.storage.from(bucket).remove(JSON.parse(paths));
    sql(`begin;
      delete from public.occurrence_attachments where occurrence_id in(select id from public.occurrences where condominium_id in(${ids}));
      delete from private.occurrence_upload_files where session_id in(select id from private.occurrence_upload_sessions where condominium_id in(${ids}));
      delete from private.occurrence_upload_sessions where condominium_id in(${ids});
      delete from private.public_registration_attempts where condominium_id in(${ids});
      delete from public.occurrence_events where occurrence_id in(select id from public.occurrences where condominium_id in(${ids}));
      delete from public.occurrences where condominium_id in(${ids});
      delete from public.condominiums where id in(${ids});
      commit;`);
  }
  sql(`delete from auth.users where id in(${q(owner)},${q(otherOwner)});`);
  vi.unstubAllEnvs();
});

test("private provisioning denies general object and session access", async () => {
  const { data, error } = await admin.storage.getBucket(bucket);
  expect(error).toBeNull();
  expect(data?.public).toBe(false);
  expect(data?.file_size_limit).toBe(25 * 1024 * 1024);
  expect(
    sql(
      "select has_table_privilege('anon','private.occurrence_upload_sessions','select') or has_table_privilege('authenticated','private.occurrence_upload_files','insert') or has_table_privilege('service_role','private.occurrence_upload_files','insert')",
    ),
  ).toBe("f");
  const rpc = await anon.rpc("occurrence_upload_operation", {
    operation: "cleanup",
    session_key: null,
  });
  expect(rpc.error).not.toBeNull();
  expect((await anon.storage.from(bucket).list()).data).toEqual([]);
  expect(
    (
      await anon.storage
        .from(bucket)
        .upload("arbitrary.png", png, { contentType: "image/png" })
    ).error,
  ).not.toBeNull();
});

test("manifest limits and exact formats are enforced through HTTP and database", async () => {
  const c = await condominium();
  const a = { key: randomUUID(), secret: randomBytes(32).toString("hex") };
  for (const files of [
    [],
    Array(6).fill(manifest(png)),
    [{ ...manifest(png), size: 8 * 1024 * 1024 + 1 }],
    [
      {
        name: "large.pdf",
        contentType: "application/pdf",
        size: 10 * 1024 * 1024 + 1,
      },
    ],
    [
      {
        name: "large.mp4",
        contentType: "video/mp4",
        size: 25 * 1024 * 1024 + 1,
      },
    ],
    [{ name: "photo.heic", contentType: "image/heic", size: 10 }],
    [{ ...manifest(png), name: "photo.jpg" }],
    [{ name: "video.mov", contentType: "video/mp4", size: 10 }],
    [{ name: "video.webm", contentType: "video/webm", size: 10 }],
    [{ ...manifest(png), size: 0 }],
    [{ ...manifest(png), name: "../file.png" }],
    Array(5).fill({
      name: "file.pdf",
      contentType: "application/pdf",
      size: 10 * 1024 * 1024,
    }),
  ]) {
    expect(
      (await prepareUploads(request(a, "POST", files), c.slug)).status,
    ).toBe(400);
    await expect(
      uploadOperation("prepare", a.key, c.slug, a.secret, files),
    ).rejects.toMatchObject({ code: "invalid_input" });
  }
  for (const [contentType, name, size] of [
    ["image/png", "image.png", 8 * 1024 * 1024],
    ["application/pdf", "file.pdf", 10 * 1024 * 1024],
    ["video/mp4", "video.mp4", 25 * 1024 * 1024],
  ] as const) {
    expect(
      (await prepare([{ contentType, name, size }])).state.files[0].size,
    ).toBe(size);
  }
  expect(
    (
      await prepare([
        { name: "video.mp4", contentType: "video/mp4", size: 25 * 1024 * 1024 },
        {
          name: "file.pdf",
          contentType: "application/pdf",
          size: 10 * 1024 * 1024,
        },
        { name: "photo.png", contentType: "image/png", size: 5 * 1024 * 1024 },
      ])
    ).state.files,
  ).toHaveLength(3);
});

test("prepare recovery is stable and secret, manifest, condominium and file isolation hold", async () => {
  const a = await prepare();
  const b = await prepare(undefined, otherOwner);
  const again = await prepareUploads(
    request(a, "POST", [manifest(png)]),
    a.slug,
  );
  expect(await again.json()).toEqual(a.state);
  expect(
    (
      await prepareUploads(
        request(a, "POST", [{ ...manifest(png), name: "changed.png" }]),
        a.slug,
      )
    ).status,
  ).toBe(409);
  expect(
    (
      await manageUploads(
        request({ ...a, secret: randomBytes(32).toString("hex") }, "GET"),
        a.slug,
        a.key,
      )
    ).status,
  ).toBe(404);
  expect((await manageUploads(request(a, "GET"), b.slug, a.key)).status).toBe(
    404,
  );
  expect(
    (
      await processUploadFile(
        request(a),
        a.slug,
        a.key,
        b.state.files[0].id,
        "authorize",
      )
    ).status,
  ).toBe(404);
  expect((await finish(a)).status).toBe(409);
  const noSecret = new Request("http://localhost/test", {
    method: "POST",
    headers: { "Idempotency-Key": a.key },
    body: JSON.stringify(fields),
  });
  expect((await registerPublicRequest(noSecret, a.slug)).status).toBe(404);
});

test("valid PNG, JPEG, WebP, PDF and H264 MP4 reach the initial history event", async () => {
  const pdf = await PDFDocument.create();
  pdf.addPage([32, 32]);
  const values: Array<[Buffer, UploadManifestFile["contentType"], string]> = [
    [png, "image/png", "image.png"],
    [await sharp(png).jpeg().toBuffer(), "image/jpeg", "image.jpg"],
    [await sharp(png).webp().toBuffer(), "image/webp", "image.webp"],
    [Buffer.from(await pdf.save()), "application/pdf", "file.pdf"],
    [
      await readFile("tests/fixtures/attachment-h264.mp4"),
      "video/mp4",
      "video.mp4",
    ],
  ];
  const a = await prepare(
    values.map(([bytes, type, name]) => manifest(bytes, type, name)),
  );
  a.state.files.sort(
    (a, b) =>
      values.findIndex((v) => v[2] === a.name) -
      values.findIndex((v) => v[2] === b.name),
  );
  for (let i = 0; i < values.length; i++) {
    await put(a, values[i][0], i);
    expect((await validate(a, i)).status).toBe(200);
  }
  const response = await finish(a);
  expect(response.status).toBe(200);
  expect(Object.keys(await response.json())).toEqual(["number"]);
  expect(
    sql(
      `select count(*) from public.occurrence_attachments a join public.occurrence_events e on (e.occurrence_id,e.id)=(a.occurrence_id,a.event_id) join public.occurrences o on o.id=e.occurrence_id where o.condominium_id=${q(a.condominium)} and e.event_type='registered'`,
    ),
  ).toBe("5");
});

test("still-valid source token cannot change validated or linked evidence", async () => {
  const a = await prepare();
  const auth = await put(a);
  expect((await validate(a)).status).toBe(200);
  const evidence = auth.path.replace("incoming/", "evidence/");
  const before = await admin.storage.from(bucket).download(evidence);
  expect(
    sql(
      `begin;set local role authenticated;set local request.jwt.claims=${q(JSON.stringify({ sub: owner, role: "authenticated" }))};select count(*) from storage.objects where bucket_id=${q(bucket)} and name=${q(evidence)};rollback;`,
    ),
  ).toBe("0");
  const hash = createHash("sha256")
    .update(Buffer.from(await before.data!.arrayBuffer()))
    .digest("hex");
  for (const path of [auth.path, evidence]) {
    expect(
      (
        await anon.storage
          .from(bucket)
          .uploadToSignedUrl(path, auth.token, Buffer.from("changed"), {
            contentType: "image/png",
            upsert: true,
          })
      ).error,
    ).not.toBeNull();
  }
  expect(
    (await anon.storage.from(bucket).download(evidence)).error,
  ).not.toBeNull();
  expect((await finish(a)).status).toBe(200);
  const replay = await fetch(auth.signedUrl, {
    method: "PUT",
    headers: { "Content-Type": "image/png", "x-upsert": "true" },
    body: Buffer.from("changed"),
  });
  expect(replay.ok).toBe(false);
  const after = await admin.storage.from(bucket).download(evidence);
  expect(
    createHash("sha256")
      .update(Buffer.from(await after.data!.arrayBuffer()))
      .digest("hex"),
  ).toBe(hash);
});

test("TUS signed upload uses the reserved object without an account", async () => {
  const a = await prepare();
  const auth = await authorize(a);
  const encode = (v: string) => Buffer.from(v).toString("base64");
  const start = await fetch(
    `${config.API_URL}/storage/v1/upload/resumable/sign`,
    {
      method: "POST",
      headers: {
        "Tus-Resumable": "1.0.0",
        "Upload-Length": String(png.length),
        "Upload-Metadata": `bucketName ${encode(bucket)},objectName ${encode(auth.path)},contentType ${encode("image/png")}`,
        "x-signature": auth.token,
        apikey: config.ANON_KEY,
      },
    },
  );
  expect(start.status, await start.text()).toBe(201);
  const location = new URL(
    start.headers.get("location")!,
    config.API_URL,
  ).toString();
  expect(location.startsWith(config.API_URL)).toBe(true);
  const patch = await fetch(location, {
    method: "PATCH",
    headers: {
      "Tus-Resumable": "1.0.0",
      "Upload-Offset": "0",
      "Content-Type": "application/offset+octet-stream",
      "x-signature": auth.token,
      apikey: config.ANON_KEY,
    },
    body: new Uint8Array(png),
  });
  expect(patch.status).toBe(204);
  expect((await validate(a)).status).toBe(200);
  const wrongPath = await fetch(
    `${config.API_URL}/storage/v1/upload/resumable/sign`,
    {
      method: "POST",
      headers: {
        "Tus-Resumable": "1.0.0",
        "Upload-Length": String(png.length),
        "Upload-Metadata": `bucketName ${encode(bucket)},objectName ${encode(auth.path.replace("incoming/", "evidence/"))},contentType ${encode("image/png")}`,
        "x-signature": auth.token,
        apikey: config.ANON_KEY,
      },
    },
  );
  expect(wrongPath.ok).toBe(false);
});

test("mismatched bytes, truncated images, malformed PDF, codec mismatch and encrypted PDF are refused", async () => {
  const video = await readFile("tests/fixtures/attachment-h264.mp4");
  const badCodec = Buffer.from(video);
  const codecAt = badCodec.indexOf(Buffer.from("avc1"), 40);
  expect(codecAt).toBeGreaterThan(0);
  badCodec.write("hvc1", codecAt);
  const protectedPdf = await PDFDocument.create();
  protectedPdf.addPage([32, 32]);
  protectedPdf.context.trailerInfo.Encrypt = protectedPdf.context.register(
    protectedPdf.context.obj({ Filter: "Standard", V: 1, R: 2, Length: 40 }),
  );
  const encrypted = Buffer.from(await protectedPdf.save());
  await expect(PDFDocument.load(encrypted)).rejects.toThrow();
  const animated = await sharp(
    Buffer.concat([Buffer.alloc(16 * 16 * 3), Buffer.alloc(16 * 16 * 3, 255)]),
    { raw: { width: 16, height: 32, channels: 3, pageHeight: 16 } },
  )
    .webp({ loop: 0, delay: [100, 100] })
    .toBuffer();
  const values: Array<[Buffer, UploadManifestFile["contentType"], string]> = [
    [Buffer.from("not png"), "image/png", "image.png"],
    [png.subarray(0, 30), "image/png", "image.png"],
    [png, "image/jpeg", "image.jpg"],
    [Buffer.from("%PDF-1.7\ninvalid"), "application/pdf", "file.pdf"],
    [badCodec, "video/mp4", "video.mp4"],
    [encrypted, "application/pdf", "file.pdf"],
    [animated, "image/webp", "image.webp"],
  ];
  for (const [bytes, type, name] of values) {
    const a = await prepare([manifest(bytes, type, name)]);
    await put(a, bytes);
    expect((await validate(a)).status).toBe(422);
    expect((await finish(a)).status).toBe(409);
  }
});

test("size lies, pixel limit and bucket hard cap are enforced on actual objects", async () => {
  const a = await prepare([{ ...manifest(png), size: png.length - 1 }]);
  await put(a, png);
  expect((await validate(a)).status).toBe(422);
  const huge = await sharp({
    create: { width: 7100, height: 7100, channels: 3, background: "white" },
  })
    .png()
    .toBuffer();
  const b = await prepare([manifest(huge)]);
  await put(b, huge);
  expect((await validate(b)).status).toBe(422);
  const c = await prepare([
    { name: "large.mp4", contentType: "video/mp4", size: 25 * 1024 * 1024 },
  ]);
  const auth = await authorize(c);
  expect(
    (
      await anon.storage
        .from(bucket)
        .uploadToSignedUrl(
          auth.path,
          auth.token,
          Buffer.alloc(25 * 1024 * 1024 + 1),
          { contentType: "video/mp4" },
        )
    ).error,
  ).not.toBeNull();
});

test("partial failure does not discard valid files or register a partial occurrence", async () => {
  const a = await prepare([
    manifest(png),
    manifest(png, "image/png", "second.png"),
  ]);
  await put(a);
  expect((await validate(a)).status).toBe(200);
  expect((await validate(a, 1)).status).toBe(503);
  expect((await finish(a)).status).toBe(409);
  expect(
    sql(
      `select count(*) from public.occurrences where condominium_id=${q(a.condominium)}`,
    ),
  ).toBe("0");
  await put(a, png, 1);
  expect((await validate(a, 1)).status).toBe(200);
  expect((await finish(a)).status).toBe(200);
});

test("inspection leases reject concurrency and stale completion", async () => {
  const a = await prepare();
  await put(a);
  const f = a.state.files[0].id;
  const claimed = (await uploadOperation("claim", a.key, a.slug, a.secret, {
    fileId: f,
  })) as unknown as { lease_id: string };
  await expect(
    uploadOperation("claim", a.key, a.slug, a.secret, { fileId: f }),
  ).rejects.toMatchObject({ code: "conflict" });
  await expect(
    uploadOperation("validated", a.key, a.slug, a.secret, {
      fileId: f,
      leaseId: randomUUID(),
      sha256: "a".repeat(64),
      size: png.length,
      contentType: "image/png",
    }),
  ).rejects.toMatchObject({ code: "conflict" });
  await uploadOperation("retry", a.key, a.slug, a.secret, {
    fileId: f,
    leaseId: claimed.lease_id,
  });
  expect((await validate(a)).status).toBe(200);
});

test("attachment failure rolls back registration; concurrent and lost responses recover once", async () => {
  const a = await prepare();
  await put(a);
  expect((await validate(a)).status).toBe(200);
  const trigger = `upload_failure_${a.key.replaceAll("-", "")}`;
  sql(
    `create function private.${trigger}() returns trigger language plpgsql as $$ begin if new.storage_path like ${q(`evidence/${a.key}/%`)} then raise exception 'Synthetic attachment failure'; end if; return new; end; $$; create trigger ${trigger} before insert on public.occurrence_attachments for each row execute function private.${trigger}();`,
  );
  try {
    expect((await finish(a)).status).toBe(503);
    expect(
      sql(
        `select count(*) from public.occurrences where condominium_id=${q(a.condominium)}`,
      ),
    ).toBe("0");
  } finally {
    sql(
      `drop trigger ${trigger} on public.occurrence_attachments; drop function private.${trigger}();`,
    );
  }
  const replies = await Promise.all([finish(a), finish(a)]);
  expect(replies.map((r) => r.status)).toEqual([200, 200]);
  const receipts = await Promise.all(replies.map((r) => r.json()));
  expect(receipts[0]).toEqual(receipts[1]);
  expect(await (await finish(a)).json()).toEqual(receipts[0]);
  expect(
    (await finish(a, { ...fields, description: "Changed report" })).status,
  ).toBe(409);
  const status = await manageUploads(request(a, "GET"), a.slug, a.key);
  expect((await status.json()).number).toBe(receipts[0].number);
  expect(
    sql(
      `select count(*) from public.occurrence_events e join public.occurrences o on o.id=e.occurrence_id where o.condominium_id=${q(a.condominium)} and e.event_type='registered'`,
    ),
  ).toBe("1");
});

test("cancellation is repeatable and expiry prevents uploads/finalization", async () => {
  const a = await prepare();
  const auth = await put(a);
  expect(
    (await manageUploads(request(a, "DELETE"), a.slug, a.key)).status,
  ).toBe(200);
  expect(
    (await manageUploads(request(a, "DELETE"), a.slug, a.key)).status,
  ).toBe(200);
  expect((await validate(a)).status).toBe(409);
  expect(
    (
      await processUploadFile(
        request(a),
        a.slug,
        a.key,
        a.state.files[0].id,
        "authorize",
      )
    ).status,
  ).toBe(409);
  expect((await finish(a)).status).toBe(409);
  expect(
    (await admin.storage.from(bucket).download(auth.path)).error,
  ).toBeNull();
  const b = await prepare();
  sql(
    `update private.occurrence_upload_sessions set expires_at=clock_timestamp()-interval '1 second' where id=${q(b.key)}`,
  );
  expect(
    (
      await processUploadFile(
        request(b),
        b.slug,
        b.key,
        b.state.files[0].id,
        "authorize",
      )
    ).status,
  ).toBe(409);
  expect((await finish(b)).status).toBe(409);
});

test("cleanup is authenticated, repeatable and concurrent while preserving linked evidence", async () => {
  expect(
    (await cleanupUploads(new Request("http://localhost/cleanup"))).status,
  ).toBe(401);
  const linked = await prepare();
  const linkAuth = await put(linked);
  expect((await validate(linked)).status).toBe(200);
  expect((await finish(linked)).status).toBe(200);
  const abandoned = await prepare();
  const abandonedAuth = await put(abandoned);
  expect((await validate(abandoned)).status).toBe(200);
  const recent = await prepare();
  const recentAuth = await put(recent);
  age(linked);
  age(abandoned);
  const responses = await Promise.all([cron(), cron()]);
  expect(responses.map((r) => r.status)).toEqual([200, 200]);
  expect((await cron()).status).toBe(200);
  expect(
    (await admin.storage.from(bucket).download(linkAuth.path)).error,
  ).not.toBeNull();
  expect(
    (
      await admin.storage
        .from(bucket)
        .download(linkAuth.path.replace("incoming/", "evidence/"))
    ).error,
  ).toBeNull();
  expect(
    (await admin.storage.from(bucket).download(abandonedAuth.path)).error,
  ).not.toBeNull();
  expect(
    (
      await admin.storage
        .from(bucket)
        .download(abandonedAuth.path.replace("incoming/", "evidence/"))
    ).error,
  ).not.toBeNull();
  expect(
    (await admin.storage.from(bucket).download(recentAuth.path)).error,
  ).toBeNull();
  expect((await finish(abandoned)).status).toBe(409);
  expect((await finish(linked)).status).toBe(200);
});

test("cleanup failure retains work for retry and cannot race a committed association", async () => {
  const a = await prepare();
  const auth = await put(a);
  expect((await validate(a)).status).toBe(200);
  age(a);
  const original = globalThis.fetch;
  const spy = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation((input, init) => {
      if (
        init?.method === "DELETE" &&
        String(input).includes("/storage/v1/object/")
      )
        return Promise.resolve(
          Response.json(
            { message: "Synthetic local failure" },
            { status: 503 },
          ),
        );
      return original(input, init);
    });
  try {
    expect((await cron()).status).toBe(503);
  } finally {
    spy.mockRestore();
  }
  expect(
    sql(
      `select cleaned_at is null and state='cleaning' from private.occurrence_upload_sessions where id=${q(a.key)}`,
    ),
  ).toBe("t");
  expect(
    (await admin.storage.from(bucket).download(auth.path)).error,
  ).toBeNull();
  expect((await cron()).status).toBe(200);
  expect(
    (await admin.storage.from(bucket).download(auth.path)).error,
  ).not.toBeNull();
  const race = await prepare();
  const raceAuth = await put(race);
  expect((await validate(race)).status).toBe(200);
  sql(
    `update private.occurrence_upload_sessions set last_activity_at=clock_timestamp()-interval '73 hours' where id=${q(race.key)}`,
  );
  const [registration, cleanup] = await Promise.all([finish(race), cron()]);
  expect(cleanup.status).toBe(200);
  expect([200, 409]).toContain(registration.status);
  const evidence = await admin.storage
    .from(bucket)
    .download(raceAuth.path.replace("incoming/", "evidence/"));
  if (registration.status === 200) {
    expect(evidence.error).toBeNull();
    expect(
      sql(
        `select count(*) from public.occurrence_attachments where storage_path=${q(raceAuth.path.replace("incoming/", "evidence/"))}`,
      ),
    ).toBe("1");
  } else {
    expect(
      sql(
        `select count(*) from public.occurrences where condominium_id=${q(race.condominium)}`,
      ),
    ).toBe("0");
  }
});

test("reservation and authorization budgets are persistent", async () => {
  const c = await condominium();
  for (let i = 0; i < 20; i++) {
    const a = { key: randomUUID(), secret: randomBytes(32).toString("hex") };
    expect(
      (await prepareUploads(request(a, "POST", [manifest(png)]), c.slug))
        .status,
    ).toBe(200);
  }
  const blocked = {
    key: randomUUID(),
    secret: randomBytes(32).toString("hex"),
  };
  expect(
    (await prepareUploads(request(blocked, "POST", [manifest(png)]), c.slug))
      .status,
  ).toBe(429);
  const a = await prepare();
  for (let i = 0; i < 10; i++) await authorize(a);
  expect(
    (
      await processUploadFile(
        request(a),
        a.slug,
        a.key,
        a.state.files[0].id,
        "authorize",
      )
    ).status,
  ).toBe(409);
});
