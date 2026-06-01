import React, { useState, useMemo } from "react";
import type { BrowserProvider } from "ethers";
import { useRecordAuditTrail } from "../hooks/useRecordAuditTrail.js";
import type { AuditEntry, AuditCategory } from "../types/audit.js";

interface Props {
  recordId: bigint;
  patientAddress: string;
  provider: BrowserProvider;
  onClose: () => void;
}

type FilterCategory = "all" | AuditCategory;

const CATEGORY_LABELS: Record<FilterCategory, string> = {
  all: "All Events",
  record: "Lifecycle",
  request: "Requests",
  permission: "Permissions",
  access: "Views",
  emergency: "Emergency",
};

const SEVERITY_COLORS = {
  success: { bg: "#e8f5e9", text: "#2e7d32", border: "#c8e6c9" },
  info: { bg: "#e3f2fd", text: "#1565c0", border: "#bbdefb" },
  warning: { bg: "#fff3e0", text: "#e65100", border: "#ffe0b2" },
  error: { bg: "#ffebee", text: "#c62828", border: "#ffcdd2" },
};

export function RecordAuditTrail({ recordId, patientAddress, provider, onClose }: Props) {
  const { entries, loading, error, refresh } = useRecordAuditTrail(
    provider,
    recordId,
    patientAddress
  );

  const [activeFilter, setActiveFilter] = useState<FilterCategory>("all");
  const [copiedTx, setCopiedTx] = useState<string | null>(null);

  const filteredEntries = useMemo(() => {
    if (activeFilter === "all") return entries;
    return entries.filter((e) => e.category === activeFilter);
  }, [entries, activeFilter]);

  const handleCopyTx = (txHash: string) => {
    navigator.clipboard.writeText(txHash);
    setCopiedTx(txHash);
    setTimeout(() => setCopiedTx(null), 2000);
  };

  const formatDate = (ts: bigint) => {
    return new Date(Number(ts) * 1000).toLocaleString();
  };

  const formatHash = (hash: string) => {
    return `${hash.slice(0, 6)}...${hash.slice(-4)}`;
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={styles.header}>
          <div>
            <h3 style={styles.title}>Audit History</h3>
            <span style={styles.subtitle}>Audit logs for Record #{String(recordId)}</span>
          </div>
          <button style={styles.closeBtn} onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        {/* Filters Bar */}
        <div style={styles.filtersBar}>
          {Object.entries(CATEGORY_LABELS).map(([cat, label]) => (
            <button
              key={cat}
              onClick={() => setActiveFilter(cat as FilterCategory)}
              style={{
                ...styles.filterTab,
                ...(activeFilter === cat ? styles.filterTabActive : {}),
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Content Body */}
        <div style={styles.body}>
          {loading && (
            <div style={styles.loadingContainer}>
              <div style={styles.spinner} />
              <p style={styles.mutedText}>Fetching historical contract events...</p>
            </div>
          )}

          {error && <p style={styles.errorText}>{error}</p>}

          {!loading && !error && filteredEntries.length === 0 && (
            <div style={styles.emptyState}>
              <p style={styles.emptyText}>No events found in this category.</p>
            </div>
          )}

          {!loading && !error && filteredEntries.length > 0 && (
            <div style={styles.timeline}>
              {filteredEntries.map((entry, idx) => {
                const colors = SEVERITY_COLORS[entry.severity] || SEVERITY_COLORS.info;
                return (
                  <div key={entry.id} style={styles.timelineItem}>
                    {/* Left Timeline Line & Dot */}
                    <div style={styles.timelineIndicators}>
                      <div
                        style={{
                          ...styles.timelineDot,
                          backgroundColor: colors.text,
                          boxShadow: `0 0 0 4px ${colors.bg}`,
                        }}
                      />
                      {idx !== filteredEntries.length - 1 && <div style={styles.timelineLine} />}
                    </div>

                    {/* Event Card Content */}
                    <div
                      style={{
                        ...styles.eventCard,
                        backgroundColor: colors.bg,
                        borderColor: colors.border,
                      }}
                    >
                      <div style={styles.eventHeader}>
                        <span style={{ ...styles.eventTitle, color: colors.text }}>
                          {entry.title}
                        </span>
                        <span style={styles.timestamp}>{formatDate(entry.timestamp)}</span>
                      </div>

                      <p style={styles.eventDescription}>{entry.description}</p>

                      <div style={styles.metaInfo}>
                        <div>
                          <strong>Actor:</strong>{" "}
                          <span style={styles.actorName} title={entry.actor}>
                            {entry.actorLabel}
                          </span>
                        </div>
                        {entry.counterparty && (
                          <div>
                            <strong>Target:</strong>{" "}
                            <span style={styles.actorName} title={entry.counterparty}>
                              {entry.counterpartyLabel}
                            </span>
                          </div>
                        )}
                      </div>

                      <div style={styles.txRow}>
                        <span style={styles.txLabel}>Transaction:</span>
                        <code style={styles.txHash} title={entry.transactionHash}>
                          {formatHash(entry.transactionHash)}
                        </code>
                        <button
                          type="button"
                          onClick={() => handleCopyTx(entry.transactionHash)}
                          style={styles.copyBtn}
                        >
                          {copiedTx === entry.transactionHash ? "Copied" : "Copy"}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div style={styles.footer}>
          <button style={styles.refreshBtn} onClick={refresh} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh"}
          </button>
          <button style={styles.closeActionBtn} onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: "rgba(0, 0, 0, 0.6)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "var(--space-md, 16px)",
    zIndex: 1000,
  },
  modal: {
    background: "var(--color-bg, #ffffff)",
    borderRadius: "var(--radius-lg, 16px)",
    width: "100%",
    maxWidth: "600px",
    maxHeight: "90vh",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    boxShadow: "var(--shadow-md)",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    padding: "var(--space-md, 16px) var(--space-lg, 24px)",
    borderBottom: "1px solid var(--color-border, #e2e8f0)",
  },
  title: {
    margin: 0,
    fontSize: "var(--font-lg, 18px)",
    fontWeight: 600,
    color: "var(--color-text, #0f172a)",
  },
  subtitle: {
    fontSize: "var(--font-sm, 13px)",
    color: "var(--color-text-muted, #64748b)",
    marginTop: 2,
    display: "block",
  },
  closeBtn: {
    background: "none",
    border: "none",
    fontSize: 24,
    cursor: "pointer",
    color: "var(--color-text-light, #94a3b8)",
    padding: 4,
    minWidth: 32,
    minHeight: 32,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  filtersBar: {
    display: "flex",
    gap: "var(--space-xs, 4px)",
    overflowX: "auto",
    padding: "var(--space-sm, 8px) var(--space-lg, 24px)",
    background: "var(--color-bg-secondary, #f8fafc)",
    borderBottom: "1px solid var(--color-border, #e2e8f0)",
  },
  filterTab: {
    padding: "6px 12px",
    borderRadius: "var(--radius-pill, 9999px)",
    background: "transparent",
    border: "1px solid transparent",
    fontSize: "var(--font-xs, 12px)",
    fontWeight: 500,
    color: "var(--color-text-muted, #64748b)",
    cursor: "pointer",
    whiteSpace: "nowrap",
    minHeight: "auto",
  },
  filterTabActive: {
    background: "var(--color-primary, #2563eb)",
    color: "#ffffff",
    borderColor: "var(--color-primary, #2563eb)",
  },
  body: {
    padding: "var(--space-lg, 24px)",
    overflowY: "auto",
    flex: 1,
    display: "flex",
    flexDirection: "column",
  },
  loadingContainer: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "var(--space-xl, 32px) 0",
    flex: 1,
  },
  spinner: {
    width: 32,
    height: 32,
    border: "3px solid var(--color-border, #e2e8f0)",
    borderTopColor: "var(--color-primary, #2563eb)",
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
    marginBottom: "var(--space-sm, 8px)",
  },
  mutedText: {
    fontSize: "var(--font-sm, 13px)",
    color: "var(--color-text-muted, #64748b)",
  },
  errorText: {
    color: "var(--color-error, #dc2626)",
    fontSize: "var(--font-sm, 13px)",
    padding: "var(--space-sm, 8px)",
    background: "var(--color-error-bg, #fef2f2)",
    borderRadius: "var(--radius-md, 10px)",
    marginBottom: "var(--space-md, 16px)",
  },
  emptyState: {
    textAlign: "center",
    padding: "var(--space-xl, 32px) 0",
    color: "var(--color-text-muted, #64748b)",
  },
  emptyText: {
    fontSize: "var(--font-base, 14px)",
  },
  timeline: {
    display: "flex",
    flexDirection: "column",
  },
  timelineItem: {
    display: "flex",
    gap: "var(--space-md, 16px)",
    position: "relative",
  },
  timelineIndicators: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    width: "16px",
    flexShrink: 0,
  },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: "50%",
    marginTop: "16px",
    zIndex: 1,
  },
  timelineLine: {
    width: 2,
    backgroundColor: "var(--color-border, #e2e8f0)",
    position: "absolute",
    top: "26px",
    bottom: "-16px",
    left: "7px",
  },
  eventCard: {
    flex: 1,
    borderRadius: "var(--radius-md, 10px)",
    border: "1px solid",
    padding: "var(--space-sm, 12px) var(--space-md, 16px)",
    marginBottom: "var(--space-md, 16px)",
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  eventHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "var(--space-xs, 4px)",
  },
  eventTitle: {
    fontWeight: 600,
    fontSize: "var(--font-base, 14px)",
  },
  timestamp: {
    fontSize: "var(--font-xs, 12px)",
    color: "var(--color-text-muted, #64748b)",
  },
  eventDescription: {
    margin: 0,
    fontSize: "var(--font-sm, 13px)",
    color: "var(--color-text, #0f172a)",
    lineHeight: 1.4,
  },
  metaInfo: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
    fontSize: "var(--font-xs, 12px)",
    color: "var(--color-text-muted, #64748b)",
    borderTop: "1px dashed rgba(0, 0, 0, 0.08)",
    paddingTop: "var(--space-xs, 4px)",
    marginTop: "var(--space-xs, 4px)",
  },
  actorName: {
    fontFamily: "monospace",
    color: "var(--color-text, #0f172a)",
    fontWeight: 500,
  },
  txRow: {
    display: "flex",
    alignItems: "center",
    gap: "var(--space-xs, 4px)",
    fontSize: "var(--font-xs, 12px)",
    color: "var(--color-text-light, #94a3b8)",
    marginTop: "2px",
  },
  txLabel: {
    fontSize: "var(--font-xs, 11px)",
  },
  txHash: {
    fontFamily: "monospace",
    fontSize: "var(--font-xs, 11px)",
    background: "rgba(0, 0, 0, 0.04)",
    padding: "2px 4px",
    borderRadius: "var(--radius-sm, 4px)",
    color: "var(--color-text-muted, #64748b)",
  },
  copyBtn: {
    background: "none",
    border: "none",
    color: "var(--color-primary, #2563eb)",
    cursor: "pointer",
    fontSize: "11px",
    padding: "2px 4px",
    minHeight: "auto",
    fontWeight: 500,
  },
  footer: {
    display: "flex",
    justifyContent: "flex-end",
    gap: "var(--space-sm, 8px)",
    padding: "var(--space-md, 16px) var(--space-lg, 24px)",
    borderTop: "1px solid var(--color-border, #e2e8f0)",
  },
  refreshBtn: {
    padding: "var(--space-sm) var(--space-md)",
    border: "1px solid var(--color-border)",
    borderRadius: "var(--radius-md)",
    background: "var(--color-bg)",
    color: "var(--color-text)",
    cursor: "pointer",
    fontSize: "var(--font-sm)",
    fontWeight: 500,
    minHeight: "var(--touch-target)",
  },
  closeActionBtn: {
    padding: "var(--space-sm) var(--space-md)",
    border: "none",
    borderRadius: "var(--radius-md)",
    background: "var(--color-primary)",
    color: "#ffffff",
    cursor: "pointer",
    fontSize: "var(--font-sm)",
    fontWeight: 500,
    minHeight: "var(--touch-target)",
  },
};
