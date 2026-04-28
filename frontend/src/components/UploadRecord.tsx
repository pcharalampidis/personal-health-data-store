import React, { useState, useRef } from "react";
import type { JsonRpcSigner } from "ethers";
import {
  generateAESKey,
  exportKey,
  encryptFile,
  packageEncrypted,
  hashContent,
  toHex,
  toBase64,
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
  const [showDebug, setShowDebug] = useState(false);
  const [debugInfo, setDebugInfo] = useState<any>({ step: "idle" });
  const fileRef = useRef<HTMLInputElement>(null);

  const handleUpload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setStatus("Please select a file.");
      return;
    }

    setUploading(true);
    setStatus("Starting upload...");
    setDebugInfo({ step: "reading" });

    try {
      console.log("[1/6] Reading file:", file.name, "Size:", file.size, "bytes");
      const arrayBuffer = await file.arrayBuffer();
      
      console.log("[2/6] Generating AES key...");
      setDebugInfo({ step: "encrypting", originalSize: arrayBuffer.byteLength });
      const aesKey = await generateAESKey();
      
      console.log("[3/6] Encrypting file...");
      const { encrypted, iv } = await encryptFile(arrayBuffer, aesKey);
      const packaged = packageEncrypted(encrypted, iv);
      console.log("   Encrypted size:", packaged.length, "bytes");
      
      setDebugInfo({ step: "hashing", originalSize: arrayBuffer.byteLength, encryptedSize: packaged.length });
      
      console.log("[4/6] Computing hash...");
      const contentHash = await hashContent(packaged);
      console.log("   Hash:", contentHash.slice(0, 20) + "...");
      
      const rawKey = await exportKey(aesKey);
      const encryptedKeyHex = toHex(rawKey);
      
      setStatus("Uploading to IPFS...");
      setDebugInfo({ step: "uploading_ipfs", originalSize: arrayBuffer.byteLength, encryptedSize: packaged.length, contentHash });
      
      console.log("[5/6] Uploading to IPFS...");
      const uploadRes = await fetch("/api/records/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          encryptedContent: toBase64(packaged),
          fileName: `${file.name}.encrypted`,
        }),
      });

      if (!uploadRes.ok) {
        const err = await uploadRes.json();
        throw new Error(err.error || "Upload failed");
      }

      const { cid, size, timestamp } = await uploadRes.json();
      console.log("   IPFS CID:", cid);
      console.log("   Size:", size, "bytes");
      console.log("   Timestamp:", timestamp);
      
      setStatus("Storing on blockchain...");
      setDebugInfo({ step: "blockchain", originalSize: arrayBuffer.byteLength, encryptedSize: packaged.length, contentHash, cid });
      
      console.log("[6/6] Storing on blockchain...");
      const recordManager = getRecordManagerContract(signer);
      const tx = await recordManager.addRecord(cid, contentHash, recordType, encryptedKeyHex);
      console.log("   Transaction hash:", tx.hash);
      
      await tx.wait();
      console.log("   Transaction confirmed!");

      setDebugInfo({ 
        step: "complete", 
        originalSize: arrayBuffer.byteLength, 
        encryptedSize: packaged.length, 
        contentHash, 
        cid,
        txHash: tx.hash 
      });

      setStatus(`Success! CID: ${cid.slice(0, 20)}...`);
      
      if (fileRef.current) fileRef.current.value = "";
      onUploaded();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("Upload error:", msg);
      setDebugInfo({ step: "error", error: msg });
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
            <option key={i} value={i}>{t}</option>
          ))}
        </select>
      </div>

      <div style={styles.buttonRow}>
        <button onClick={handleUpload} disabled={uploading} style={styles.btn}>
          {uploading ? "Processing..." : "Encrypt & Upload"}
        </button>
        <button onClick={() => setShowDebug(!showDebug)} style={styles.debugBtn} type="button">
          {showDebug ? "Hide" : "Debug"}
        </button>
      </div>

      {status && <p style={styles.status}>{status}</p>}

      {showDebug && (
        <div style={styles.debugPanel}>
          <h3>Debug Info</h3>
          <p><strong>Step:</strong> {debugInfo.step}</p>
          {debugInfo.originalSize && <p><strong>Original:</strong> {debugInfo.originalSize} bytes</p>}
          {debugInfo.encryptedSize && <p><strong>Encrypted:</strong> {debugInfo.encryptedSize} bytes</p>}
          {debugInfo.cid && (
            <>
              <p><strong>IPFS CID:</strong> {debugInfo.cid}</p>
              <p>
                <a href={`https://gateway.pinata.cloud/ipfs/${debugInfo.cid}`} target="_blank" rel="noopener noreferrer">
                  View on IPFS →
                </a>
              </p>
              <p>
                <a href="https://app.pinata.cloud/pinmanager" target="_blank" rel="noopener noreferrer">
                  Pinata Dashboard →
                </a>
              </p>
            </>
          )}
          {debugInfo.txHash && <p><strong>Tx:</strong> {debugInfo.txHash.slice(0, 30)}...</p>}
          {debugInfo.error && <p style={{color: "red"}}>Error: {debugInfo.error}</p>}
          <p style={{fontSize: "0.8rem", color: "#666", marginTop: "1rem"}}>
            Open browser console (F12) for detailed logs
          </p>
        </div>
      )}
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
  buttonRow: {
    display: "flex",
    gap: "0.5rem",
    marginTop: "0.5rem",
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
  },
  debugBtn: {
    padding: "0.6rem 1rem",
    border: "1px solid #ccc",
    borderRadius: 6,
    background: "#f5f5f5",
    color: "#555",
    cursor: "pointer",
    fontSize: "0.85rem",
  },
  status: {
    marginTop: "0.75rem",
    padding: "0.5rem 0.75rem",
    background: "#f0f4ff",
    borderRadius: 6,
    fontSize: "0.85rem",
    wordBreak: "break-all",
  },
  debugPanel: {
    marginTop: "1rem",
    padding: "1rem",
    background: "#f8f9fa",
    borderRadius: 8,
    border: "1px solid #e0e0e0",
    fontSize: "0.85rem",
  },
};
