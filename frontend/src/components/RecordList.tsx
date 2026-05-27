import React, { useEffect, useState, useMemo } from "react";
import type { BrowserProvider, JsonRpcSigner } from "ethers";
import { getRecordManagerContract, getAccessControlContract, RECORD_TYPES, RECORD_MANAGER_ADDRESS } from "../services/contracts.js";
import { RecordViewer, type RecordViewerRecord } from "./RecordViewer.js";
import { ConfirmModal } from "./ConfirmModal.js";
import { friendlyErrorMessage } from "../utils/errorMessages.js";

interface RecordInfo {
  recordId: bigint;
  owner: string;
  ipfsCID: string;
  contentHash: string;
  recordType: number;
  status: number;
  isEmergency: boolean;
  createdAt: bigint;
  updatedAt: bigint;
}

interface Props {
  account: string;
  provider: BrowserProvider;
  signer?: JsonRpcSigner;
}

const STATUS_LABELS = ["Active", "Archived", "Deleted"];

type StatusFilter = "all" | "active" | "archived" | "deleted";
type EmergencyFilter = "all" | "emergency" | "normal";

export function RecordList({ account, provider, signer }: Props) {
  const [records, setRecords] = useState<RecordInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [typeFilter, setTypeFilter] = useState<number | "all">("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [emergencyFilter, setEmergencyFilter] = useState<EmergencyFilter>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [viewerRecord, setViewerRecord] = useState<RecordViewerRecord | null>(null);
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{ type: string; record: RecordInfo } | null>(null);

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
          owner: rec.owner,
          ipfsCID: rec.ipfsCID,
          contentHash: rec.contentHash,
          recordType: Number(rec.recordType),
          status: Number(rec.status),
          isEmergency: rec.isEmergency,
          createdAt: rec.createdAt,
          updatedAt: rec.updatedAt,
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

      if (statusFilter === "all" && r.status === 2) return false;
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

  const handleView = async (r: RecordInfo) => {
    setLoadingKey(String(r.recordId));
    try {
      const contract = getRecordManagerContract(provider);
      const encryptedKey: string = await contract.getEncryptedKey(r.recordId, account);
      setViewerRecord({
        recordId: r.recordId,
        owner: r.owner,
        ipfsCID: r.ipfsCID,
        contentHash: r.contentHash,
        recordType: r.recordType,
        status: r.status,
        isEmergency: r.isEmergency,
        createdAt: r.createdAt,
        encryptedKey,
      });
    } catch {
      setError("Could not load record key.");
    } finally {
      setLoadingKey(null);
    }
  };

  const executeAction = async () => {
    if (!confirmAction || !signer) return;
    setActionPending(true);
    try {
      const contract = getRecordManagerContract(signer);
      let tx;
      switch (confirmAction.type) {
        case "archive":
          tx = await contract.archiveRecord(confirmAction.record.recordId);
          break;
        case "restore":
          tx = await contract.restoreRecord(confirmAction.record.recordId);
          break;
        case "emergency-on":
          tx = await contract.setEmergencyFlag(confirmAction.record.recordId, true);
          break;
        case "emergency-off":
          tx = await contract.setEmergencyFlag(confirmAction.record.recordId, false);
          break;
        case "delete": {
          const cid = confirmAction.record.ipfsCID;
          // 1. Revoke all doctor access (best-effort)
          try {
            const ac = getAccessControlContract(signer);
            const revokeTx = await ac.revokeAllAccess(confirmAction.record.recordId);
            await revokeTx.wait();
          } catch { /* may fail if no permissions exist */ }
          // 2. Delete on-chain (clears CID + owner key)
          tx = await contract.deleteRecord(confirmAction.record.recordId);
          await tx.wait();
          // 3. Unpin from IPFS (best-effort, after blockchain confirmation)
          try {
            await fetch(`/api/records/unpin/${cid}`, { method: "DELETE" });
          } catch { /* unpin failure is non-blocking */ }
          tx = null; // already waited
          break;
        }
        default:
          return;
      }
      if (tx) await tx.wait();
      setConfirmAction(null);
      loadRecords();
    } catch (err) {
      setError(friendlyErrorMessage(err));
      setConfirmAction(null);
    } finally {
      setActionPending(false);
    }
  };

  const getConfirmProps = () => {
    if (!confirmAction) return null;
    switch (confirmAction.type) {
      case "archive":
        return { title: "Archive this record?", message: "This makes the record inactive in the app. It does not erase blockchain history or encrypted IPFS copies.", confirmLabel: "Archive" };
      case "restore":
        return { title: "Restore this record?", message: "This makes the record active again. If old permissions were not revoked, access rules may apply again.", confirmLabel: "Restore", confirmStyle: "primary" as const };
      case "emergency-on":
        return { title: "Mark as emergency record?", message: "Emergency records can be opened during approved emergency sessions. Only mark records useful in urgent care.", confirmLabel: "Mark emergency", confirmStyle: "primary" as const };
      case "emergency-off":
        return { title: "Remove emergency flag?", message: "This record will no longer be available during emergency sessions.", confirmLabel: "Remove flag" };
      case "delete":
        return { title: "Remove this record from your vault?", message: "This will revoke all active doctor access, remove the app reference, and unpin the encrypted file. Blockchain history cannot be erased, and encrypted copies may still exist if pinned elsewhere.", confirmLabel: "Remove from vault" };
      default:
        return null;
    }
  };

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
        <div style={styles.emptyState}>
          <p style={styles.emptyTitle}>No health records yet</p>
          <p style={styles.emptyHint}>Upload your first encrypted health record. Files are encrypted in your browser before being stored.</p>
        </div>
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
            <span>Stored securely</span>
            <span>Created: {formatDate(r.createdAt)}</span>
          </div>
          {r.status === 0 && (
            <div style={styles.recordActions}>
              <button
                style={styles.viewBtn}
                onClick={() => handleView(r)}
                disabled={loadingKey === String(r.recordId)}
              >
                {loadingKey === String(r.recordId) ? "Loading…" : "View"}
              </button>
              {signer && (
                <>
                  <button style={styles.actionBtn} onClick={() => setConfirmAction({ type: r.isEmergency ? "emergency-off" : "emergency-on", record: r })}>
                    {r.isEmergency ? "Remove emergency" : "Mark emergency"}
                  </button>
                  <button style={styles.archiveBtn} onClick={() => setConfirmAction({ type: "archive", record: r })}>
                    Archive
                  </button>
                  <button style={styles.deleteBtn} onClick={() => setConfirmAction({ type: "delete", record: r })}>
                    Remove from vault
                  </button>
                </>
              )}
            </div>
          )}
          {r.status === 1 && signer && (
            <div style={styles.recordActions}>
              <button style={styles.viewBtn} onClick={() => handleView(r)} disabled={loadingKey === String(r.recordId)}>
                {loadingKey === String(r.recordId) ? "Loading…" : "View"}
              </button>
              <button style={styles.actionBtn} onClick={() => setConfirmAction({ type: "restore", record: r })}>
                Restore
              </button>
            </div>
          )}
        </div>
      ))}

      {viewerRecord && (
        <RecordViewer
          account={account}
          record={viewerRecord}
          mode="owner"
          onClose={() => setViewerRecord(null)}
        />
      )}

      {confirmAction && getConfirmProps() && (
        <ConfirmModal
          {...getConfirmProps()!}
          onConfirm={executeAction}
          onCancel={() => setConfirmAction(null)}
        />
      )}
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
  emptyState: {
    textAlign: "center",
    padding: "var(--space-xl) var(--space-md)",
    background: "var(--color-surface-muted, var(--color-bg-secondary))",
    borderRadius: "var(--radius-lg)",
    border: "1px dashed var(--color-border)",
  },
  emptyTitle: {
    fontSize: "var(--font-lg)",
    fontWeight: 600,
    color: "var(--color-text)",
    margin: "0 0 var(--space-xs)",
  },
  emptyHint: {
    fontSize: "var(--font-sm)",
    color: "var(--color-text-muted)",
    margin: 0,
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
  recordActions: {
    marginTop: "var(--space-sm)",
    display: "flex",
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
  actionBtn: {
    padding: "var(--space-sm) var(--space-md)",
    border: "1px solid var(--color-border)",
    borderRadius: "var(--radius-md)",
    background: "var(--color-bg)",
    color: "var(--color-text)",
    cursor: "pointer",
    fontSize: "var(--font-sm)",
    minHeight: "var(--touch-target)",
  },
  archiveBtn: {
    padding: "var(--space-sm) var(--space-md)",
    border: "1px solid var(--color-warning, #f59e0b)",
    borderRadius: "var(--radius-md)",
    background: "var(--color-bg)",
    color: "var(--color-warning, #f59e0b)",
    cursor: "pointer",
    fontSize: "var(--font-sm)",
    minHeight: "var(--touch-target)",
  },
  deleteBtn: {
    padding: "var(--space-sm) var(--space-md)",
    border: "1px solid var(--color-error)",
    borderRadius: "var(--radius-md)",
    background: "var(--color-bg)",
    color: "var(--color-error)",
    cursor: "pointer",
    fontSize: "var(--font-sm)",
    minHeight: "var(--touch-target)",
  },
};
