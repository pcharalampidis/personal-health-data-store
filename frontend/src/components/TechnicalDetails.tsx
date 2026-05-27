import React, { useState } from "react";

interface Props {
  items: { label: string; value: string }[];
}

export function TechnicalDetails({ items }: Props) {
  const [open, setOpen] = useState(false);

  if (items.length === 0) return null;

  return (
    <div style={styles.section}>
      <button style={styles.toggle} onClick={() => setOpen(!open)}>
        {open ? "▾ Technical details" : "▸ Technical details"}
      </button>
      {open && (
        <div style={styles.content}>
          {items.map((item, i) => (
            <div key={i} style={styles.row}>
              <span style={styles.label}>{item.label}</span>
              <code style={styles.value}>{item.value}</code>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  section: { marginTop: 12, borderTop: "1px solid var(--color-border, #e2e8f0)", paddingTop: 8 },
  toggle: { background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "var(--color-text-muted, #64748b)", padding: 0 },
  content: { marginTop: 8, fontSize: 12 },
  row: { display: "flex", flexDirection: "column", gap: 2, padding: "4px 0", borderBottom: "1px solid var(--color-border, #e2e8f0)", wordBreak: "break-all" },
  label: { fontSize: 11, color: "var(--color-text-muted, #64748b)", fontWeight: 500 },
  value: { fontSize: 12, fontFamily: "monospace" },
};
