import "server-only";
import { execFile, spawn } from "node:child_process";
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import type { UploadManifestFile } from "@/lib/occurrences/uploads";

export class InvalidAttachment extends Error {}
const run = promisify(execFile);

export function parseResidentMemory(status: string) {
  if (/^State:\s+[ZX](?:\s|$)/m.test(status)) return 0;
  const match = /^VmRSS:\s+(\d+) kB\s*$/m.exec(status);
  const rss = match ? Number(match[1]) : NaN;
  if (!Number.isSafeInteger(rss) || rss <= 0)
    throw new Error("inspection_monitor_unavailable");
  return rss;
}

async function childRss(pid: number) {
  const runtimePlatform = process.getBuiltinModule("node:os").platform();
  if (runtimePlatform === "linux") {
    try {
      const status = await readFile(`/proc/${pid}/status`, "utf8");
      return parseResidentMemory(status);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        try {
          process.kill(pid, 0);
        } catch (probe) {
          if ((probe as NodeJS.ErrnoException).code === "ESRCH") return 0;
        }
      }
      throw error;
    }
  }
  if (runtimePlatform === "darwin") {
    try {
      const { stdout } = await run(
        "/bin/ps",
        ["-o", "rss=", "-p", String(pid)],
        {
          timeout: 1000,
          maxBuffer: 1024,
        },
      );
      return parseResidentMemory(`VmRSS: ${stdout.trim()} kB`);
    } catch (error) {
      try {
        process.kill(pid, 0);
      } catch (probe) {
        if ((probe as NodeJS.ErrnoException).code === "ESRCH") return 0;
      }
      throw error;
    }
  }
  throw new Error("inspection_monitor_unavailable");
}

export async function readBoundedFile(
  response: Response,
  expectedSize: number,
) {
  if (
    !Number.isSafeInteger(expectedSize) ||
    expectedSize < 1 ||
    expectedSize > 25 * 1024 * 1024
  )
    throw new InvalidAttachment("size_limit");
  if (!response.ok || !response.body) throw new Error("storage_unavailable");
  const length = response.headers.get("content-length");
  if (length !== null && Number(length) !== expectedSize) {
    await response.body.cancel();
    throw new InvalidAttachment("size_mismatch");
  }
  const reader = response.body.getReader();
  const bytes = Buffer.allocUnsafe(expectedSize);
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      if (size + chunk.value.length > expectedSize)
        throw new InvalidAttachment("size_mismatch");
      bytes.set(chunk.value, size);
      size += chunk.value.length;
    }
    if (size !== expectedSize) throw new InvalidAttachment("size_mismatch");
    return bytes;
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

export function inspectAttachment(
  bytes: Buffer,
  file: Pick<UploadManifestFile, "contentType" | "size">,
  signal?: AbortSignal,
) {
  if (signal?.aborted) return Promise.reject(new Error("inspection_deadline"));
  return new Promise<{ sha256: string; size: number; contentType: string }>(
    (resolve, reject) => {
      const child = spawn(
        process.execPath,
        [
          "--max-old-space-size=96",
          "--stack-size=512",
          join(process.cwd(), "scripts/inspect-attachment.mjs"),
          JSON.stringify(file),
        ],
        {
          stdio: ["pipe", "pipe", "ignore"],
          env: {
            NODE_ENV: process.env.NODE_ENV,
            PATH: process.env.PATH,
            VIPS_CONCURRENCY: "1",
            MALLOC_ARENA_MAX: "2",
          },
        },
      );
      let output = "";
      const abort = () => {
        child.kill("SIGKILL");
      };
      signal?.addEventListener("abort", abort, { once: true });
      const timer = setTimeout(() => child.kill("SIGKILL"), 15_000);
      let checkingMemory = false;
      let monitorUnavailable = false;
      const memoryTimer = setInterval(() => {
        if (!child.pid || checkingMemory) return;
        checkingMemory = true;
        void childRss(child.pid)
          .then((rss) => {
            if (rss > 384 * 1024) child.kill("SIGKILL");
          })
          .catch(() => {
            if (child.exitCode === null && child.signalCode === null) {
              monitorUnavailable = true;
              child.kill("SIGKILL");
            }
          })
          .finally(() => {
            checkingMemory = false;
          });
      }, 50);
      child.stdout.on("data", (chunk: Buffer) => {
        output += chunk.toString();
        if (output.length > 1024) child.kill("SIGKILL");
      });
      child.stdin.on("error", () => undefined);
      child.on("error", () => {
        clearTimeout(timer);
        clearInterval(memoryTimer);
        signal?.removeEventListener("abort", abort);
        reject(new Error("inspection_unavailable"));
      });
      child.on("close", (code, exitSignal) => {
        clearTimeout(timer);
        clearInterval(memoryTimer);
        signal?.removeEventListener("abort", abort);
        if (signal?.aborted) return reject(new Error("inspection_deadline"));
        if (monitorUnavailable && (exitSignal || code !== 0))
          return reject(new Error("inspection_monitor_unavailable"));
        if (exitSignal || code !== 0)
          return reject(new InvalidAttachment("invalid_content"));
        try {
          const result = JSON.parse(output);
          if (
            !/^[0-9a-f]{64}$/.test(result.sha256) ||
            result.size !== file.size ||
            result.contentType !== file.contentType
          )
            throw new Error();
          resolve(result);
        } catch {
          reject(new InvalidAttachment("invalid_content"));
        }
      });
      child.stdin.end(bytes);
    },
  );
}
