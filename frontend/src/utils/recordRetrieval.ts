/**
 * Unified record retrieval: fetch encrypted content from IPFS,
 * verify integrity, unwrap key, decrypt, and parse the result.
 */

import { fromHex, fromBase64, unpackageEncrypted, decryptFile, hashContent } from "./encryption.js";
import { getStoredPrivateKeyJWK, importPrivateKeyJWK, unwrapAESKey } from "./rsaKeys.js";
import { parseRecordPackage, type ParsedRecordPackage } from "./recordPackage.js";

export interface RetrieveRecordInput {
  account: string;
  ipfsCID: string;
  contentHash: string;
  encryptedKey: string; // hex-encoded wrapped AES key
  fallbackFileName: string;
}

export interface RetrievedRecord {
  blob: Blob;
  url: string;
  filename: string;
  mimeType: string;
  size: number;
  hashVerified: boolean;
  isLegacy: boolean;
}

export type RetrievalStep =
  | "loading-key"
  | "fetching"
  | "verifying"
  | "decrypting"
  | "done";

export class RetrievalError extends Error {
  constructor(public step: RetrievalStep, message: string) {
    super(message);
    this.name = "RetrievalError";
  }
}

export async function retrieveAndDecryptRecord(
  input: RetrieveRecordInput,
  onStep?: (step: RetrievalStep) => void
): Promise<RetrievedRecord> {
  const { account, ipfsCID, contentHash, encryptedKey, fallbackFileName } = input;

  // 1. Load RSA private key
  onStep?.("loading-key");
  const privJwk = getStoredPrivateKeyJWK(account);
  if (!privJwk) {
    throw new RetrievalError("loading-key", "Local access key not found. You may need to use the same browser and wallet where this record was created.");
  }

  const rsaPrivKey = await importPrivateKeyJWK(privJwk);
  const aesKey = await unwrapAESKey(fromHex(encryptedKey), rsaPrivKey);

  // 2. Fetch encrypted content from IPFS
  onStep?.("fetching");
  const res = await fetch(`/api/records/fetch/${ipfsCID}`);
  if (!res.ok) throw new RetrievalError("fetching", "Could not retrieve the encrypted file from storage.");
  const { encryptedContent } = await res.json();
  const encryptedBytes = fromBase64(encryptedContent);

  // 3. Verify integrity hash
  onStep?.("verifying");
  let hashVerified = false;
  if (contentHash && contentHash !== "0x" + "0".repeat(64)) {
    const computed = await hashContent(encryptedBytes);
    hashVerified = computed.toLowerCase() === contentHash.toLowerCase();
    if (!hashVerified) {
      throw new RetrievalError("verifying", "File integrity could not be verified. The stored content does not match the expected hash. For safety, this record will not be opened.");
    }
  }

  // 4. Decrypt
  onStep?.("decrypting");
  const { iv, encrypted } = unpackageEncrypted(encryptedBytes);
  const decrypted = await decryptFile(encrypted, iv, aesKey);

  // 5. Parse package
  onStep?.("done");
  const parsed: ParsedRecordPackage = parseRecordPackage(decrypted, fallbackFileName);

  const blob = new Blob([parsed.fileBytes as BlobPart], { type: parsed.mimeType });
  const url = URL.createObjectURL(blob);

  return {
    blob,
    url,
    filename: parsed.filename,
    mimeType: parsed.mimeType,
    size: parsed.fileBytes.length,
    hashVerified,
    isLegacy: parsed.isLegacy,
  };
}
