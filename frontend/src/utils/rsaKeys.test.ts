import { describe, it, expect } from "vitest";
import {
  generateRSAKeyPair,
  exportPublicKeyJWK,
  exportPrivateKeyJWK,
  importPublicKeyJWK,
  importPrivateKeyJWK,
  wrapAESKey,
  unwrapAESKey,
} from "./rsaKeys";
import { generateAESKey, exportKey } from "./encryption";

describe("RSA-OAEP key wrapping", () => {
  it("should wrap and unwrap an AES key round-trip", async () => {
    const rsaKeyPair = await generateRSAKeyPair();
    const aesKey = await generateAESKey();
    const originalRaw = await exportKey(aesKey);

    const wrapped = await wrapAESKey(aesKey, rsaKeyPair.publicKey);
    expect(wrapped.length).toBe(256); // 2048-bit RSA = 256 bytes output

    const unwrapped = await unwrapAESKey(wrapped, rsaKeyPair.privateKey);
    const unwrappedRaw = await exportKey(unwrapped);

    expect(Array.from(unwrappedRaw)).toEqual(Array.from(originalRaw));
  });

  it("should fail unwrap with wrong private key", async () => {
    const keyPair1 = await generateRSAKeyPair();
    const keyPair2 = await generateRSAKeyPair();
    const aesKey = await generateAESKey();

    const wrapped = await wrapAESKey(aesKey, keyPair1.publicKey);

    await expect(unwrapAESKey(wrapped, keyPair2.privateKey)).rejects.toThrow();
  });

  it("should export and import public key JWK round-trip", async () => {
    const keyPair = await generateRSAKeyPair();
    const aesKey = await generateAESKey();
    const originalRaw = await exportKey(aesKey);

    const pubJwk = await exportPublicKeyJWK(keyPair.publicKey);
    const importedPub = await importPublicKeyJWK(pubJwk);

    const wrapped = await wrapAESKey(aesKey, importedPub);
    const unwrapped = await unwrapAESKey(wrapped, keyPair.privateKey);
    const unwrappedRaw = await exportKey(unwrapped);

    expect(Array.from(unwrappedRaw)).toEqual(Array.from(originalRaw));
  });

  it("should export and import private key JWK round-trip", async () => {
    const keyPair = await generateRSAKeyPair();
    const aesKey = await generateAESKey();
    const originalRaw = await exportKey(aesKey);

    const privJwk = await exportPrivateKeyJWK(keyPair.privateKey);
    const importedPriv = await importPrivateKeyJWK(privJwk);

    const wrapped = await wrapAESKey(aesKey, keyPair.publicKey);
    const unwrapped = await unwrapAESKey(wrapped, importedPriv);
    const unwrappedRaw = await exportKey(unwrapped);

    expect(Array.from(unwrappedRaw)).toEqual(Array.from(originalRaw));
  });

  it("should produce different ciphertext for same key (RSA-OAEP is randomized)", async () => {
    const keyPair = await generateRSAKeyPair();
    const aesKey = await generateAESKey();

    const wrapped1 = await wrapAESKey(aesKey, keyPair.publicKey);
    const wrapped2 = await wrapAESKey(aesKey, keyPair.publicKey);

    // RSA-OAEP uses random padding, so wrapping the same key twice gives different output
    expect(Array.from(wrapped1)).not.toEqual(Array.from(wrapped2));

    // But both unwrap to the same key
    const originalRaw = await exportKey(aesKey);
    const u1 = await exportKey(await unwrapAESKey(wrapped1, keyPair.privateKey));
    const u2 = await exportKey(await unwrapAESKey(wrapped2, keyPair.privateKey));
    expect(Array.from(u1)).toEqual(Array.from(originalRaw));
    expect(Array.from(u2)).toEqual(Array.from(originalRaw));
  });
});
