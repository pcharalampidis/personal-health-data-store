import React, { useState, useRef } from "react";
import type { JsonRpcSigner } from "ethers";
import {
  generateAESKey,
  exportKey,
  encryptFile,
  packageEncrypted,
  hashContent,
  toHex,
} from "../utils/encryption.js";
import { getRecordManagerContract, RECORD_TYPES } from "../services/contracts.js";

interface Props {
  signer: JsonRpcSigner;
  onUploaded: () => void;
}

export function UploadRecord({ signer, onUploaded }: Props) {
  const [recordType, setRecordType] = useState(0);
  const [status, setStatus] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleUpload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setStatus("Please select a file.");
      return;
    }

    setUploading(true);
    setStatus("Encrypting file in browser...");

    try {
      // 1. Read file
      const arrayBuffer = await file.arrayBuffer();

      // 2. Generate AES key and encrypt client-side
      const aesKey = await generateAESKey();
      const { encrypted, iv } = await encryptFile(arrayBuffer, aesKey);
      const packaged = packageEncrypted(encrypted, iv);

      // 3. Hash the encrypted content for on-chain integrity verification
      const contentHash = await hashContent(packaged);

      // 4. Export key and prepare as hex for on-chain storage
      const rawKey = await exportKey(aesKey);
      const encryptedKeyHex = toHex(rawKey);

      // 5. Upload encrypted content to IPFS via backend
      setStatus("Uploading encrypted file to IPFS...");
      const uploadRes = await fetch("/api/records/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          encryptedContent: btoa(
            String.fromCharCode(...packaged)
          ),
          fileName: `${file.name}.encrypted`,
        }),
      });

      if (!uploadRes.ok) {
        const err = await uploadRes.json();
        throw new Error(err.error || "Upload failed");
      }

      const { cid } = await uploadRes.json();

      // 6. Store reference on-chain
      setStatus("Storing record on blockchain...");
      const recordManager = getRecordManagerContract(signer);
      const tx = await recordManager.addRecord(
        cid,
        contentHash,
        recordType,
        encryptedKeyHex
      );
      await tx.wait();

      setStatus(`Record uploaded successfully! CID: ${cid}`);
      if (fileRef.current) fileRef.current.value = "";
      onUploaded();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatus(`Error: ${msg}`);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div style={styles.card}>
      <h2 style={styles.heading}>Upload Health Record</h2>

      <div style={styles.field}>
        <label style={styles.label}>File</label>
        <input ref={fileRef} type="file" disabled={uploading} style={styles.fileInput} />
      </div>

      <div style={styles.field}>
        <label style={styles.label}>Record Type</label>
        <select
          value={recordType}
          onChange={(e) => setRecordType(Number(e.target.value))}
          disabled={uploading}
          style={styles.select}
        >
          {RECORD_TYPES.map((t, i) => (
            <option key={i} value={i}>
              {t}
            </option>
          ))}
        </select>
      </div>

      <button onClick={handleUpload} disabled={uploading} style={styles.btn}>
        {uploading ? "Processing..." : "Encrypt & Upload"}
      </button>

      {status && <p style={styles.status}>{status}</p>}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    padding: "1.25rem",
    borderRadius: 10,
    border: "1px solid #e0e0e0",
    background: "#fafafa",
  },
  heading: {
    margin: "0 0 1rem",
    fontSize: "1.1rem",
    fontWeight: 600,
  },
  field: {
    marginBottom: "0.75rem",
  },
  label: {
    display: "block",
    marginBottom: "0.25rem",
    fontSize: "0.85rem",
    fontWeight: 500,
    color: "#555",
  },
  fileInput: {
    width: "100%",
    padding: "0.4rem",
    fontSize: "0.9rem",
  },
  select: {
    width: "100%",
    padding: "0.5rem",
    borderRadius: 6,
    border: "1px solid #ccc",
    fontSize: "0.9rem",
  },
  btn: {
    padding: "0.6rem 1.5rem",
    border: "none",
    borderRadius: 6,
    background: "#0f3460",
    color: "#fff",
    cursor: "pointer",
    fontSize: "0.95rem",
    fontWeight: 600,
    marginTop: "0.5rem",
  },
  status: {
    marginTop: "0.75rem",
    padding: "0.5rem 0.75rem",
    background: "#f0f4ff",
    borderRadius: 6,
    fontSize: "0.85rem",
    wordBreak: "break-all",
  },
};
