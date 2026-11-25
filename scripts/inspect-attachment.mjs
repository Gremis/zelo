import { createHash } from "node:crypto";
import { fileTypeFromBuffer } from "file-type";
import sharp from "sharp";
import { createFile } from "mp4box";
import { PDFDocument } from "pdf-lib";

sharp.cache(false);
sharp.concurrency(1);
const expected = JSON.parse(process.argv[2]);
const chunks = [];
let size = 0;

try {
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > expected.size || size > 25 * 1024 * 1024) throw new Error();
    chunks.push(chunk);
  }
  if (size !== expected.size || !size) throw new Error();
  const bytes = Buffer.concat(chunks, size);
  const detected = await fileTypeFromBuffer(bytes);
  if (detected?.mime !== expected.contentType) throw new Error();
  if (expected.contentType.startsWith("image/")) {
    const image = sharp(bytes, {
      limitInputPixels: 50_000_000,
      failOn: "warning",
      sequentialRead: true,
    });
    const metadata = await image.metadata();
    if (
      !metadata.width ||
      !metadata.height ||
      metadata.width * metadata.height > 50_000_000 ||
      (metadata.pages ?? 1) !== 1
    )
      throw new Error();
    if (metadata.format === "png") {
      for (let offset = 8; offset + 12 <= size;) {
        const length = bytes.readUInt32BE(offset);
        if (
          offset + 12 + length > size ||
          bytes.toString("ascii", offset + 4, offset + 8) === "acTL"
        )
          throw new Error();
        offset += length + 12;
      }
    }
    if (metadata.format === "webp") {
      for (let offset = 12; offset + 8 <= size;) {
        const length = bytes.readUInt32LE(offset + 4);
        if (
          offset + 8 + length > size ||
          bytes.toString("ascii", offset, offset + 4) === "ANIM"
        )
          throw new Error();
        offset += 8 + length + (length % 2);
      }
    }
    await image.stats();
  } else if (expected.contentType === "application/pdf") {
    const pdf = await PDFDocument.load(bytes, {
      ignoreEncryption: false,
      throwOnInvalidObject: true,
      updateMetadata: false,
    });
    if (pdf.isEncrypted || !pdf.getPageCount()) throw new Error();
  } else if (expected.contentType === "video/mp4") {
    const file = createFile();
    let info;
    let invalid = false;
    file.onError = () => {
      invalid = true;
    };
    file.onReady = (value) => {
      info = value;
    };
    const buffer = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    );
    buffer.fileStart = 0;
    file.appendBuffer(buffer);
    file.flush();
    if (
      invalid ||
      !info ||
      !info.duration ||
      !info.timescale ||
      info.videoTracks.length !== 1 ||
      info.audioTracks.length > 1 ||
      info.tracks.length !== info.videoTracks.length + info.audioTracks.length
    )
      throw new Error();
    if (
      !/^avc[13]\./.test(info.videoTracks[0].codec) ||
      info.audioTracks.some((track) => !/^mp4a\.40\.2$/.test(track.codec))
    )
      throw new Error();
    if (info.tracks.some((track) => !track.nb_samples || track.size <= 0))
      throw new Error();
    for (const track of info.tracks) {
      const samples = file.getTrackSamplesInfo(track.id);
      if (
        !samples?.length ||
        samples.some(
          (sample) =>
            !sample.size ||
            sample.offset < 0 ||
            sample.offset + sample.size > size,
        )
      )
        throw new Error();
    }
  } else throw new Error();
  process.stdout.write(
    JSON.stringify({
      sha256: createHash("sha256").update(bytes).digest("hex"),
      size,
      contentType: detected.mime,
    }),
  );
} catch {
  process.exitCode = 2;
}
