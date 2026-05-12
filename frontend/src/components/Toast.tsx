import React, { useEffect, useState } from "react";

export type ToastType = "success" | "error" | "info" | "warning";

interface ToastProps {
  message: string;
  type: ToastType;
  duration?: number;
  onClose: () => void;
}

export function Toast({ message, type, duration = 4000, onClose }: ToastProps) {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(onClose, 300);
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onClose]);

  const bgColors: Record<ToastType, string> = {
    success: "#e8f5e9",
    error: "#fce4ec",
    info: "#e3f2fd",
    warning: "#fff3e0",
  };

  const textColors: Record<ToastType, string> = {
    success: "#2e7d32",
    error: "#c62828",
    info: "#1565c0",
    warning: "#e65100",
  };

  const icons: Record<ToastType, string> = {
    success: "✓",
    error: "✕",
    info: "ℹ",
    warning: "⚠",
  };

  return (
    <div
      style={{
        ...styles.toast,
        background: bgColors[type],
        color: textColors[type],
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? "translateY(0)" : "translateY(-10px)",
      }}
    >
      <span style={styles.icon}>{icons[type]}</span>
      <span style={styles.message}>{message}</span>
      <button style={styles.closeBtn} onClick={onClose}>
        ×
      </button>
    </div>
  );
}

interface ToastContainerProps {
  toasts: Array<{ id: string; message: string; type: ToastType }>;
  onRemove: (id: string) => void;
}

export function ToastContainer({ toasts, onRemove }: ToastContainerProps) {
  if (toasts.length === 0) return null;

  return (
    <div style={styles.container}>
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          message={toast.message}
          type={toast.type}
          onClose={() => onRemove(toast.id)}
        />
      ))}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: "fixed",
    bottom: "var(--space-md)",
    left: "var(--space-md)",
    right: "var(--space-md)",
    display: "flex",
    flexDirection: "column",
    gap: "var(--space-sm)",
    zIndex: 2000,
    pointerEvents: "none",
  },
  toast: {
    display: "flex",
    alignItems: "center",
    gap: "var(--space-sm)",
    padding: "var(--space-sm) var(--space-md)",
    borderRadius: "var(--radius-md)",
    boxShadow: "0 2px 10px rgba(0, 0, 0, 0.15)",
    transition: "opacity 0.3s, transform 0.3s",
    width: "100%",
    maxWidth: "400px",
    marginLeft: "auto",
    pointerEvents: "auto",
  },
  icon: {
    fontWeight: 700,
    fontSize: "var(--font-lg)",
    flexShrink: 0,
  },
  message: {
    flex: 1,
    fontSize: "var(--font-base)",
    wordBreak: "break-word",
  },
  closeBtn: {
    background: "none",
    border: "none",
    fontSize: "var(--font-xl)",
    cursor: "pointer",
    opacity: 0.6,
    padding: "var(--space-xs)",
    minWidth: "var(--touch-target)",
    minHeight: "var(--touch-target)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
};
