import React, { useEffect, useState } from "react";
import type { BrowserProvider } from "ethers";
import { getRecordManagerContract, RECORD_TYPES, RECORD_MANAGER_ADDRESS } from "../services/contracts.js";

interface RecordInfo {
  recordId: bigint;
  ipfsCID: string;
  recordType: number;
  status: number;
  isEmergency: boolean;
  createdAt: bigint;
}

interface Props {
  account: string;
  provider: BrowserProvider;
}

const STATUS_LABELS = ["Active", "Archived", "Deleted"];

export function RecordList({ account, provider }: Props) {
  const [records, setRecords] = useState<RecordInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    loadRecords();
  }, [account]);

  async function loadRecords() {
    setLoading(true);
    setError("");

    try {
      const contract = getRecordManagerContract(provider);
      
      // Check if contract exists at address
      const code = await provider.getCode(RECORD_MANAGER_ADDRESS);
      if (code === '0x') {
        setError("Contract not found at address. Please run 'npm run deploy:local' first.");
        setLoading(false);
        return;
      }
      
      const ids: bigint[] = await contract.getRecordsByOwner(account);

      const loaded: RecordInfo[] = [];
      for (const id of ids) {
        const rec = await contract.getRecord(id);
        loaded.push({
          recordId: rec.recordId,
          ipfsCID: rec.ipfsCID,
          recordType: Number(rec.recordType),
          status: Number(rec.status),
          isEmergency: rec.isEmergency,
          createdAt: rec.createdAt,
        });
      }

      setRecords(loaded);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("address not set")) {
        setError("Contract addresses not configured. Deploy contracts first.");
      } else if (msg.includes("could not decode result")) {
        setError("Contract not deployed or wrong network. Make sure Hardhat node is running and contracts are deployed.");
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }

  const formatDate = (ts: bigint) =>
    new Date(Number(ts) * 1000).toLocaleString();

  return (
    <div style={styles.card}>
      <h2 style={styles.heading}>My Records</h2>

      {loading && <p style={styles.muted}>Loading records...</p>}
      {error && <p style={styles.error}>{error}</p>}

      {!loading && !error && records.length === 0 && (
        <p style={styles.muted}>No records found. Upload your first health record above.</p>
      )}

      {records.map((r) => (
        <div key={String(r.recordId)} style={styles.record}>
          <div style={styles.recordHeader}>
            <span style={styles.recordId}>#{String(r.recordId)}</span>
            <span style={styles.badge}>
              {RECORD_TYPES[r.recordType] || "Unknown"}
            </span>
            <span
              style={{
                ...styles.badge,
                background: r.status === 0 ? "#e8f5e9" : "#fff3e0",
                color: r.status === 0 ? "#2e7d32" : "#e65100",
              }}
            >
              {STATUS_LABELS[r.status]}
            </span>
            {r.isEmergency && (
              <span style={{ ...styles.badge, background: "#fce4ec", color: "#c62828" }}>
                Emergency
              </span>
            )}
          </div>
          <div style={styles.recordMeta}>
            <span>CID: {r.ipfsCID.slice(0, 20)}...</span>
            <span>Created: {formatDate(r.createdAt)}</span>
          </div>
        </div>
      ))}
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
  muted: {
    color: "#888",
    fontSize: "0.9rem",
  },
  error: {
    color: "#c62828",
    fontSize: "0.9rem",
    padding: "0.5rem",
    background: "#fce4ec",
    borderRadius: 6,
  },
  record: {
    padding: "0.75rem",
    marginBottom: "0.5rem",
    borderRadius: 8,
    border: "1px solid #e8e8e8",
    background: "#fff",
  },
  recordHeader: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    marginBottom: "0.35rem",
  },
  recordId: {
    fontWeight: 600,
    fontSize: "0.95rem",
    fontFamily: "monospace",
  },
  badge: {
    padding: "0.15rem 0.5rem",
    borderRadius: 4,
    fontSize: "0.75rem",
    fontWeight: 500,
    background: "#e3f2fd",
    color: "#1565c0",
  },
  recordMeta: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: "0.8rem",
    color: "#777",
    fontFamily: "monospace",
  },
};
