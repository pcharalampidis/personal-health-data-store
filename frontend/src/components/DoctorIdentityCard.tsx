import React from "react";
import type { DoctorIdentity } from "../types/profiles.js";

interface Props {
  profile: DoctorIdentity;
  compact?: boolean;
  showWallet?: boolean;
  showVerificationNote?: boolean;
}

export function DoctorIdentityCard({
  profile,
  compact = false,
  showWallet = true,
  showVerificationNote = true,
}: Props) {
  if (compact) {
    return (
      <div style={styles.compactContainer}>
        <div style={styles.nameRow}>
          <span style={styles.displayName}>{profile.displayName}</span>
          {showVerificationNote && profile.isVerified && (
            <span style={styles.verifiedBadge}>Registered Doctor Profile</span>
          )}
        </div>
        <div style={styles.subtitle}>{profile.displaySubtitle}</div>
        {showWallet && (
          <div style={styles.wallet}>Wallet: {profile.formattedAddress}</div>
        )}
      </div>
    );
  }

  return (
    <div style={styles.expandedContainer}>
      <div style={styles.header}>
        <div style={styles.titleInfo}>
          <span style={styles.displayName}>{profile.displayName}</span>
          <span style={styles.subtitle}>{profile.displaySubtitle}</span>
        </div>
        {showVerificationNote && (
          <span
            style={{
              ...styles.statusBadge,
              background: profile.isVerified
                ? "var(--color-success-bg, #f0fdf4)"
                : "var(--color-warning-bg, #fffbeb)",
              color: profile.isVerified
                ? "var(--color-success, #16a34a)"
                : "var(--color-warning, #d97706)",
            }}
          >
            {profile.isVerified ? "Registered doctor profile" : "Unregistered wallet"}
          </span>
        )}
      </div>

      <div style={styles.detailsGrid}>
        {profile.licenseNumber && (
          <div style={styles.detailRow}>
            <span style={styles.detailLabel}>Licence:</span>
            <span style={styles.detailValue}>{profile.licenseNumber}</span>
          </div>
        )}
        {showWallet && (
          <div style={styles.detailRow}>
            <span style={styles.detailLabel}>Wallet:</span>
            <span style={{ ...styles.detailValue, fontFamily: "monospace" }}>
              {profile.address}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  compactContainer: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
  },
  nameRow: {
    display: "flex",
    alignItems: "center",
    gap: "var(--space-sm, 8px)",
  },
  displayName: {
    fontWeight: 600,
    fontSize: "var(--font-base, 14px)",
    color: "var(--color-text, #0f172a)",
  },
  subtitle: {
    fontSize: "var(--font-sm, 13px)",
    color: "var(--color-text-muted, #64748b)",
  },
  wallet: {
    fontSize: "var(--font-xs, 12px)",
    color: "var(--color-text-light, #94a3b8)",
    fontFamily: "monospace",
  },
  verifiedBadge: {
    padding: "2px 6px",
    borderRadius: "var(--radius-sm, 4px)",
    fontSize: "10px",
    fontWeight: 600,
    background: "var(--color-info-bg, #eff6ff)",
    color: "var(--color-primary, #2563eb)",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
  },
  expandedContainer: {
    padding: "var(--space-sm, 8px) var(--space-md, 16px)",
    borderRadius: "var(--radius-md, 10px)",
    border: "1px solid var(--color-border, #e2e8f0)",
    background: "var(--color-bg, #ffffff)",
    display: "flex",
    flexDirection: "column",
    gap: "var(--space-sm, 8px)",
    marginTop: "var(--space-xs, 4px)",
    marginBottom: "var(--space-xs, 4px)",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    flexWrap: "wrap",
    gap: "var(--space-xs, 4px)",
  },
  titleInfo: {
    display: "flex",
    flexDirection: "column",
  },
  statusBadge: {
    padding: "var(--space-xs, 4px) var(--space-sm, 8px)",
    borderRadius: "var(--radius-pill, 9999px)",
    fontSize: "var(--font-xs, 12px)",
    fontWeight: 500,
    whiteSpace: "nowrap",
  },
  detailsGrid: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
    fontSize: "var(--font-sm, 13px)",
    borderTop: "1px dashed var(--color-border, #e2e8f0)",
    paddingTop: "var(--space-xs, 4px)",
  },
  detailRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "var(--space-md, 16px)",
  },
  detailLabel: {
    color: "var(--color-text-muted, #64748b)",
    fontWeight: 500,
  },
  detailValue: {
    color: "var(--color-text, #0f172a)",
    wordBreak: "break-all",
    textAlign: "right",
  },
};
