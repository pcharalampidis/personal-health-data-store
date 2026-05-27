/**
 * Record file packaging utilities.
 * 
 * PHDS2 format embeds file metadata (name, MIME, size) inside the encrypted
 * plaintext so the viewer can reconstruct the original file after decryption.
 * 
 * Format: [5 bytes "PHDS2"] [4 bytes metadataLength] [JSON metadata] [file bytes]
 * 
 * Legacy files (pre-PHDS2) are raw encrypted bytes with no metadata header.
 */

const MAGIC = new Uint8Array([0x50, 0x48, 0x44, 0x53, 0x32]); // "PHDS2"

export interface RecordFileMetadata {
  version: 2;
  originalName: string;
  mimeType: string;
  size: number;
  packagedAt: string;
}

export interface ParsedRecordPackage {
  metadata: RecordFileMetadata | null;
  fileBytes: Uint8Array;
  mimeType: string;
  filename: string;
  isLegacy: boolean;
}

/** Package a file with its metadata before encryption. */
export async function createRecordPackage(file: File): Promise<Uint8Array> {
  const meta: RecordFileMetadata = {
    version: 2,
    originalName: file.name,
    mimeType: file.type || "application/octet-stream",
    size: file.size,
    packagedAt: new Date().toISOString(),
  };

  const metaBytes = new TextEncoder().encode(JSON.stringify(meta));
  const fileBytes = new Uint8Array(await file.arrayBuffer());

  const result = new Uint8Array(MAGIC.length + 4 + metaBytes.length + fileBytes.length);
  let offset = 0;

  result.set(MAGIC, offset); offset += MAGIC.length;

  // Write metadata length as uint32 big-endian
  const view = new DataView(result.buffer, result.byteOffset + offset, 4);
  view.setUint32(0, metaBytes.length, false);
  offset += 4;

  result.set(metaBytes, offset); offset += metaBytes.length;
  result.set(fileBytes, offset);

  return result;
}

/** Parse decrypted bytes — handles both PHDS2 and legacy raw files. */
export function parseRecordPackage(decrypted: ArrayBufferLike, fallbackName: string): ParsedRecordPackage {
  const data = new Uint8Array(decrypted);

  if (data.length >= MAGIC.length && hasMagic(data)) {
    try {
      const view = new DataView(data.buffer, data.byteOffset + MAGIC.length, 4);
      const metaLen = view.getUint32(0, false);
      const metaStart = MAGIC.length + 4;
      const metaEnd = metaStart + metaLen;

      if (metaEnd > data.length) throw new Error("Invalid package");

      const metaJson = new TextDecoder().decode(data.slice(metaStart, metaEnd));
      const metadata: RecordFileMetadata = JSON.parse(metaJson);
      const fileBytes = data.slice(metaEnd);

      return {
        metadata,
        fileBytes,
        mimeType: metadata.mimeType,
        filename: metadata.originalName,
        isLegacy: false,
      };
    } catch {
      // Fall through to legacy handling
    }
  }

  // Legacy: raw file bytes, sniff MIME type
  return {
    metadata: null,
    fileBytes: data,
    mimeType: sniffMimeType(data),
    filename: fallbackName,
    isLegacy: true,
  };
}

function hasMagic(data: Uint8Array): boolean {
  for (let i = 0; i < MAGIC.length; i++) {
    if (data[i] !== MAGIC[i]) return false;
  }
  return true;
}

function sniffMimeType(data: Uint8Array): string {
  if (data.length >= 4) {
    // PDF
    if (data[0] === 0x25 && data[1] === 0x50 && data[2] === 0x44 && data[3] === 0x46) {
      return "application/pdf";
    }
    // PNG
    if (data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) {
      return "image/png";
    }
    // JPEG
    if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
      return "image/jpeg";
    }
  }
  // JSON heuristic
  if (data.length > 0) {
    const first = data[0];
    if (first === 0x7b || first === 0x5b) { // { or [
      try {
        new TextDecoder().decode(data); // valid UTF-8?
        return "application/json";
      } catch { /* not JSON */ }
    }
  }
  return "application/octet-stream";
}
