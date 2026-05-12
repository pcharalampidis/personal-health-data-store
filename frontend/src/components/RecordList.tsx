import React, { useEffect, useState, useMemo } from "react";
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

type StatusFilter = "all" | "active" | "archived" | "deleted";
type EmergencyFilter = "all" | "emergency" | "normal";

export function RecordList({ account, provider }: Props) {
  const [records, setRecords] = useState<RecordInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [typeFilter, setTypeFilter] = useState<number | "all">("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [emergencyFilter, setEmergencyFilter] = useState<EmergencyFilter>("all");
  const [searchTerm, setSearchTerm] = useState("");

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

  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      if (typeFilter !== "all" && r.recordType !== typeFilter) return false;

      if (statusFilter === "active" && r.status !== 0) return false;
      if (statusFilter === "archived" && r.status !== 1) return false;
      if (statusFilter === "deleted" && r.status !== 2) return false;

      if (emergencyFilter === "emergency" && !r.isEmergency) return false;
      if (emergencyFilter === "normal" && r.isEmergency) return false;

      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const idMatch = String(r.recordId).includes(term);
        const cidMatch = r.ipfsCID.toLowerCase().includes(term);
        const typeMatch = (RECORD_TYPES[r.recordType] || "").toLowerCase().includes(term);
        if (!idMatch && !cidMatch && !typeMatch) return false;
      }

      return true;
    });
  }, [records, typeFilter, statusFilter, emergencyFilter, searchTerm]);

  const uniqueTypes = useMemo(() => {
    const types = new Set(records.map((r) => r.recordType));
    return Array.from(types).sort();
  }, [records]);

  const clearFilters = () => {
    setTypeFilter("all");
    setStatusFilter("all");
    setEmergencyFilter("all");
    setSearchTerm("");
  };

  const hasActiveFilters =
    typeFilter !== "all" ||
    statusFilter !== "all" ||
    emergencyFilter !== "all" ||
    searchTerm !== "";

  return (
    <div style={styles.card}>
      <div style={styles.headerRow}>
        <h2 style={styles.heading}>My Records</h2>
        <span style={styles.count}>
          {filteredRecords.length} of {records.length}
        </span>
      </div>

      {records.length > 0 && (
        <div style={styles.filters}>
          <input
            type="text"
            placeholder="Search by ID, CID, or type..."
            style={styles.searchInput}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <div style={styles.filterRow}>
            <select
              style={styles.select}
              value={typeFilter === "all" ? "all" : String(typeFilter)}
              onChange={(e) =>
                setTypeFilter(e.target.value === "all" ? "all" : Number(e.target.value))
              }
            >
              <option value="all">All Types</option>
              {uniqueTypes.map((t) => (
                <option key={t} value={t}>
                  {RECORD_TYPES[t] || `Type ${t}`}
                </option>
              ))}
            </select>
            <select
              style={styles.select}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="archived">Archived</option>
              <option value="deleted">Deleted</option>
            </select>
            <select
              style={styles.select}
              value={emergencyFilter}
              onChange={(e) => setEmergencyFilter(e.target.value as EmergencyFilter)}
            >
              <option value="all">All Records</option>
              <option value="emergency">Emergency Only</option>
              <option value="normal">Non-Emergency</option>
            </select>
            {hasActiveFilters && (
              <button style={styles.clearBtn} onClick={clearFilters}>
                Clear
              </button>
            )}
          </div>
        </div>
      )}

      {loading && <p style={styles.muted}>Loading records...</p>}
      {error && <p style={styles.error}>{error}</p>}

      {!loading && !error && records.length === 0 && (
        <p style={styles.muted}>No records found. Upload your first health record above.</p>
      )}

      {!loading && !error && records.length > 0 && filteredRecords.length === 0 && (
        <p style={styles.muted}>No records match your filters.</p>
      )}

      {filteredRecords.map((r) => (
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
    padding: "var(--space-md)",
    borderRadius: "var(--radius-lg)",
    border: "1px solid var(--color-border)",
    background: "var(--color-bg-secondary)",
  },
  headerRow: {
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "var(--space-sm)",
    marginBottom: "var(--space-md)",
  },
  heading: {
    margin: 0,
    fontSize: "var(--font-lg)",
    fontWeight: 600,
  },
  count: {
    fontSize: "var(--font-sm)",
    color: "var(--color-text-muted)",
  },
  filters: {
    marginBottom: "var(--space-md)",
  },
  searchInput: {
    width: "100%",
    padding: "var(--space-sm)",
    marginBottom: "var(--space-sm)",
    borderRadius: "var(--radius-md)",
    border: "1px solid var(--color-border)",
    fontSize: "var(--font-base)",
    minHeight: "var(--touch-target)",
  },
  filterRow: {
    display: "flex",
    gap: "var(--space-sm)",
    flexWrap: "wrap",
  },
  select: {
    padding: "var(--space-sm)",
    borderRadius: "var(--radius-md)",
    border: "1px solid var(--color-border)",
    fontSize: "var(--font-sm)",
    background: "var(--color-bg)",
    cursor: "pointer",
    minHeight: "var(--touch-target)",
    flex: "1 1 auto",
    minWidth: "100px",
  },
  clearBtn: {
    padding: "var(--space-sm) var(--space-md)",
    borderRadius: "var(--radius-md)",
    border: "1px solid var(--color-error)",
    fontSize: "var(--font-sm)",
    background: "var(--color-bg)",
    color: "var(--color-error)",
    cursor: "pointer",
    minHeight: "var(--touch-target)",
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
  record: {
    padding: "var(--space-sm)",
    marginBottom: "var(--space-sm)",
    borderRadius: "var(--radius-md)",
    border: "1px solid var(--color-border)",
    background: "var(--color-bg)",
  },
  recordHeader: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: "var(--space-sm)",
    marginBottom: "var(--space-xs)",
  },
  recordId: {
    fontWeight: 600,
    fontSize: "var(--font-base)",
    fontFamily: "monospace",
  },
  badge: {
    padding: "var(--space-xs) var(--space-sm)",
    borderRadius: "var(--radius-sm)",
    fontSize: "var(--font-xs)",
    fontWeight: 500,
    background: "var(--color-info-bg)",
    color: "var(--color-info)",
    whiteSpace: "nowrap",
  },
  recordMeta: {
    display: "flex",
    flexDirection: "column",
    gap: "var(--space-xs)",
    fontSize: "var(--font-sm)",
    color: "var(--color-text-light)",
    fontFamily: "monospace",
    wordBreak: "break-all",
  },
};
