import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { expect, test } from "@playwright/test";

test.use({ trace: "off", video: "off", screenshot: "off" });
test.skip(
  process.env.ORI58_LOCAL_TESTS !== "enabled",
  "Local Supabase opt-in required.",
);

function quote(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}
function sql(statement: string) {
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
      { input: statement, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
    ).trim();
  } catch {
    throw new Error("Local attachment HTTP fixture failed.");
  }
}

test("production HTTP backend validates private bytes and preserves the text-only flow", async ({
  request,
}) => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url !== "http://127.0.0.1:54321" || !key)
    throw new Error("Loopback Supabase configuration required.");
  const admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const fixture = randomUUID();
  const attempt = randomUUID();
  const secret = randomBytes(32).toString("hex");
  const paths: string[] = [];
  sql(
    `begin;insert into auth.users(id,email) values(${quote(fixture)},${quote(`${fixture}@example.invalid`)});insert into public.condominiums(id,manager_id,name,address) values(${quote(fixture)},${quote(fixture)},'Synthetic upload HTTP fixture','Synthetic address');commit;`,
  );
  try {
    const slug = sql(
      `select slug from public.condominiums where id=${quote(fixture)}`,
    );
    const base = `/api/public/condominiums/${slug}`;
    const headers = { "Idempotency-Key": attempt, "Upload-Token": secret };
    const png = await sharp({
      create: { width: 8, height: 8, channels: 3, background: "#116644" },
    })
      .png()
      .toBuffer();
    const prepared = await request.post(`${base}/upload-attempts`, {
      headers,
      data: [
        { name: "synthetic.png", contentType: "image/png", size: png.length },
      ],
    });
    expect(prepared.status()).toBe(200);
    const file = (await prepared.json()).files[0];
    const endpoint = `${base}/upload-attempts/${attempt}/files/${file.id}`;
    const authorized = await request.post(`${endpoint}/authorize`, { headers });
    expect(authorized.status()).toBe(200);
    const authorization = await authorized.json();
    expect(authorization.tusEndpoint).toBe(
      `${url}/storage/v1/upload/resumable/sign`,
    );
    paths.push(
      authorization.path,
      authorization.path.replace("incoming/", "evidence/"),
    );
    const upload = await request.put(authorization.signedUrl, {
      headers: { "Content-Type": "image/png" },
      data: png,
    });
    expect(upload.ok()).toBe(true);
    const validated = await request.post(`${endpoint}/validate`, { headers });
    expect(validated.status()).toBe(200);
    const data = {
      reporterName: "Synthetic reporter",
      reporterPhone: "11900000000",
      reporterUnitOrRole: "Synthetic unit",
      location: "Synthetic hall",
      description: "Synthetic report",
    };
    const registered = await request.post(`${base}/occurrences`, {
      headers,
      data,
    });
    expect(registered.status()).toBe(200);
    const receipt = await registered.json();
    expect(Object.keys(receipt)).toEqual(["number"]);
    expect(
      await (
        await request.post(`${base}/occurrences`, { headers, data })
      ).json(),
    ).toEqual(receipt);
    const withoutFiles = await request.post(`${base}/occurrences`, {
      headers: { "Idempotency-Key": randomUUID() },
      data,
    });
    expect(withoutFiles.status()).toBe(200);
    expect(
      sql(
        `select count(*) from public.occurrence_attachments where occurrence_id in(select id from public.occurrences where condominium_id=${quote(fixture)})`,
      ),
    ).toBe("1");
    expect(
      (await request.get("/api/internal/attachments/cleanup")).status(),
    ).toBe(401);
  } finally {
    if (paths.length)
      await admin.storage.from("occurrence-evidence").remove(paths);
    sql(`begin;
      delete from public.occurrence_attachments where occurrence_id in(select id from public.occurrences where condominium_id=${quote(fixture)});
      delete from private.occurrence_upload_files where session_id=${quote(attempt)};
      delete from private.occurrence_upload_sessions where id=${quote(attempt)};
      delete from private.public_registration_attempts where condominium_id=${quote(fixture)};
      delete from public.occurrence_events where occurrence_id in(select id from public.occurrences where condominium_id=${quote(fixture)});
      delete from public.occurrences where condominium_id=${quote(fixture)};
      delete from public.condominiums where id=${quote(fixture)};
      delete from auth.users where id=${quote(fixture)};commit;`);
  }
});
