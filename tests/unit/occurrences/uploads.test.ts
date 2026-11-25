import { expect, test, vi } from "vitest";
import { validateUploadManifest } from "@/lib/occurrences/uploads";
import {
  inspectAttachment,
  readBoundedFile,
} from "@/server/occurrences/upload-inspection";

vi.mock("server-only", () => ({}));

test("manifest rejects unknown fields and MIME wildcards instead of coercing sizes", () => {
  const file = { name: "photo.jpg", contentType: "image/jpeg", size: 100 };
  expect(validateUploadManifest([file])).toEqual([file]);
  for (const item of [
    { ...file, size: "100" },
    { ...file, contentType: "image/*" },
    { ...file, name: "photo.jpg\n" },
    { ...file, path: "arbitrary" },
    { ...file, contentType: "__proto__" },
  ])
    expect(() => validateUploadManifest([item])).toThrow();
});

test("bounded download cancels oversized streams even without Content-Length", async () => {
  const cancel = vi.fn();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(5));
      controller.enqueue(new Uint8Array(5));
    },
    cancel,
  });
  await expect(readBoundedFile(new Response(stream), 8)).rejects.toThrow(
    "size_mismatch",
  );
  expect(cancel).toHaveBeenCalledOnce();
});

test("bounded download rejects short streams and declared overflows before parsing", async () => {
  await expect(
    readBoundedFile(new Response(new Uint8Array(3)), 4),
  ).rejects.toThrow("size_mismatch");
  await expect(
    readBoundedFile(
      new Response(new Uint8Array(3), { headers: { "Content-Length": "3" } }),
      2,
    ),
  ).rejects.toThrow("size_mismatch");
  await expect(
    readBoundedFile(new Response(), 26 * 1024 * 1024),
  ).rejects.toThrow("size_limit");
  const bytes = await readBoundedFile(
    new Response(new Uint8Array([1, 2, 3])),
    3,
  );
  expect(Array.from(bytes)).toEqual([1, 2, 3]);
});

test("expired inspection deadlines prevent parser execution", async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(
    inspectAttachment(
      Buffer.from("data"),
      { size: 4, contentType: "image/png" },
      controller.signal,
    ),
  ).rejects.toThrow("inspection_deadline");
});
