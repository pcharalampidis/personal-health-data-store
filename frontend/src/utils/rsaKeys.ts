/**
 * RSA-OAEP key wrapping utilities for health record encryption.
 * Uses RSA-OAEP with SHA-256, 2048-bit keys via Web Crypto API.
 */

import { toHex, fromHex } from "./encryption.js";

const RSA_ALGORITHM = {
  name: "RSA-OAEP",
  modulusLength: 2048,
  publicExponent: new Uint8Array([1, 0, 1]),
  hash: "SHA-256",
};

const STORAGE_PREFIX = "phds_private_key_";

export async function generateRSAKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(RSA_ALGORITHM, true, ["wrapKey", "unwrapKey"]);
}

export async function exportPublicKeyJWK(key: CryptoKey): Promise<string> {
  const jwk = await crypto.subtle.exportKey("jwk", key);
  return JSON.stringify(jwk);
}

export async function exportPrivateKeyJWK(key: CryptoKey): Promise<string> {
  const jwk = await crypto.subtle.exportKey("jwk", key);
  return JSON.stringify(jwk);
}

export async function importPublicKeyJWK(jwkJson: string): Promise<CryptoKey> {
  const jwk = JSON.parse(jwkJson);
  return crypto.subtle.importKey("jwk", jwk, { name: "RSA-OAEP", hash: "SHA-256" }, true, ["wrapKey"]);
}

export async function importPrivateKeyJWK(jwkJson: string): Promise<CryptoKey> {
  const jwk = JSON.parse(jwkJson);
  return crypto.subtle.importKey("jwk", jwk, { name: "RSA-OAEP", hash: "SHA-256" }, true, ["unwrapKey"]);
}

export async function wrapAESKey(aesKey: CryptoKey, rsaPublicKey: CryptoKey): Promise<Uint8Array> {
  const wrapped = await crypto.subtle.wrapKey("raw", aesKey, rsaPublicKey, { name: "RSA-OAEP" });
  return new Uint8Array(wrapped);
}

export async function unwrapAESKey(wrappedKey: Uint8Array, rsaPrivateKey: CryptoKey): Promise<CryptoKey> {
  return crypto.subtle.unwrapKey(
    "raw",
    wrappedKey.buffer as ArrayBuffer,
    rsaPrivateKey,
    { name: "RSA-OAEP" },
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
}

/**
 * Ensure an RSA key pair exists for the given account.
 * Checks localStorage first; generates a new pair only if missing.
 * Returns the public key hex-encoded (ready for on-chain storage).
 */
export async function ensureRSAKeyPair(account: string): Promise<{ publicKeyHex: string }> {
  const storageKey = STORAGE_PREFIX + account.toLowerCase();
  const existing = localStorage.getItem(storageKey);

  if (existing) {
    // Derive public key from stored private key
    const jwk = JSON.parse(existing);
    // Extract public-only fields from private JWK
    const pubJwk = { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: jwk.alg, ext: jwk.ext, key_ops: ["wrapKey"] };
    const publicKeyHex = toHex(new TextEncoder().encode(JSON.stringify(pubJwk)));
    return { publicKeyHex };
  }

  const keyPair = await generateRSAKeyPair();
  const privJwk = await exportPrivateKeyJWK(keyPair.privateKey);
  const pubJwk = await exportPublicKeyJWK(keyPair.publicKey);

  localStorage.setItem(storageKey, privJwk);

  const publicKeyHex = toHex(new TextEncoder().encode(pubJwk));
  return { publicKeyHex };
}

/** Get the stored private key for an account, or null if not found. */
export function getStoredPrivateKeyJWK(account: string): string | null {
  return localStorage.getItem(STORAGE_PREFIX + account.toLowerCase());
}
