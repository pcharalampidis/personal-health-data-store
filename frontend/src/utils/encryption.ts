/**
 * Client-side encryption utilities for health records.
 * Uses AES-256-GCM via the Web Crypto API.
 *
 * Architecture rule: encryption MUST happen in the browser before
 * any data leaves the client. The backend never sees plaintext.
 */

export async function generateAESKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
}

export async function exportKey(key: CryptoKey): Promise<Uint8Array> {
  const raw = await crypto.subtle.exportKey("raw", key);
  return new Uint8Array(raw);
}

export async function importKey(rawKey: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    rawKey.buffer as ArrayBuffer,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
}

export async function encryptFile(
  file: ArrayBuffer,
  key: CryptoKey
): Promise<{ encrypted: Uint8Array; iv: Uint8Array }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    file
  );
  return { encrypted: new Uint8Array(encrypted), iv };
}

export async function decryptFile(
  encryptedData: Uint8Array,
  iv: Uint8Array,
  key: CryptoKey
): Promise<ArrayBuffer> {
  return crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    encryptedData as BufferSource
  );
}

/**
 * Package encrypted content with its IV for storage.
 * Format: [12 bytes IV] [encrypted content]
 */
export function packageEncrypted(
  encrypted: Uint8Array,
  iv: Uint8Array
): Uint8Array {
  const result = new Uint8Array(iv.length + encrypted.length);
  result.set(iv, 0);
  result.set(encrypted, iv.length);
  return result;
}

/**
 * Unpackage stored content to extract IV and ciphertext.
 */
export function unpackageEncrypted(
  data: Uint8Array
): { iv: Uint8Array; encrypted: Uint8Array } {
  const iv = data.slice(0, 12);
  const encrypted = data.slice(12);
  return { iv, encrypted };
}

/**
 * Compute keccak256-compatible hash of content for on-chain integrity check.
 * Uses SHA-256 from Web Crypto (keccak256 would require ethers).
 */
export async function hashContent(content: Uint8Array): Promise<string> {
  const { keccak256 } = await import("ethers");
  return keccak256(content);
}

/**
 * Convert a Uint8Array to a hex string (0x-prefixed) for smart contract calls.
 */
export function toHex(data: Uint8Array): string {
  return (
    "0x" + Array.from(data).map((b) => b.toString(16).padStart(2, "0")).join("")
  );
}

/**
 * Convert a Uint8Array to a base64 string efficiently.
 * Avoids stack overflow with large arrays.
 */
export function toBase64(data: Uint8Array): string {
  // Process in chunks to avoid stack overflow
  const chunkSize = 8192;
  let result = "";
  
  for (let i = 0; i < data.length; i += chunkSize) {
    const chunk = data.slice(i, i + chunkSize);
    result += String.fromCharCode(...chunk);
  }
  
  return btoa(result);
}

/**
 * Convert a hex string back to Uint8Array.
 */
export function fromHex(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.substr(i * 2, 2), 16);
  }
  return bytes;
}
