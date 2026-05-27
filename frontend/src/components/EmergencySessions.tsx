import React, { useEffect, useState, useMemo } from "react";
import type { JsonRpcSigner, BrowserProvider } from "ethers";
import {
  useEmergencyAccess,
  SESSION_STATUS_LABELS,
  TRIGGER_TYPE_LABELS,
  type EmergencySession,
} from "../hooks/useEmergencyAccess.js";
import { fromHex } from "../utils/encryption.js";
import { getRecordManagerContract, getEmergencyAccessContract } from "../services/contracts.js";
import { RecordViewer, type RecordViewerRecord } from "./RecordViewer.js";

interface Props {
  account: string;
  provider: BrowserProvider;
  signer: JsonRpcSigner;
  role: "patient" | "doctor";
  refreshKey?: number;
}

type StatusFilter = "all" | "active" | "pending" | "consumed" | "ended";
type TriggerFilter = "all" | "trusted" | "custodian";

export function EmergencySessions({ account, provider, signer, role, refreshKey }: Props) {
  const {
    mySessions,
    loading,
    error,
    loadSessions,
    revokeSession,
    consumeEmergencyAccess,
  } = useEmergencyAccess(account, provider, signer);

  const [revoking, setRevoking] = useState<string | null>(null);
  const [consuming, setConsuming] = useState<string | null>(null);
  const [localError, setLocalError] = useState("");
  const [success, setSuccess] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [triggerFilter, setTriggerFilter] = useState<TriggerFilter>("all");
  const [consumedRecords, setConsumedRecords] = useState<(RecordViewerRecord & { sessionId: bigint })[]>([]);
  const [viewerRecord, setViewerRecord] = useState<(RecordViewerRecord & { sessionId: bigint }) | null>(null);

  useEffect(() => {
    loadSessions(role);
  }, [loadSessions, role, refreshKey]);

  const handleRevoke = async (sessionId: bigint) => {
    setRevoking(String(sessionId));
    setLocalError("");
    setSuccess("");

    try {
      const ok = await revokeSession(sessionId);
      if (ok) {
        setSuccess(`Session #${sessionId} revoked`);
        await loadSessions(role);
      }
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : String(err));
    } finally {
      setRevoking(null);
    }
  };

  const handleConsume = async (sessionId: bigint) => {
    setConsuming(String(sessionId));
    setLocalError("");
    setSuccess("");

    try {
      const result = await consumeEmergencyAccess(sessionId);
      if (result) {
        const recordManager = getRecordManagerContract(provider!);
        const emergencyContract = getEmergencyAccessContract(provider!);
        const session = await emergencyContract.getSession(sessionId);
        const records: (RecordViewerRecord & { sessionId: bigint })[] = [];

        // Try Custodian package first
        let isCustodianPkg = false;
        try {
          const raw = result.encryptedData;
          const clean = raw.startsWith("0x") ? raw.slice(2) : raw;
          const jsonStr = new TextDecoder().decode(fromHex("0x" + clean));
          const pkg = JSON.parse(jsonStr);

          if (pkg.type === "custodian-emergency-key-package" && pkg.records?.length > 0) {
            isCustodianPkg = true;
            for (const rec of pkg.records) {
              const record = await recordManager.getRecord(BigInt(rec.recordId));
              records.push({
                recordId: record.recordId,
                owner: record.owner,
                ipfsCID: record.ipfsCID,
                contentHash: record.contentHash,
                recordType: Number(record.recordType),
                status: Number(record.status),
                isEmergency: record.isEmergency,
                createdAt: record.createdAt,
                encryptedKey: rec.doctorWrappedKey,
                sessionId,
              });
            }
          }
        } catch { /* not a custodian package */ }

        // Trusted contact path: load emergency records + keys
        if (!isCustodianPkg) {
          const emergencyIds: bigint[] = await recordManager.getEmergencyRecords(session.patient);
          for (const id of emergencyIds) {
            try {
              const key: string = await emergencyContract.getEmergencyKey(session.patient, id);
              if (key && key !== "0x") {
                const record = await recordManager.getRecord(id);
                records.push({
                  recordId: record.recordId,
                  owner: record.owner,
                  ipfsCID: record.ipfsCID,
                  contentHash: record.contentHash,
                  recordType: Number(record.recordType),
                  status: Number(record.status),
                  isEmergency: record.isEmergency,
                  createdAt: record.createdAt,
                  encryptedKey: key,
                  sessionId,
                });
              }
            } catch { /* skip records without keys */ }
          }
        }

        setConsumedRecords(records);
        setSuccess(`Session #${sessionId} consumed. ${records.length} emergency record(s) available.`);
        await loadSessions(role);
      }
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : String(err));
    } finally {
      setConsuming(null);
    }
  };

  const formatDate = (ts: bigint) => {
    if (ts === 0n) return "—";
    return new Date(Number(ts) * 1000).toLocaleString();
  };

  const formatAddress = (addr: string) =>
    `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  const isExpired = (session: EmergencySession) => {
    if (session.expiresAt === 0n) return false;
    return Date.now() > Number(session.expiresAt) * 1000;
  };

  const canRevoke = (session: EmergencySession) => {
    return (
      role === "patient" &&
      session.status !== 3 &&
      session.status !== 4 &&
      !isExpired(session)
    );
  };

  const canConsume = (session: EmergencySession) => {
    return (
      role === "doctor" &&
      session.status === 1 &&
      !isExpired(session)
    );
  };

  const getStatusStyle = (status: number, session: EmergencySession) => {
    if (isExpired(session) && status !== 3 && status !== 4) {
      return { background: "#fff3e0", color: "#e65100" };
    }

    switch (status) {
      case 0: return { background: "#fff3e0", color: "#e65100" };
      case 1: return { background: "#e8f5e9", color: "#2e7d32" };
      case 2: return { background: "#e3f2fd", color: "#1565c0" };
      case 3: return { background: "#fce4ec", color: "#c62828" };
      case 4: return { background: "#f5f5f5", color: "#666" };
      default: return { background: "#f5f5f5", color: "#666" };
    }
  };

  const filteredSessions = useMemo(() => {
    return mySessions.filter((s) => {
      const expired = isExpired(s);

      if (statusFilter === "active" && (s.status !== 1 || expired)) return false;
      if (statusFilter === "pending" && s.status !== 0) return false;
      if (statusFilter === "consumed" && s.status !== 2) return false;
      if (statusFilter === "ended" && s.status !== 3 && s.status !== 4 && !expired) return false;

      if (triggerFilter === "trusted" && s.triggerType !== 0) return false;
      if (triggerFilter === "custodian" && s.triggerType !== 1) return false;

      return true;
    });
  }, [mySessions, statusFilter, triggerFilter]);

  const activeSessions = filteredSessions.filter(
    (s) => (s.status === 0 || s.status === 1 || s.status === 2) && !isExpired(s)
  );
  const pastSessions = filteredSessions.filter(
    (s) => s.status === 3 || s.status === 4 || isExpired(s)
  );

  const hasActiveFilters = statusFilter !== "all" || triggerFilter !== "all";

  return (
    <div style={styles.card}>
      <div style={styles.headerRow}>
        <h2 style={styles.heading}>Emergency Sessions</h2>
        <span style={styles.count}>
          {filteredSessions.length} of {mySessions.length}
        </span>
      </div>
      <p style={styles.description}>
        {role === "patient"
          ? "View and manage emergency access sessions for your records."
          : "View your emergency access sessions with patients."}
      </p>

      {mySessions.length > 0 && (
        <div style={styles.filterRow}>
          <select
            style={styles.select}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          >
            <option value="all">All Status</option>
            <option value="pending">Pending</option>
            <option value="active">Active</option>
            <option value="consumed">Consumed</option>
            <option value="ended">Expired/Revoked</option>
          </select>
          <select
            style={styles.select}
            value={triggerFilter}
            onChange={(e) => setTriggerFilter(e.target.value as TriggerFilter)}
          >
            <option value="all">All Types</option>
            <option value="trusted">Trusted Contact</option>
            <option value="custodian">Custodian Registry</option>
          </select>
          {hasActiveFilters && (
            <button
              style={styles.clearBtn}
              onClick={() => {
                setStatusFilter("all");
                setTriggerFilter("all");
              }}
            >
              Clear
            </button>
          )}
        </div>
      )}

      {loading && <p style={styles.muted}>Loading sessions...</p>}
      {error && <p style={styles.error}>{error}</p>}
      {localError && <p style={styles.error}>{localError}</p>}
      {success && <p style={styles.success}>{success}</p>}

      {consumedRecords.length > 0 && (
        <div style={styles.section}>
          <h3 style={styles.subheading}>Emergency Records Available</h3>
          {consumedRecords.map((rec) => (
            <div key={String(rec.recordId)} style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)", padding: "var(--space-sm)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", marginBottom: "var(--space-xs)" }}>
              <span style={{ fontFamily: "monospace", fontWeight: 600 }}>#{String(rec.recordId)}</span>
              <button
                style={styles.consumeBtn}
                onClick={() => setViewerRecord(rec)}
              >
                View Record
              </button>
            </div>
          ))}
        </div>
      )}

      {viewerRecord && (
        <RecordViewer
          account={account}
          record={viewerRecord}
          mode="emergency"
          onClose={() => setViewerRecord(null)}
          onAccessLogged={async () => {
            const emergencyContract = getEmergencyAccessContract(signer);
            const tx = await emergencyContract.logEmergencyRecordAccess(viewerRecord.sessionId, viewerRecord.recordId);
            await tx.wait();
          }}
        />
      )}

      {activeSessions.length > 0 && (
        <div style={styles.section}>
          <h3 style={styles.subheading}>Active Sessions ({activeSessions.length})</h3>
          {activeSessions.map((session) => (
            <div key={String(session.sessionId)} style={styles.sessionCard}>
              <div style={styles.sessionHeader}>
                <span style={styles.sessionId}>Session #{String(session.sessionId)}</span>
                <div style={styles.badges}>
                  <span style={{ ...styles.badge, ...getStatusStyle(session.status, session) }}>
                    {isExpired(session) ? "Expired" : SESSION_STATUS_LABELS[session.status]}
                  </span>
                  <span style={styles.triggerBadge}>
                    {TRIGGER_TYPE_LABELS[session.triggerType]}
                  </span>
                </div>
              </div>

              <div style={styles.sessionDetails}>
                <div style={styles.detailRow}>
                  <span>{role === "patient" ? "Doctor:" : "Patient:"}</span>
                  <span style={styles.mono}>
                    {formatAddress(role === "patient" ? session.doctor : session.patient)}
                  </span>
                </div>
                <div style={styles.detailRow}>
                  <span>Triggered:</span>
                  <span>{formatDate(session.triggeredAt)}</span>
                </div>
                {session.activatedAt > 0n && (
                  <div style={styles.detailRow}>
                    <span>Activated:</span>
                    <span>{formatDate(session.activatedAt)}</span>
                  </div>
                )}
                {session.expiresAt > 0n && (
                  <div style={styles.detailRow}>
                    <span>Expires:</span>
                    <span>{formatDate(session.expiresAt)}</span>
                  </div>
                )}
                {session.recordsAccessed > 0n && (
                  <div style={styles.detailRow}>
                    <span>Records Accessed:</span>
                    <span>{String(session.recordsAccessed)}</span>
                  </div>
                )}
              </div>

              <div style={styles.sessionActions}>
                {canRevoke(session) && (
                  <button
                    style={styles.revokeBtn}
                    onClick={() => handleRevoke(session.sessionId)}
                    disabled={revoking === String(session.sessionId)}
                  >
                    {revoking === String(session.sessionId) ? "Revoking..." : "Revoke"}
                  </button>
                )}
                {canConsume(session) && (
                  <button
                    style={styles.consumeBtn}
                    onClick={() => handleConsume(session.sessionId)}
                    disabled={consuming === String(session.sessionId)}
                  >
                    {consuming === String(session.sessionId) ? "Opening..." : "Open emergency session"}
                  </button>
                )}
                {session.status === 0 && role === "doctor" && (
                  <span style={styles.pendingNote}>
                    Awaiting Custodian validation...
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && activeSessions.length === 0 && (
        <p style={styles.muted}>No active emergency sessions.</p>
      )}

      {pastSessions.length > 0 && (
        <div style={styles.section}>
          <h3 style={styles.subheading}>Past Sessions ({pastSessions.length})</h3>
          {pastSessions.slice(0, 5).map((session) => (
            <div key={String(session.sessionId)} style={styles.pastSession}>
              <div style={styles.pastHeader}>
                <span>#{String(session.sessionId)}</span>
                <span style={{ ...styles.smallBadge, ...getStatusStyle(session.status, session) }}>
                  {isExpired(session) && session.status !== 3 && session.status !== 4
                    ? "Expired"
                    : SESSION_STATUS_LABELS[session.status]}
                </span>
                <span style={styles.pastMeta}>
                  {formatAddress(role === "patient" ? session.doctor : session.patient)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={styles.refreshRow}>
        <button
          style={styles.refreshBtn}
          onClick={() => loadSessions(role)}
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
  headerRow: {
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "var(--space-sm)",
  },
  heading: {
    margin: "0 0 var(--space-sm)",
    fontSize: "var(--font-lg)",
    fontWeight: 600,
  },
  count: {
    fontSize: "var(--font-sm)",
    color: "var(--color-text-muted)",
  },
  description: {
    margin: "0 0 var(--space-md)",
    fontSize: "var(--font-sm)",
    color: "var(--color-text-muted)",
  },
  filterRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: "var(--space-sm)",
    marginBottom: "var(--space-md)",
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
  section: {
    marginBottom: "var(--space-lg)",
  },
  subheading: {
    margin: "0 0 var(--space-sm)",
    fontSize: "var(--font-base)",
    fontWeight: 600,
    color: "var(--color-text-muted)",
  },
  sessionCard: {
    padding: "var(--space-sm)",
    marginBottom: "var(--space-sm)",
    background: "var(--color-bg)",
    borderRadius: "var(--radius-md)",
    border: "1px solid var(--color-border)",
  },
  sessionHeader: {
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "var(--space-sm)",
    marginBottom: "var(--space-sm)",
  },
  sessionId: {
    fontWeight: 600,
    fontSize: "var(--font-base)",
    fontFamily: "monospace",
  },
  badges: {
    display: "flex",
    flexWrap: "wrap",
    gap: "var(--space-xs)",
  },
  badge: {
    padding: "var(--space-xs) var(--space-sm)",
    borderRadius: "var(--radius-sm)",
    fontSize: "var(--font-xs)",
    fontWeight: 500,
    whiteSpace: "nowrap",
  },
  triggerBadge: {
    padding: "var(--space-xs) var(--space-sm)",
    borderRadius: "var(--radius-sm)",
    fontSize: "var(--font-xs)",
    fontWeight: 500,
    background: "var(--color-bg-secondary)",
    color: "var(--color-text-muted)",
    whiteSpace: "nowrap",
  },
  sessionDetails: {
    fontSize: "var(--font-sm)",
    marginBottom: "var(--space-sm)",
  },
  detailRow: {
    display: "flex",
    flexDirection: "column",
    gap: "var(--space-xs)",
    padding: "var(--space-xs) 0",
    borderBottom: "1px solid var(--color-border)",
  },
  mono: {
    fontFamily: "monospace",
    fontSize: "var(--font-sm)",
    wordBreak: "break-all",
  },
  sessionActions: {
    display: "flex",
    flexWrap: "wrap",
    gap: "var(--space-sm)",
    alignItems: "center",
    marginTop: "var(--space-sm)",
  },
  revokeBtn: {
    padding: "var(--space-sm) var(--space-md)",
    border: "1px solid var(--color-error)",
    borderRadius: "var(--radius-md)",
    background: "var(--color-bg)",
    color: "var(--color-error)",
    cursor: "pointer",
    fontSize: "var(--font-sm)",
    fontWeight: 500,
    minHeight: "var(--touch-target)",
    flex: "1 1 auto",
  },
  consumeBtn: {
    padding: "var(--space-sm) var(--space-md)",
    border: "none",
    borderRadius: "var(--radius-md)",
    background: "var(--color-success)",
    color: "#fff",
    cursor: "pointer",
    fontSize: "var(--font-sm)",
    fontWeight: 500,
    minHeight: "var(--touch-target)",
    flex: "1 1 auto",
  },
  pendingNote: {
    fontSize: "var(--font-sm)",
    color: "var(--color-warning)",
    fontStyle: "italic",
  },
  pastSession: {
    padding: "var(--space-sm)",
    marginBottom: "var(--space-sm)",
    background: "var(--color-bg-secondary)",
    borderRadius: "var(--radius-md)",
    border: "1px solid var(--color-border)",
  },
  pastHeader: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: "var(--space-sm)",
    fontSize: "var(--font-sm)",
  },
  smallBadge: {
    padding: "var(--space-xs) var(--space-sm)",
    borderRadius: "var(--radius-sm)",
    fontSize: "var(--font-xs)",
    fontWeight: 500,
    whiteSpace: "nowrap",
  },
  pastMeta: {
    color: "var(--color-text-light)",
    fontFamily: "monospace",
    fontSize: "var(--font-sm)",
    wordBreak: "break-all",
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
  error: {
    color: "var(--color-error)",
    fontSize: "var(--font-sm)",
    padding: "var(--space-sm)",
    background: "var(--color-error-bg)",
    borderRadius: "var(--radius-md)",
    marginBottom: "var(--space-sm)",
    wordBreak: "break-word",
  },
  success: {
    color: "var(--color-success)",
    fontSize: "var(--font-sm)",
    padding: "var(--space-sm)",
    background: "var(--color-success-bg)",
    borderRadius: "var(--radius-md)",
    marginBottom: "var(--space-sm)",
  },
};
