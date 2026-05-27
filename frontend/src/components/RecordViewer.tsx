import React, { useState, useCallback, useEffect } from "react";
import { retrieveAndDecryptRecord, type RetrievalStep, type RetrievedRecord, RetrievalError } from "../utils/recordRetrieval.js";

export interface RecordViewerRecord {
  recordId: bigint | string;
  owner: string;
  ipfsCID: string;
  contentHash: string;
  recordType: number;
  status: number;
  isEmergency: boolean;
  createdAt: bigint;
  encryptedKey: string;
}

export interface RecordViewerProps {
  account: string;
  record: RecordViewerRecord;
  mode: "owner" | "doctor" | "emergency";
  onClose: () => void;
  onAccessLogged?: () => Promise<void>;
}

const STEP_LABELS: Record<RetrievalStep, string> = {
  "loading-key": "Unlocking access key…",
  "fetching": "Fetching encrypted file…",
  "verifying": "Verifying file integrity…",
  "decrypting": "Decrypting…",
  "done": "Ready",
};

const RECORD_TYPES = [
  "Lab Result", "Prescription", "Imaging Report", "Discharge Summary",
  "Allergy Record", "Vaccination Record", "Clinical Note", "Other",
];

export function RecordViewer({ account, record, mode, onClose, onAccessLogged }: RecordViewerProps) {
  const [step, setStep] = useState<RetrievalStep | "idle" | "error">("idle");
  const [result, setResult] = useState<RetrievedRecord | null>(null);
  const [error, setError] = useState("");
  const [accessLogged, setAccessLogged] = useState(false);
  const [showTechnical, setShowTechnical] = useState(false);

  // Cleanup object URL on unmount
  useEffect(() => {
    return () => { if (result?.url) URL.revokeObjectURL(result.url); };
  }, [result]);

  const handleUnlock = useCallback(async () => {
    setStep("loading-key");
    setError("");
    try {
      const retrieved = await retrieveAndDecryptRecord({
        account,
        ipfsCID: record.ipfsCID,
        contentHash: record.contentHash,
        encryptedKey: record.encryptedKey,
        fallbackFileName: `record-${record.recordId}`,
      }, setStep);

      setResult(retrieved);
      setStep("done");

      // Log access after successful decrypt (doctor/emergency only)
      if (mode !== "owner" && onAccessLogged && !accessLogged) {
        await onAccessLogged();
        setAccessLogged(true);
      }
    } catch (err) {
      setStep("error");
      if (err instanceof RetrievalError) {
        setError(err.message);
      } else {
        setError("This record could not be unlocked. Your local access key may be missing or incompatible.");
      }
    }
  }, [account, record, mode, onAccessLogged, accessLogged]);

  const handleDownload = () => {
    if (!result) return;
    const a = document.createElement("a");
    a.href = result.url;
    a.download = result.filename;
    a.click();
  };

  const renderPreview = () => {
    if (!result) return null;
    const { mimeType, url } = result;

    if (mimeType === "application/pdf") {
      return <iframe src={url} style={styles.preview} title="PDF preview" />;
    }
    if (mimeType.startsWith("image/")) {
      return <img src={url} alt="Record preview" style={styles.previewImg} />;
    }
    if (mimeType.includes("json")) {
      return <JsonPreview blob={result.blob} />;
    }
    return <p style={styles.noPreview}>Preview not available for this file type. Use the download button below.</p>;
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={styles.header}>
          <div>
            <h3 style={styles.title}>{RECORD_TYPES[record.recordType] || "Record"}</h3>
            <span style={styles.subtitle}>
              {mode === "owner" ? "Your record" : mode === "doctor" ? "Shared with you" : "Emergency access"}
            </span>
          </div>
          <button style={styles.closeBtn} onClick={onClose} aria-label="Close">×</button>
        </div>

        {/* Body */}
        <div style={styles.body}>
          {step === "idle" && (
            <div style={styles.lockedState}>
              <p style={styles.lockedText}>This record is protected. Unlock it to view or download the file.</p>
              {mode !== "owner" && (
                <p style={styles.auditNotice}>Opening this record will be logged in the patient's audit trail.</p>
              )}
              <button style={styles.unlockBtn} onClick={handleUnlock}>Unlock record</button>
            </div>
          )}

          {step !== "idle" && step !== "done" && step !== "error" && (
            <div style={styles.progress}>
              <div style={styles.spinner} />
              <p style={styles.stepLabel}>{STEP_LABELS[step]}</p>
            </div>
          )}

          {step === "error" && (
            <div style={styles.errorState}>
              <p style={styles.errorText}>{error}</p>
              <button style={styles.retryBtn} onClick={handleUnlock}>Try again</button>
            </div>
          )}

          {step === "done" && result && (
            <>
              {/* Integrity badge */}
              <div style={styles.badges}>
                {result.hashVerified ? (
                  <span style={styles.verifiedBadge}>✓ File integrity verified</span>
                ) : (
                  <span style={styles.unverifiedBadge}>⚠ Integrity could not be verified</span>
                )}
                {result.isLegacy && <span style={styles.legacyBadge}>Legacy format</span>}
              </div>

              {/* Preview */}
              <div style={styles.previewContainer}>{renderPreview()}</div>

              {/* Actions */}
              <div style={styles.actions}>
                <button style={styles.downloadBtn} onClick={handleDownload}>
                  Download ({result.filename})
                </button>
              </div>
            </>
          )}

          {/* Technical details */}
          <div style={styles.technicalSection}>
            <button style={styles.technicalToggle} onClick={() => setShowTechnical(!showTechnical)}>
              {showTechnical ? "▾ Technical details" : "▸ Technical details"}
            </button>
            {showTechnical && (
              <div style={styles.technicalContent}>
                <div style={styles.techRow}><span>Record ID:</span><code>{String(record.recordId)}</code></div>
                <div style={styles.techRow}><span>Storage ref:</span><code>{record.ipfsCID}</code></div>
                <div style={styles.techRow}><span>Content hash:</span><code>{record.contentHash}</code></div>
                <div style={styles.techRow}><span>Owner:</span><code>{record.owner}</code></div>
                {record.encryptedKey && record.encryptedKey !== "0x" && (
                  <div style={styles.techRow}><span>Encrypted key:</span><code>{record.encryptedKey.slice(0, 42)}…</code></div>
                )}
                {result && (
                  <>
                    <div style={styles.techRow}><span>MIME type:</span><code>{result.mimeType}</code></div>
                    <div style={styles.techRow}><span>File size:</span><code>{result.size} bytes</code></div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function JsonPreview({ blob }: { blob: Blob }) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    blob.text().then((t) => {
      try { setText(JSON.stringify(JSON.parse(t), null, 2)); }
      catch { setText(t); }
    });
  }, [blob]);
  if (!text) return null;
  return <pre style={styles.jsonPreview}>{text}</pre>;
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
    background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center",
    justifyContent: "center", padding: 16, zIndex: 1000,
  },
  modal: {
    background: "var(--color-bg, #fff)", borderRadius: 16, width: "100%",
    maxWidth: 600, maxHeight: "90vh", display: "flex", flexDirection: "column", overflow: "hidden",
  },
  header: {
    display: "flex", justifyContent: "space-between", alignItems: "flex-start",
    padding: "16px 20px", borderBottom: "1px solid var(--color-border, #e2e8f0)",
  },
  title: { margin: 0, fontSize: 18, fontWeight: 600 },
  subtitle: { fontSize: 13, color: "var(--color-text-muted, #64748b)", marginTop: 2 },
  closeBtn: {
    background: "none", border: "none", fontSize: 24, cursor: "pointer",
    color: "var(--color-text-light, #94a3b8)", padding: 8, minWidth: 44, minHeight: 44,
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  body: { padding: 20, overflowY: "auto", flex: 1 },
  lockedState: { textAlign: "center", padding: "24px 0" },
  lockedText: { fontSize: 15, marginBottom: 12, color: "var(--color-text, #0f172a)" },
  auditNotice: { fontSize: 13, color: "var(--color-text-muted, #64748b)", marginBottom: 16, fontStyle: "italic" },
  unlockBtn: {
    padding: "12px 24px", border: "none", borderRadius: 10,
    background: "var(--color-primary, #2563eb)", color: "#fff",
    fontSize: 15, fontWeight: 500, cursor: "pointer", minHeight: 44,
  },
  progress: { textAlign: "center", padding: "32px 0" },
  spinner: {
    width: 32, height: 32, border: "3px solid var(--color-border, #e2e8f0)",
    borderTopColor: "var(--color-primary, #2563eb)", borderRadius: "50%",
    animation: "spin 0.8s linear infinite", margin: "0 auto 12px",
  },
  stepLabel: { fontSize: 14, color: "var(--color-text-muted, #64748b)" },
  errorState: { textAlign: "center", padding: "24px 0" },
  errorText: { color: "var(--color-error, #dc2626)", fontSize: 14, marginBottom: 12 },
  retryBtn: {
    padding: "10px 20px", border: "1px solid var(--color-border, #e2e8f0)",
    borderRadius: 8, background: "var(--color-bg, #fff)", cursor: "pointer", fontSize: 14,
  },
  badges: { display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  verifiedBadge: {
    padding: "4px 10px", borderRadius: 6, fontSize: 12, fontWeight: 500,
    background: "var(--color-success-bg, #f0fdf4)", color: "var(--color-success, #16a34a)",
  },
  unverifiedBadge: {
    padding: "4px 10px", borderRadius: 6, fontSize: 12, fontWeight: 500,
    background: "var(--color-warning-bg, #fffbeb)", color: "var(--color-warning, #d97706)",
  },
  legacyBadge: {
    padding: "4px 10px", borderRadius: 6, fontSize: 12, fontWeight: 500,
    background: "var(--color-bg-secondary, #f1f5f9)", color: "var(--color-text-muted, #64748b)",
  },
  previewContainer: { marginBottom: 16, borderRadius: 8, overflow: "hidden", border: "1px solid var(--color-border, #e2e8f0)" },
  preview: { width: "100%", height: 400, border: "none", display: "block" },
  previewImg: { width: "100%", maxHeight: 400, objectFit: "contain", display: "block", background: "#f8fafc" },
  jsonPreview: {
    padding: 12, margin: 0, fontSize: 12, fontFamily: "monospace",
    background: "#f8fafc", overflow: "auto", maxHeight: 300, whiteSpace: "pre-wrap", wordBreak: "break-word",
  },
  noPreview: { padding: 24, textAlign: "center", fontSize: 14, color: "var(--color-text-muted, #64748b)" },
  actions: { display: "flex", gap: 8 },
  downloadBtn: {
    flex: 1, padding: "12px 16px", border: "none", borderRadius: 10,
    background: "var(--color-primary, #2563eb)", color: "#fff",
    fontSize: 14, fontWeight: 500, cursor: "pointer", minHeight: 44,
  },
  technicalSection: { marginTop: 16, borderTop: "1px solid var(--color-border, #e2e8f0)", paddingTop: 12 },
  technicalToggle: {
    background: "none", border: "none", cursor: "pointer",
    fontSize: 13, color: "var(--color-text-muted, #64748b)", padding: 0,
  },
  technicalContent: { marginTop: 8, fontSize: 12 },
  techRow: {
    display: "flex", flexDirection: "column", gap: 2, padding: "4px 0",
    borderBottom: "1px solid var(--color-border, #e2e8f0)",
  },
};
