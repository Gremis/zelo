import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "@/lib/supabase/config";
import type { Database, Json } from "@/lib/supabase/database.types";
import {
  validateUploadManifest,
  type UploadState,
} from "@/lib/occurrences/uploads";
import { OccurrenceWriteError } from "./contracts";
import { publicFailure, publicReply } from "./public.http";
import {
  InvalidAttachment,
  inspectAttachment,
  readBoundedFile,
} from "./upload-inspection";

export type ManagerUploadScope = { occurrenceId: string; actorId: string };

const bucket = "occurrence-evidence";
const uuid = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const secretPattern = /^[0-9a-f]{64}$/;
let inspectionInFlight = false;

function storageClient(signal?: AbortSignal) {
  const { url } = getSupabaseConfig();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new OccurrenceWriteError("unavailable");
  return createClient<Database>(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          cache: "no-store",
          signal: signal
            ? AbortSignal.any([signal, AbortSignal.timeout(15_000)])
            : AbortSignal.timeout(15_000),
        }),
    },
  });
}

export async function uploadOperation(
  operation: string,
  sessionKey: string | null,
  slug?: string,
  secret?: string,
  payload: Json = {},
  signal?: AbortSignal,
  scope?: ManagerUploadScope,
) {
  const client = storageClient(signal);
  const { data, error } = scope
    ? await client.rpc("manager_occurrence_upload_operation", {
        operation,
        session_key: sessionKey!,
        target_occurrence: scope.occurrenceId,
        actor_profile: scope.actorId,
        upload_secret: secret!,
        payload,
      })
    : await client.rpc("occurrence_upload_operation", {
        operation,
        session_key: sessionKey!,
        condominium_slug: slug,
        upload_secret: secret,
        payload,
      });
  if (error) {
    if (error.code === "P0004") throw new UploadBudgetExceeded();
    throw new OccurrenceWriteError(
      error.code === "P0002"
        ? "not_found"
        : error.code === "P0003"
          ? "conflict"
          : error.code === "22023"
            ? "invalid_input"
            : "unavailable",
    );
  }
  return data;
}

class UploadBudgetExceeded extends Error {}

export async function uploadJson(request: Request) {
  const response = new Response(request.body);
  if (!response.body) throw new OccurrenceWriteError("invalid_input");
  const reader = response.body.getReader();
  let text = "";
  let size = 0;
  const decoder = new TextDecoder();
  const timer = setTimeout(() => {
    void reader.cancel();
  }, 5000);
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.length;
      if (size > 16_384) throw new Error();
      text += decoder.decode(chunk.value, { stream: true });
    }
    return JSON.parse(text + decoder.decode()) as unknown;
  } catch {
    throw new OccurrenceWriteError("invalid_input");
  } finally {
    clearTimeout(timer);
    await reader.cancel().catch(() => undefined);
  }
}

function credentials(request: Request, key: string) {
  const secret = request.headers.get("Upload-Token") ?? "";
  if (
    !uuid.test(key) ||
    !secretPattern.test(secret) ||
    new URL(request.url).search
  )
    throw new OccurrenceWriteError("invalid_input");
  return secret;
}

function failure(error: unknown) {
  if (error instanceof OccurrenceWriteError && error.code === "conflict")
    return publicReply(
      {
        code: "conflict",
        error:
          "O envio está fechado, em processamento ou em conflito. Consulte o estado antes de tentar novamente.",
      },
      409,
    );
  if (error instanceof UploadBudgetExceeded)
    return publicReply(
      {
        code: "rate_limited",
        error:
          "Limite temporário de envios atingido. Tente novamente mais tarde.",
      },
      429,
    );
  return publicFailure(error);
}

export async function prepareUploads(
  request: Request,
  slug: string,
  scope?: ManagerUploadScope,
) {
  const operate = scopedOperation(scope);
  try {
    const key = request.headers.get("Idempotency-Key") ?? "";
    const secret = credentials(request, key);
    let files;
    try {
      files = validateUploadManifest(await uploadJson(request));
    } catch {
      throw new OccurrenceWriteError("invalid_input");
    }
    const state = await operate("prepare", key, slug, secret, files);
    return publicReply(state, 200);
  } catch (error) {
    return failure(error);
  }
}

export async function manageUploads(
  request: Request,
  slug: string,
  key: string,
  scope?: ManagerUploadScope,
) {
  const operate = scopedOperation(scope);
  try {
    const secret = credentials(request, key);
    return publicReply(
      await operate(
        request.method === "DELETE" ? "cancel" : "status",
        key,
        slug,
        secret,
      ),
    );
  } catch (error) {
    return failure(error);
  }
}

type ReservedFile = {
  id: string;
  source_path: string;
  evidence_path: string;
  content_type:
    "image/jpeg" | "image/png" | "image/webp" | "application/pdf" | "video/mp4";
  size_bytes: number;
  state: string;
  lease_id: string;
};

export async function processUploadFile(
  request: Request,
  slug: string,
  key: string,
  fileId: string,
  action: string,
  scope?: ManagerUploadScope,
) {
  const operate = scopedOperation(scope);
  let ownsInspection = false;
  try {
    const secret = credentials(request, key);
    if (!uuid.test(fileId) || !["authorize", "validate"].includes(action))
      throw new OccurrenceWriteError("invalid_input");
    if (action === "validate") {
      if (inspectionInFlight) throw new OccurrenceWriteError("conflict");
      inspectionInFlight = true;
      ownsInspection = true;
    }
    const inspectionDeadline = AbortSignal.timeout(40_000);
    const file = (await operate(
      action === "authorize" ? "authorize" : "claim",
      key,
      slug,
      secret,
      { fileId },
      inspectionDeadline,
    )) as unknown as ReservedFile;
    const storage = storageClient(inspectionDeadline).storage.from(bucket);
    if (action === "authorize") {
      const { data, error } = await storage.createSignedUploadUrl(
        file.source_path,
        { upsert: false },
      );
      if (error || !data) throw new OccurrenceWriteError("unavailable");
      return publicReply({
        bucket,
        path: file.source_path,
        token: data.token,
        signedUrl: data.signedUrl,
        tusEndpoint: `${getSupabaseConfig().url}/storage/v1/upload/resumable/sign`,
        expiresIn: 7200,
        upsert: false,
      });
    }
    if (file.state === "valid") return publicReply({ fileId, state: "valid" });
    try {
      const existing = await storage.info(file.evidence_path);
      if (existing.error) {
        const { error } = await storage.copy(
          file.source_path,
          file.evidence_path,
        );
        if (error) throw new Error("copy_unavailable");
      }
      const { url } = getSupabaseConfig();
      const keyValue = process.env.SUPABASE_SERVICE_ROLE_KEY!;
      const response = await fetch(
        `${url}/storage/v1/object/authenticated/${bucket}/${file.evidence_path}`,
        {
          headers: { apikey: keyValue, Authorization: `Bearer ${keyValue}` },
          cache: "no-store",
          signal: AbortSignal.any([
            inspectionDeadline,
            AbortSignal.timeout(20_000),
          ]),
        },
      );
      const bytes = await readBoundedFile(response, file.size_bytes);
      const result = await inspectAttachment(
        bytes,
        {
          contentType: file.content_type,
          size: file.size_bytes,
        },
        inspectionDeadline,
      );
      await operate(
        "validated",
        key,
        slug,
        secret,
        {
          fileId,
          leaseId: file.lease_id,
          ...result,
        },
        inspectionDeadline,
      );
      return publicReply({ fileId, state: "valid" });
    } catch (error) {
      await operate(
        error instanceof InvalidAttachment ? "failed" : "retry",
        key,
        slug,
        secret,
        { fileId, leaseId: file.lease_id },
      );
      if (error instanceof InvalidAttachment)
        return publicReply(
          {
            fileId,
            state: "invalid",
            code: "invalid_content",
            error:
              "O conteúdo do arquivo não corresponde ao formato ou aos limites permitidos.",
          },
          422,
        );
      throw new OccurrenceWriteError("unavailable");
    }
  } catch (error) {
    return failure(error);
  } finally {
    if (ownsInspection) inspectionInFlight = false;
  }
}

export async function cleanupUploads(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("Authorization") !== `Bearer ${secret}`)
    return publicReply({ error: "Acesso negado." }, 401);
  try {
    const deadline = Date.now() + 20_000;
    const work = (await uploadOperation("cleanup", null)) as unknown as Array<{
      id: string;
      paths: string[];
    }>;
    let cleaned = 0;
    let failed = 0;
    const storage = storageClient().storage.from(bucket);
    for (const item of work) {
      if (Date.now() >= deadline) break;
      const { error } = await storage.remove(item.paths ?? []);
      if (error) {
        failed++;
        continue;
      }
      await uploadOperation("cleaned", item.id);
      cleaned++;
    }
    return publicReply(
      { cleaned, failed, pending: work.length - cleaned - failed },
      failed ? 503 : 200,
    );
  } catch {
    return publicReply({ error: "Não foi possível executar a limpeza." }, 503);
  }
}

export type { UploadState };

function scopedOperation(scope?: ManagerUploadScope) {
  return (
    operation: string,
    key: string | null,
    slug?: string,
    secret?: string,
    payload: Json = {},
    signal?: AbortSignal,
  ) => uploadOperation(operation, key, slug, secret, payload, signal, scope);
}

export async function signedEvidence(path: string, download = true) {
  const { data, error } = await storageClient()
    .storage.from(bucket)
    .createSignedUrl(path, 60, download ? { download: true } : undefined);
  if (error || !data) throw new Error("Evidence unavailable.");
  return data.signedUrl;
}
