/**
 * Custodian RSA-OAEP key wrapping utilities (Node backend).
 * Uses Node.js webcrypto for RSA-OAEP operations.
 */

import { webcrypto } from "crypto";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";

const subtle = webcrypto.subtle;

const KEYS_PATH = resolve(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1")), "../../custodian/keys.json");

interface CustodianKeys {
  publicKey: JsonWebKey;
  privateKey: JsonWebKey;
}

let cachedKeys: CustodianKeys | null = null;

function loadKeys(): CustodianKeys {
  if (cachedKeys) return cachedKeys;

  if (!existsSync(KEYS_PATH)) {
    throw new Error(`Custodian keys not found at ${KEYS_PATH}. Run: npx ts-node backend/src/utils/generateCustodianKeys.ts`);
  }

  cachedKeys = JSON.parse(readFileSync(KEYS_PATH, "utf-8"));
  return cachedKeys!;
}

export async function getCustodianPublicKey(): Promise<webcrypto.CryptoKey> {
  const keys = loadKeys();
  return subtle.importKey("jwk", keys.publicKey, { name: "RSA-OAEP", hash: "SHA-256" }, true, ["wrapKey"]);
}

export async function getCustodianPrivateKey(): Promise<webcrypto.CryptoKey> {
  const keys = loadKeys();
  return subtle.importKey("jwk", keys.privateKey, { name: "RSA-OAEP", hash: "SHA-256" }, true, ["unwrapKey"]);
}

export function getCustodianPublicKeyHex(): string {
  const keys = loadKeys();
  const json = JSON.stringify(keys.publicKey);
  const bytes = new TextEncoder().encode(json);
  return "0x" + Buffer.from(bytes).toString("hex");
}

export async function unwrapWithCustodianKey(wrappedKeyHex: string): Promise<webcrypto.CryptoKey> {
  const privKey = await getCustodianPrivateKey();
  const clean = wrappedKeyHex.startsWith("0x") ? wrappedKeyHex.slice(2) : wrappedKeyHex;
  const wrappedBytes = Buffer.from(clean, "hex");

  return subtle.unwrapKey(
    "raw",
    wrappedBytes,
    privKey,
    { name: "RSA-OAEP" },
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
}

export async function wrapForDoctor(aesKey: webcrypto.CryptoKey, doctorPubKeyHex: string): Promise<string> {
  const clean = doctorPubKeyHex.startsWith("0x") ? doctorPubKeyHex.slice(2) : doctorPubKeyHex;
  const pubJson = new TextDecoder().decode(Buffer.from(clean, "hex"));
  const jwk = JSON.parse(pubJson);

  const doctorPubKey = await subtle.importKey("jwk", jwk, { name: "RSA-OAEP", hash: "SHA-256" }, true, ["wrapKey"]);
  const wrapped = await subtle.wrapKey("raw", aesKey, doctorPubKey, { name: "RSA-OAEP" });

  return "0x" + Buffer.from(wrapped).toString("hex");
}

/** Generate and save custodian keys (run once during setup) */
export async function generateAndSaveCustodianKeys(): Promise<void> {
  const keyPair = await subtle.generateKey(
    { name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["wrapKey", "unwrapKey"]
  );

  const publicKey = await subtle.exportKey("jwk", keyPair.publicKey);
  const privateKey = await subtle.exportKey("jwk", keyPair.privateKey);

  const dir = dirname(KEYS_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  writeFileSync(KEYS_PATH, JSON.stringify({ publicKey, privateKey }, null, 2));
  console.log(`Custodian keys saved to ${KEYS_PATH}`);

  // Reset cache
  cachedKeys = null;
}
