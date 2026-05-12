import React, { useEffect, useState } from "react";
import type { JsonRpcSigner, BrowserProvider } from "ethers";
import { useDoctorAccess, type SharedRecord } from "../hooks/useDoctorAccess.js";
import { RECORD_TYPES } from "../services/contracts.js";

interface Props {
  account: string;
  provider: BrowserProvider;
  signer: JsonRpcSigner;
}

export function SharedRecords({ account, provider, signer }: Props) {
  const {
    sharedRecords,
    loading,
    error,
    loadSharedRecords,
    logRecordAccess,
  } = useDoctorAccess(account, provider, signer);

  const [viewingRecord, setViewingRecord] = useState<SharedRecord | null>(null);
  const [loggingAccess, setLoggingAccess] = useState(false);

  useEffect(() => {
    loadSharedRecords();
  }, [loadSharedRecords]);

  const handleViewRecord = async (record: SharedRecord) => {
    setLoggingAccess(true);
    await logRecordAccess(record.recordId);
    setViewingRecord(record);
    setLoggingAccess(false);
  };

  const formatDate = (ts: bigint) =>
    new Date(Number(ts) * 1000).toLocaleString();

  const formatAddress = (addr: string) =>
    `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  const STATUS_LABELS = ["Active", "Archived", "Deleted"];

  return (
    <div style={styles.card}>
      <h2 style={styles.heading}>Shared Records</h2>
      <p style={styles.description}>
        Health records that patients have shared with you.
      </p>

      {loading && <p style={styles.muted}>Loading shared records...</p>}
      {error && <p style={styles.error}>{error}</p>}

      {!loading && !error && sharedRecords.length === 0 && (
        <p style={styles.muted}>
          No records have been shared with you yet. Request access from patients to view their health records.
        </p>
      )}

      <div style={styles.recordGrid}>
        {sharedRecords.map((record) => (
          <div key={String(record.recordId)} style={styles.recordCard}>
            <div style={styles.recordHeader}>
              <span style={styles.recordId}>#{String(record.recordId)}</span>
              <span style={styles.typeBadge}>
                {RECORD_TYPES[record.recordType] || "Unknown"}
              </span>
              <span
                style={{
                  ...styles.statusBadge,
                  background: record.status === 0 ? "#e8f5e9" : "#fff3e0",
                  color: record.status === 0 ? "#2e7d32" : "#e65100",
                }}
              >
                {STATUS_LABELS[record.status]}
              </span>
            </div>

            <div style={styles.recordDetails}>
              <div>
                <strong>Patient:</strong> {formatAddress(record.owner)}
              </div>
              <div>
                <strong>CID:</strong> {record.ipfsCID.slice(0, 20)}...
              </div>
              <div style={styles.timestamp}>
                Created: {formatDate(record.createdAt)}
              </div>
            </div>

            <div style={styles.recordActions}>
              <button
                style={styles.viewBtn}
                onClick={() => handleViewRecord(record)}
                disabled={loggingAccess}
              >
                {loggingAccess ? "Loading..." : "View Details"}
              </button>
            </div>
          </div>
        ))}
      </div>

      {viewingRecord && (
        <div style={styles.modal} onClick={() => setViewingRecord(null)}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>
                Record #{String(viewingRecord.recordId)}
              </h3>
              <button
                style={styles.closeBtn}
                onClick={() => setViewingRecord(null)}
              >
                ×
              </button>
            </div>

            <div style={styles.modalBody}>
              <div style={styles.detailRow}>
                <span style={styles.detailLabel}>Record Type:</span>
                <span>{RECORD_TYPES[viewingRecord.recordType] || "Unknown"}</span>
              </div>
              <div style={styles.detailRow}>
                <span style={styles.detailLabel}>Status:</span>
                <span>{STATUS_LABELS[viewingRecord.status]}</span>
              </div>
              <div style={styles.detailRow}>
                <span style={styles.detailLabel}>Patient:</span>
                <span style={styles.mono}>{viewingRecord.owner}</span>
              </div>
              <div style={styles.detailRow}>
                <span style={styles.detailLabel}>IPFS CID:</span>
                <span style={styles.mono}>{viewingRecord.ipfsCID}</span>
              </div>
              <div style={styles.detailRow}>
                <span style={styles.detailLabel}>Created:</span>
                <span>{formatDate(viewingRecord.createdAt)}</span>
              </div>
              <div style={styles.detailRow}>
                <span style={styles.detailLabel}>Emergency Record:</span>
                <span>{viewingRecord.isEmergency ? "Yes" : "No"}</span>
              </div>

              {viewingRecord.encryptedKey && viewingRecord.encryptedKey !== "0x" && (
                <div style={styles.keySection}>
                  <span style={styles.detailLabel}>Encrypted Key:</span>
                  <code style={styles.keyCode}>
                    {viewingRecord.encryptedKey.slice(0, 40)}...
                  </code>
                </div>
              )}

              <div style={styles.ipfsLink}>
                <a
                  href={`https://gateway.pinata.cloud/ipfs/${viewingRecord.ipfsCID}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={styles.link}
                >
                  View on IPFS Gateway →
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      <div style={styles.refreshRow}>
        <button
          style={styles.refreshBtn}
          onClick={loadSharedRecords}
          disabled={loading}
        >
          Refresh
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    padding: "var(--space-md)",
    borderRadius: "var(--radius-lg)",
    border: "1px solid var(--color-border)",
    background: "var(--color-bg-secondary)",
  },
  heading: {
    margin: "0 0 var(--space-sm)",
    fontSize: "var(--font-lg)",
    fontWeight: 600,
  },
  description: {
    margin: "0 0 var(--space-md)",
    fontSize: "var(--font-sm)",
    color: "var(--color-text-muted)",
  },
  muted: {
    color: "var(--color-text-light)",
    fontSize: "var(--font-base)",
  },
  error: {
    color: "var(--color-error)",
    fontSize: "var(--font-base)",
    padding: "var(--space-sm)",
    background: "var(--color-error-bg)",
    borderRadius: "var(--radius-md)",
    wordBreak: "break-word",
  },
  recordGrid: {
    display: "flex",
    flexDirection: "column",
    gap: "var(--space-sm)",
  },
  recordCard: {
    padding: "var(--space-sm)",
    borderRadius: "var(--radius-md)",
    border: "1px solid var(--color-border)",
    background: "var(--color-bg)",
  },
  recordHeader: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: "var(--space-sm)",
    marginBottom: "var(--space-sm)",
  },
  recordId: {
    fontWeight: 600,
    fontSize: "var(--font-base)",
    fontFamily: "monospace",
  },
  typeBadge: {
    padding: "var(--space-xs) var(--space-sm)",
    borderRadius: "var(--radius-sm)",
    fontSize: "var(--font-xs)",
    fontWeight: 500,
    background: "var(--color-info-bg)",
    color: "var(--color-info)",
    whiteSpace: "nowrap",
  },
  statusBadge: {
    padding: "var(--space-xs) var(--space-sm)",
    borderRadius: "var(--radius-sm)",
    fontSize: "var(--font-xs)",
    fontWeight: 500,
    whiteSpace: "nowrap",
  },
  recordDetails: {
    fontSize: "var(--font-sm)",
    color: "var(--color-text-muted)",
    display: "flex",
    flexDirection: "column",
    gap: "var(--space-xs)",
    marginBottom: "var(--space-sm)",
    wordBreak: "break-all",
  },
  timestamp: {
    fontSize: "var(--font-sm)",
    color: "var(--color-text-light)",
    marginTop: "var(--space-xs)",
  },
  recordActions: {
    display: "flex",
    flexWrap: "wrap",
    gap: "var(--space-sm)",
  },
  viewBtn: {
    padding: "var(--space-sm) var(--space-md)",
    border: "none",
    borderRadius: "var(--radius-md)",
    background: "var(--color-primary)",
    color: "#fff",
    cursor: "pointer",
    fontSize: "var(--font-sm)",
    fontWeight: 500,
    minHeight: "var(--touch-target)",
    flex: "1 1 auto",
  },
  refreshRow: {
    marginTop: "var(--space-md)",
    textAlign: "right",
  },
  refreshBtn: {
    padding: "var(--space-sm) var(--space-md)",
    border: "1px solid var(--color-border)",
    borderRadius: "var(--radius-md)",
    background: "var(--color-bg)",
    cursor: "pointer",
    fontSize: "var(--font-sm)",
    minHeight: "var(--touch-target)",
  },
  modal: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: "rgba(0, 0, 0, 0.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "var(--space-md)",
    zIndex: 1000,
  },
  modalContent: {
    background: "var(--color-bg)",
    borderRadius: "var(--radius-lg)",
    maxWidth: "500px",
    width: "100%",
    maxHeight: "85vh",
    overflow: "auto",
  },
  modalHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "var(--space-md)",
    borderBottom: "1px solid var(--color-border)",
    position: "sticky",
    top: 0,
    background: "var(--color-bg)",
  },
  modalTitle: {
    margin: 0,
    fontSize: "var(--font-lg)",
    fontWeight: 600,
  },
  closeBtn: {
    background: "none",
    border: "none",
    fontSize: "var(--font-xl)",
    cursor: "pointer",
    color: "var(--color-text-light)",
    padding: "var(--space-sm)",
    minWidth: "var(--touch-target)",
    minHeight: "var(--touch-target)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  modalBody: {
    padding: "var(--space-md)",
  },
  detailRow: {
    display: "flex",
    flexDirection: "column",
    gap: "var(--space-xs)",
    padding: "var(--space-sm) 0",
    borderBottom: "1px solid var(--color-border)",
    fontSize: "var(--font-base)",
  },
  detailLabel: {
    fontWeight: 500,
    color: "var(--color-text-muted)",
    fontSize: "var(--font-sm)",
  },
  mono: {
    fontFamily: "monospace",
    fontSize: "var(--font-sm)",
    wordBreak: "break-all",
  },
  keySection: {
    marginTop: "var(--space-md)",
    padding: "var(--space-sm)",
    background: "var(--color-bg-secondary)",
    borderRadius: "var(--radius-md)",
  },
  keyCode: {
    display: "block",
    marginTop: "var(--space-sm)",
    fontSize: "var(--font-sm)",
    fontFamily: "monospace",
    wordBreak: "break-all",
    color: "var(--color-text-muted)",
  },
  ipfsLink: {
    marginTop: "var(--space-md)",
    textAlign: "center",
  },
  link: {
    color: "var(--color-accent)",
    textDecoration: "none",
    fontSize: "var(--font-base)",
    fontWeight: 500,
    display: "inline-block",
    padding: "var(--space-sm)",
  },
};
