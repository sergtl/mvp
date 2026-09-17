import { MAX_CV_BYTES } from "./config";

export class UploadError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

// Bound the bytes actually read, including requests without Content-Length.
export async function readUpload(request: Request) {
  if (Number(request.headers.get("content-length")) > MAX_CV_BYTES) {
    throw new UploadError("CVs must be 10 MB or smaller.", 413);
  }

  const reader = request.body?.getReader();

  if (!reader) throw new UploadError("Choose a file to upload.");

  const chunks: Buffer[] = [];

  let size = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      size += value.byteLength;

      if (size > MAX_CV_BYTES) {
        await reader.cancel();
        throw new UploadError("CVs must be 10 MB or smaller.", 413);
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  if (!size) throw new UploadError("The file is empty.");
  return Buffer.concat(chunks, size);
}

// Check the ZIP directory for a Word package without decompressing its contents.
// This is a format check, not document parsing or malware scanning.
function isDocx(data: Buffer): boolean {
  if (data.length < 22 || data.readUInt32LE(0) !== 0x04034b50) return false;

  let end = data.length - 22;
  const lower = Math.max(0, end - 65535);

  while (end >= lower && data.readUInt32LE(end) !== 0x06054b50) end--;

  if (end < lower || end + 22 + data.readUInt16LE(end + 20) !== data.length)
    return false;

  if (data.readUInt16LE(end + 4) || data.readUInt16LE(end + 6)) return false;

  const count = data.readUInt16LE(end + 10);

  if (count !== data.readUInt16LE(end + 8)) return false;

  let offset = data.readUInt32LE(end + 16);

  if (offset + data.readUInt32LE(end + 12) !== end) return false;

  const names = new Set<string>();
  for (let i = 0; i < count; i++) {
    if (offset + 46 > end || data.readUInt32LE(offset) !== 0x02014b50)
      return false;

    if (data.readUInt16LE(offset + 8) & 1) return false; // Encrypted archive.

    const length = data.readUInt16LE(offset + 28);
    const next =
      offset +
      46 +
      length +
      data.readUInt16LE(offset + 30) +
      data.readUInt16LE(offset + 32);

    if (next > end) return false;

    const local = data.readUInt32LE(offset + 42);

    if (local + 30 > offset || data.readUInt32LE(local) !== 0x04034b50)
      return false;

    names.add(data.toString("utf8", offset + 46, offset + 46 + length));

    offset = next;
  }

  return (
    offset === end &&
    ["[Content_Types].xml", "_rels/.rels", "word/document.xml"].every((name) =>
      names.has(name),
    )
  );
}

export function validateUpload(filenameHeader: string | null, data: Buffer) {
  let filename: string;

  try {
    filename = decodeURIComponent(filenameHeader ?? "")
      .split(/[\\/]/)
      .pop()!
      .trim();
  } catch {
    throw new UploadError("Invalid filename.");
  }

  if (!filename || filename.length > 255 || /[\x00-\x1f\x7f]/.test(filename)) {
    throw new UploadError(
      "Use a filename between 1 and 255 characters without control characters.",
    );
  }

  const lower = filename.toLowerCase();

  if (lower.endsWith(".pdf") && data.subarray(0, 5).toString() === "%PDF-") {
    return { filename, contentType: "application/pdf" };
  }

  if (lower.endsWith(".docx") && isDocx(data)) {
    return {
      filename,
      contentType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    };
  }

  throw new UploadError("Upload a valid PDF or DOCX file.", 415);
}
