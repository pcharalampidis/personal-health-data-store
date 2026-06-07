import { describe, it, expect } from "vitest";
import {
  generateRSAKeyPair,
  exportPublicKeyJWK,
  exportPrivateKeyJWK,
  importPublicKeyJWK,
  importPrivateKeyJWK,
  wrapAESKey,
  unwrapAESKey,
} from "./rsaKeys.js";
import { generateAESKey, exportKey } from "./encryption.js";

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

  it("should execute the complete patient-to-doctor key re-wrapping flow", async () => {
    // 1. Generate keys for both the patient and the doctor
    const patientKeys = await generateRSAKeyPair();
    const doctorKeys = await generateRSAKeyPair();

    // 2. Patient uploads a record: generates AES key and wraps it for self-access
    const originalAESKey = await generateAESKey();
    const originalRawAES = await exportKey(originalAESKey);
    const patientWrappedKey = await wrapAESKey(originalAESKey, patientKeys.publicKey);

    // 3. Key Re-Wrapping: Patient unwraps the AES key using their private key
    const unwrappedAESKey = await unwrapAESKey(patientWrappedKey, patientKeys.privateKey);

    // ...and immediately re-wraps it using the doctor's public key
    const doctorWrappedKey = await wrapAESKey(unwrappedAESKey, doctorKeys.publicKey);

    // 4. Verification: Doctor retrieves and unwraps the key using their private key
    const doctorUnwrappedAES = await unwrapAESKey(doctorWrappedKey, doctorKeys.privateKey);
    const doctorRawAES = await exportKey(doctorUnwrappedAES);

    // Assert that the doctor successfully recovered the identical key bytes
    expect(Array.from(doctorRawAES)).toEqual(Array.from(originalRawAES));
  });
});

