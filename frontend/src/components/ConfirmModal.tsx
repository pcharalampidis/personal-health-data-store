import React from "react";

interface Props {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmStyle?: "danger" | "primary";
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  confirmStyle = "danger",
  onConfirm,
  onCancel,
}: Props) {
  return (
    <div style={styles.overlay} onClick={onCancel}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h3 style={styles.title}>{title}</h3>
        <p style={styles.message}>{message}</p>
        <div style={styles.actions}>
          <button style={styles.cancelBtn} onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            style={confirmStyle === "danger" ? styles.dangerBtn : styles.primaryBtn}
            onClick={onConfirm}
          >
            {confirmLabel}
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
    background: "rgba(0, 0, 0, 0.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "var(--space-md)",
    zIndex: 1000,
  },
  modal: {
    background: "var(--color-bg)",
    borderRadius: "var(--radius-lg)",
    padding: "var(--space-lg)",
    maxWidth: "400px",
    width: "100%",
    boxShadow: "0 4px 20px rgba(0, 0, 0, 0.15)",
    maxHeight: "90vh",
    overflow: "auto",
  },
  title: {
    margin: "0 0 var(--space-sm)",
    fontSize: "var(--font-lg)",
    fontWeight: 600,
    color: "var(--color-text)",
  },
  message: {
    margin: "0 0 var(--space-lg)",
    fontSize: "var(--font-base)",
    color: "var(--color-text-muted)",
    lineHeight: 1.5,
  },
  actions: {
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    gap: "var(--space-sm)",
  },
  cancelBtn: {
    padding: "var(--space-sm) var(--space-md)",
    border: "1px solid var(--color-border)",
    borderRadius: "var(--radius-md)",
    background: "var(--color-bg)",
    color: "var(--color-text-muted)",
    cursor: "pointer",
    fontSize: "var(--font-base)",
    fontWeight: 500,
    minHeight: "var(--touch-target)",
    flex: "1 1 auto",
  },
  dangerBtn: {
    padding: "var(--space-sm) var(--space-md)",
    border: "none",
    borderRadius: "var(--radius-md)",
    background: "var(--color-error)",
    color: "#fff",
    cursor: "pointer",
    fontSize: "var(--font-base)",
    fontWeight: 500,
    minHeight: "var(--touch-target)",
    flex: "1 1 auto",
  },
  primaryBtn: {
    padding: "var(--space-sm) var(--space-md)",
    border: "none",
    borderRadius: "var(--radius-md)",
    background: "var(--color-primary)",
    color: "#fff",
    cursor: "pointer",
    fontSize: "var(--font-base)",
    fontWeight: 500,
    minHeight: "var(--touch-target)",
    flex: "1 1 auto",
  },
};
