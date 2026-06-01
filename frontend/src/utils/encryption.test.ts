import { describe, it, expect } from "vitest";
import {
  generateAESKey,
  encryptFile,
  decryptFile,
  packageEncrypted,
  unpackageEncrypted,
  hashContent,
  toHex,
  fromHex,
  fromBase64,
  toBase64,
} from "./encryption.js";

describe("frontend encryption", () => {
  it("should encrypt and decrypt content correctly", async () => {
    const key = await generateAESKey();
    const original = new TextEncoder().encode("medical allergy record");

    const { encrypted, iv } = await encryptFile(original.buffer, key);
    const decrypted = await decryptFile(encrypted, iv, key);

    expect(new TextDecoder().decode(decrypted)).toBe("medical allergy record");
  });

  it("should fail decryption with wrong key", async () => {
    const key1 = await generateAESKey();
    const key2 = await generateAESKey();
    const original = new TextEncoder().encode("private record");

    const { encrypted, iv } = await encryptFile(original.buffer, key1);

    await expect(decryptFile(encrypted, iv, key2)).rejects.toThrow();
  });

  it("should fail if ciphertext is tampered", async () => {
    const key = await generateAESKey();
    const original = new TextEncoder().encode("private record");

    const { encrypted, iv } = await encryptFile(original.buffer, key);
    encrypted[0] = encrypted[0] ^ 1;

    await expect(decryptFile(encrypted, iv, key)).rejects.toThrow();
  });

  it("should fail if IV is tampered", async () => {
    const key = await generateAESKey();
    const original = new TextEncoder().encode("private record");

    const { encrypted, iv } = await encryptFile(original.buffer, key);
    iv[0] = iv[0] ^ 1;

    await expect(decryptFile(encrypted, iv, key)).rejects.toThrow();
  });

  it("should package and unpackage encrypted content", async () => {
    const key = await generateAESKey();
    const original = new TextEncoder().encode("record");

    const { encrypted, iv } = await encryptFile(original.buffer, key);
    const packaged = packageEncrypted(encrypted, iv);
    const unpacked = unpackageEncrypted(packaged);

    expect(unpacked.iv.length).toBe(12);
    expect(unpacked.encrypted.length).toBe(encrypted.length);

    const decrypted = await decryptFile(unpacked.encrypted, unpacked.iv, key);
    expect(new TextDecoder().decode(decrypted)).toBe("record");
  });

  it("should convert hex round-trip correctly", () => {
    const original = new Uint8Array([1, 2, 3, 255]);
    const hex = toHex(original);
    const decoded = fromHex(hex);

    expect(Array.from(decoded)).toEqual([1, 2, 3, 255]);
  });

  it("should hash content deterministically", async () => {
    const content = new TextEncoder().encode("same content");

    const h1 = await hashContent(content);
    const h2 = await hashContent(content);

    expect(h1).toBe(h2);
    expect(h1.startsWith("0x")).toBe(true);
  }, 20000);
});

describe("encryption utility additions", () => {
  it("fromBase64 should decode base64 to Uint8Array", () => {
    const original = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
    const b64 = toBase64(original);
    const decoded = fromBase64(b64);
    expect(Array.from(decoded)).toEqual(Array.from(original));
  });

  it("fromBase64/toBase64 round-trip with binary data", () => {
    const data = new Uint8Array(256);
    for (let i = 0; i < 256; i++) data[i] = i;
    const roundTripped = fromBase64(toBase64(data));
    expect(Array.from(roundTripped)).toEqual(Array.from(data));
  });

  it("toHex/fromHex round-trip", () => {
    const data = new Uint8Array([0, 1, 127, 128, 255]);
    const hex = toHex(data);
    expect(hex).toBe("0x00017f80ff");
    const back = fromHex(hex);
    expect(Array.from(back)).toEqual(Array.from(data));
  });

  it("hashContent produces consistent keccak256 hash", async () => {
    const data = new Uint8Array([1, 2, 3, 4]);
    const hash1 = await hashContent(data);
    const hash2 = await hashContent(data);
    expect(hash1).toBe(hash2);
    expect(hash1.startsWith("0x")).toBe(true);
    expect(hash1.length).toBe(66); // 0x + 64 hex chars
  });

  it("hashContent produces different hashes for different data", async () => {
    const a = new Uint8Array([1, 2, 3]);
    const b = new Uint8Array([1, 2, 4]);
    const hashA = await hashContent(a);
    const hashB = await hashContent(b);
    expect(hashA).not.toBe(hashB);
  });
});
