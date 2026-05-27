import React, { useState, useRef } from "react";
import type { JsonRpcSigner } from "ethers";
import {
  generateAESKey,
  encryptFile,
  packageEncrypted,
  hashContent,
  toHex,
  toBase64,
  fromHex,
} from "../utils/encryption.js";
import { importPublicKeyJWK, wrapAESKey } from "../utils/rsaKeys.js";
import { createRecordPackage } from "../utils/recordPackage.js";
import { getRecordManagerContract, getUserRegistryContract, RECORD_TYPES } from "../services/contracts.js";
import { friendlyErrorMessage } from "../utils/errorMessages.js";

interface Props {
  signer: JsonRpcSigner;
  onUploaded: () => void;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = ["application/pdf", "image/png", "image/jpeg", "application/json"];
const ALLOWED_EXTENSIONS = [".pdf", ".png", ".jpg", ".jpeg", ".json"];

type UploadStep = "idle" | "preparing" | "encrypting" | "uploading" | "saving" | "complete" | "error";

const STEP_LABELS: Record<UploadStep, string> = {
  idle: "",
  preparing: "Preparing file…",
  encrypting: "Encrypting in your browser…",
  uploading: "Uploading encrypted file…",
  saving: "Saving secure reference…",
  complete: "Complete",
  error: "Failed",
};

export function UploadRecord({ signer, onUploaded }: Props) {
  const [recordType, setRecordType] = useState(0);
  const [step, setStep] = useState<UploadStep>("idle");
  const [error, setError] = useState("");
  const [showTechnical, setShowTechnical] = useState(false);
  const [technical, setTechnical] = useState<Record<string, string>>({});
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const validateFile = (file: File): string | null => {
    if (file.size > MAX_FILE_SIZE) return "File is too large. Maximum size is 10MB.";
    const ext = "." + file.name.split(".").pop()?.toLowerCase();
    if (!ALLOWED_TYPES.includes(file.type) && !ALLOWED_EXTENSIONS.includes(ext)) {
      return "Unsupported file type. Please upload PDF, JPG, PNG, or JSON.";
    }
    return null;
  };

  const handleFileChange = () => {
    const file = fileRef.current?.files?.[0];
    setError("");
    setStep("idle");
    setTechnical({});
    if (!file) { setSelectedFile(null); return; }
    const err = validateFile(file);
    if (err) { setError(err); setSelectedFile(null); return; }
    setSelectedFile(file);
  };

  const handleUpload = async () => {
    if (!selectedFile) { setError("Choose a file before continuing."); return; }

    setError("");
    setStep("preparing");
    setTechnical({});

    try {
      // 1. Package file with metadata
      const plaintextPackage = await createRecordPackage(selectedFile);

      // 2. Encrypt
      setStep("encrypting");
      const aesKey = await generateAESKey();
      const { encrypted, iv } = await encryptFile(
        plaintextPackage.buffer.slice(plaintextPackage.byteOffset, plaintextPackage.byteOffset + plaintextPackage.byteLength) as ArrayBuffer,
        aesKey
      );
      const packaged = packageEncrypted(encrypted, iv);
      const contentHash = await hashContent(packaged);

      // Wrap AES key with patient RSA public key
      const userRegistry = getUserRegistryContract(signer);
      const pubKeyHex = await userRegistry.getPublicKey(await signer.getAddress());
      const pubKeyJson = new TextDecoder().decode(fromHex(pubKeyHex));
      const rsaPubKey = await importPublicKeyJWK(pubKeyJson);
      const wrappedKey = await wrapAESKey(aesKey, rsaPubKey);
      const encryptedKeyHex = toHex(wrappedKey);

      // 3. Upload to IPFS
      setStep("uploading");
      const uploadRes = await fetch("/api/records/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          encryptedContent: toBase64(packaged),
          fileName: `${selectedFile.name}.encrypted`,
        }),
      });
      if (!uploadRes.ok) {
        const err = await uploadRes.json();
        throw new Error(err.error || "Upload failed");
      }
      const { cid } = await uploadRes.json();

      // 4. Store on-chain
      setStep("saving");
      const recordManager = getRecordManagerContract(signer);
      const tx = await recordManager.addRecord(cid, contentHash, recordType, encryptedKeyHex);
      await tx.wait();

      setTechnical({ cid, contentHash, txHash: tx.hash, encryptedSize: `${packaged.length} bytes` });
      setStep("complete");
      setSelectedFile(null);
      if (fileRef.current) fileRef.current.value = "";
      onUploaded();
    } catch (err: unknown) {
      setError(friendlyErrorMessage(err));
      setStep("error");
    }
  };

  const isUploading = step !== "idle" && step !== "complete" && step !== "error";

  return (
    <div style={styles.card}>
      <h2 style={styles.heading}>Upload Health Record</h2>
      <p style={styles.hint}>Your file is encrypted in this browser before it is uploaded. The server never receives the readable file.</p>

      {step === "complete" ? (
        <div style={styles.successCard}>
          <p style={styles.successText}>Record uploaded securely</p>
          <p style={styles.successHint}>Your file was encrypted before storage and can now be viewed only by you or people you authorise.</p>
          <button style={styles.btn} onClick={() => setStep("idle")}>Upload another</button>
        </div>
      ) : (
        <>
          <div style={styles.field}>
            <label style={styles.label}>File</label>
            <input ref={fileRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.json" disabled={isUploading} style={styles.fileInput} onChange={handleFileChange} />
            {selectedFile && <p style={styles.fileMeta}>{selectedFile.name} — {(selectedFile.size / 1024).toFixed(1)} KB</p>}
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Record Type</label>
            <select value={recordType} onChange={(e) => setRecordType(Number(e.target.value))} disabled={isUploading} style={styles.select}>
              {RECORD_TYPES.map((t, i) => (<option key={i} value={i}>{t}</option>))}
            </select>
          </div>

          {/* Progress */}
          {isUploading && (
            <div style={styles.progress}>
              <div style={styles.spinner} />
              <p style={styles.stepLabel}>{STEP_LABELS[step]}</p>
            </div>
          )}

          {error && <p style={styles.error}>{error}</p>}

          <button onClick={handleUpload} disabled={isUploading || !selectedFile} style={styles.btn}>
            {isUploading ? "Processing…" : "Upload securely"}
          </button>
        </>
      )}

      {/* Technical details */}
      {Object.keys(technical).length > 0 && (
        <div style={styles.technicalSection}>
          <button style={styles.technicalToggle} onClick={() => setShowTechnical(!showTechnical)}>
            {showTechnical ? "▾ Technical details" : "▸ Technical details"}
          </button>
          {showTechnical && (
            <div style={styles.technicalContent}>
              {technical.cid && <div style={styles.techRow}><span>Storage ref:</span><code>{technical.cid}</code></div>}
              {technical.contentHash && <div style={styles.techRow}><span>Content hash:</span><code>{technical.contentHash}</code></div>}
              {technical.txHash && <div style={styles.techRow}><span>Confirmation:</span><code>{technical.txHash}</code></div>}
              {technical.encryptedSize && <div style={styles.techRow}><span>Encrypted size:</span><code>{technical.encryptedSize}</code></div>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: { padding: "var(--space-md)", borderRadius: "var(--radius-lg)", border: "1px solid var(--color-border)", background: "var(--color-bg-secondary)" },
  heading: { margin: "0 0 var(--space-xs)", fontSize: "var(--font-lg)", fontWeight: 600 },
  hint: { margin: "0 0 var(--space-md)", fontSize: "var(--font-sm)", color: "var(--color-text-muted)" },
  field: { marginBottom: "var(--space-sm)" },
  label: { display: "block", marginBottom: "var(--space-xs)", fontSize: "var(--font-sm)", fontWeight: 500, color: "var(--color-text-muted)" },
  fileInput: { width: "100%", padding: "var(--space-sm)", fontSize: "var(--font-base)", minHeight: "var(--touch-target)" },
  fileMeta: { margin: "var(--space-xs) 0 0", fontSize: "var(--font-sm)", color: "var(--color-text-muted)" },
  select: { width: "100%", padding: "var(--space-sm)", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)", fontSize: "var(--font-base)", minHeight: "var(--touch-target)" },
  btn: { width: "100%", padding: "var(--space-sm) var(--space-lg)", border: "none", borderRadius: "var(--radius-md)", background: "var(--color-primary)", color: "#fff", cursor: "pointer", fontSize: "var(--font-base)", fontWeight: 600, minHeight: "var(--touch-target)", marginTop: "var(--space-sm)" },
  progress: { textAlign: "center", padding: "var(--space-md) 0" },
  spinner: { width: 28, height: 28, border: "3px solid var(--color-border)", borderTopColor: "var(--color-primary)", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 8px" },
  stepLabel: { fontSize: "var(--font-sm)", color: "var(--color-text-muted)" },
  error: { color: "var(--color-error)", fontSize: "var(--font-sm)", padding: "var(--space-sm)", background: "var(--color-error-bg)", borderRadius: "var(--radius-md)", marginTop: "var(--space-sm)", wordBreak: "break-word" },
  successCard: { textAlign: "center", padding: "var(--space-lg) 0" },
  successText: { fontSize: "var(--font-lg)", fontWeight: 600, color: "var(--color-success)", margin: "0 0 var(--space-sm)" },
  successHint: { fontSize: "var(--font-sm)", color: "var(--color-text-muted)", margin: "0 0 var(--space-md)" },
  technicalSection: { marginTop: "var(--space-md)", borderTop: "1px solid var(--color-border)", paddingTop: "var(--space-sm)" },
  technicalToggle: { background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "var(--color-text-muted)", padding: 0 },
  technicalContent: { marginTop: 8, fontSize: 12 },
  techRow: { display: "flex", flexDirection: "column", gap: 2, padding: "4px 0", borderBottom: "1px solid var(--color-border)", wordBreak: "break-all" },
};
