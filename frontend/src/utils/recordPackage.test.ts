import { describe, it, expect } from "vitest";
import { createRecordPackage, parseRecordPackage } from "./recordPackage";

describe("recordPackage", () => {
  it("should create and parse a PHDS2 package round-trip", async () => {
    const content = new TextEncoder().encode('{"test": true}');
    const file = new File([content], "test.json", { type: "application/json" });

    const pkg = await createRecordPackage(file);
    const parsed = parseRecordPackage(pkg.buffer, "fallback.bin");

    expect(parsed.isLegacy).toBe(false);
    expect(parsed.filename).toBe("test.json");
    expect(parsed.mimeType).toBe("application/json");
    expect(parsed.metadata?.version).toBe(2);
    expect(parsed.metadata?.size).toBe(content.length);
    expect(Array.from(parsed.fileBytes)).toEqual(Array.from(content));
  });

  it("should handle legacy raw bytes with PDF magic", () => {
    const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e]);
    const parsed = parseRecordPackage(pdfBytes.buffer, "record-1");

    expect(parsed.isLegacy).toBe(true);
    expect(parsed.mimeType).toBe("application/pdf");
    expect(parsed.filename).toBe("record-1");
    expect(parsed.metadata).toBeNull();
  });

  it("should handle legacy raw bytes with PNG magic", () => {
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
    const parsed = parseRecordPackage(pngBytes.buffer, "record-2");

    expect(parsed.isLegacy).toBe(true);
    expect(parsed.mimeType).toBe("image/png");
  });

  it("should handle legacy raw bytes with JPEG magic", () => {
    const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00]);
    const parsed = parseRecordPackage(jpegBytes.buffer, "record-3");

    expect(parsed.isLegacy).toBe(true);
    expect(parsed.mimeType).toBe("image/jpeg");
  });

  it("should handle legacy JSON-looking bytes", () => {
    const jsonBytes = new TextEncoder().encode('{"hello":"world"}');
    const parsed = parseRecordPackage(jsonBytes.buffer, "record-4");

    expect(parsed.isLegacy).toBe(true);
    expect(parsed.mimeType).toBe("application/json");
  });

  it("should fall back to octet-stream for unknown bytes", () => {
    const unknownBytes = new Uint8Array([0x00, 0x01, 0x02, 0x03]);
    const parsed = parseRecordPackage(unknownBytes.buffer, "record-5");

    expect(parsed.isLegacy).toBe(true);
    expect(parsed.mimeType).toBe("application/octet-stream");
    expect(parsed.filename).toBe("record-5");
  });

  it("should preserve file content exactly through round-trip", async () => {
    const binary = new Uint8Array(256);
    for (let i = 0; i < 256; i++) binary[i] = i;
    const file = new File([binary], "binary.dat", { type: "application/octet-stream" });

    const pkg = await createRecordPackage(file);
    const parsed = parseRecordPackage(pkg.buffer, "fallback");

    expect(parsed.fileBytes.length).toBe(256);
    expect(Array.from(parsed.fileBytes)).toEqual(Array.from(binary));
  });
});
