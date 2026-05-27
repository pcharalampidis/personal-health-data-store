import React, { useEffect, useState } from "react";
import type { JsonRpcSigner, BrowserProvider } from "ethers";
import { useDoctorAccess, type SharedRecord } from "../hooks/useDoctorAccess.js";
import { RECORD_TYPES } from "../services/contracts.js";
import { RecordViewer, type RecordViewerRecord } from "./RecordViewer.js";

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

  const [viewerRecord, setViewerRecord] = useState<RecordViewerRecord | null>(null);
  const [activeRecordId, setActiveRecordId] = useState<bigint | null>(null);

  useEffect(() => {
    loadSharedRecords();
  }, [loadSharedRecords]);

  const handleView = (record: SharedRecord) => {
    setActiveRecordId(record.recordId);
    setViewerRecord({
      recordId: record.recordId,
      owner: record.owner,
      ipfsCID: record.ipfsCID,
      contentHash: record.contentHash,
      recordType: record.recordType,
      status: record.status,
      isEmergency: record.isEmergency,
      createdAt: record.createdAt,
      encryptedKey: record.encryptedKey,
    });
  };

  const handleAccessLogged = async () => {
    if (activeRecordId != null) {
      await logRecordAccess(activeRecordId);
    }
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
              <div><strong>Patient:</strong> {formatAddress(record.owner)}</div>
              <div style={styles.timestamp}>Created: {formatDate(record.createdAt)}</div>
            </div>

            <div style={styles.recordActions}>
              <button style={styles.viewBtn} onClick={() => handleView(record)}>
                View Record
              </button>
            </div>
          </div>
        ))}
      </div>

      {viewerRecord && (
        <RecordViewer
          account={account}
          record={viewerRecord}
          mode="doctor"
          onClose={() => { setViewerRecord(null); setActiveRecordId(null); }}
          onAccessLogged={handleAccessLogged}
        />
      )}

      <div style={styles.refreshRow}>
        <button style={styles.refreshBtn} onClick={loadSharedRecords} disabled={loading}>
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
};
