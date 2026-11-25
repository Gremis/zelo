export const uploadLimits = {
  files: 5,
  totalBytes: 40 * 1024 * 1024,
  imageBytes: 8 * 1024 * 1024,
  pdfBytes: 10 * 1024 * 1024,
  videoBytes: 25 * 1024 * 1024,
  pixels: 50_000_000,
} as const;

export type UploadManifestFile = {
  name: string;
  contentType:
    "image/jpeg" | "image/png" | "image/webp" | "application/pdf" | "video/mp4";
  size: number;
};

export function validateUploadManifest(value: unknown): UploadManifestFile[] {
  if (
    !Array.isArray(value) ||
    !value.length ||
    value.length > uploadLimits.files
  )
    throw new Error("invalid_manifest");
  let total = 0;
  const files = value.map((item): UploadManifestFile => {
    if (
      !item ||
      typeof item !== "object" ||
      Array.isArray(item) ||
      Object.keys(item).sort().join() !== "contentType,name,size"
    )
      throw new Error("invalid_manifest");
    const formats: Record<string, { extension: RegExp; maximum: number }> = {
      "image/jpeg": {
        extension: /\.(jpg|jpeg)$/i,
        maximum: uploadLimits.imageBytes,
      },
      "image/png": { extension: /\.png$/i, maximum: uploadLimits.imageBytes },
      "image/webp": { extension: /\.webp$/i, maximum: uploadLimits.imageBytes },
      "application/pdf": {
        extension: /\.pdf$/i,
        maximum: uploadLimits.pdfBytes,
      },
      "video/mp4": { extension: /\.mp4$/i, maximum: uploadLimits.videoBytes },
    };
    const format = Object.hasOwn(formats, item.contentType)
      ? formats[item.contentType]
      : undefined;
    if (
      !format ||
      typeof item.name !== "string" ||
      !item.name.trim() ||
      item.name.length > 200 ||
      /[\x00-\x1f\x7f/\\]/.test(item.name) ||
      !format.extension.test(item.name) ||
      !Number.isSafeInteger(item.size) ||
      item.size <= 0 ||
      item.size > format.maximum
    )
      throw new Error("invalid_manifest");
    total += item.size;
    return { name: item.name, contentType: item.contentType, size: item.size };
  });
  if (total > uploadLimits.totalBytes) throw new Error("invalid_manifest");
  return files;
}

export type UploadState = {
  id: string;
  state: "open" | "cancelled" | "cleaning" | "linked";
  expiresAt: string;
  number: number | null;
  files: Array<
    UploadManifestFile & {
      id: string;
      state: "reserved" | "inspecting" | "valid" | "invalid";
      failure: string | null;
    }
  >;
};
