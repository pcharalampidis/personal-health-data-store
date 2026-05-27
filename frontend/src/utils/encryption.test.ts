import { describe, it, expect } from "vitest";
import { fromBase64, toBase64, toHex, fromHex, hashContent } from "./encryption";

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
