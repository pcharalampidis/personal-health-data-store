import React, { useState } from "react";

export function PrivacySecurityInfo() {
  const [expanded, setExpanded] = useState<string | null>(null);

  const toggle = (id: string) => setExpanded(expanded === id ? null : id);

  return (
    <div style={styles.card}>
      <h2 style={styles.heading}>Privacy & Security</h2>
      <p style={styles.intro}>
        You control access to your health records through this app. Here is how the system protects your data.
      </p>

      <Section id="encryption" title="What is encrypted" expanded={expanded} toggle={toggle}>
        <p>Your health files are encrypted in your browser before they leave your device. The server and storage network only ever receive encrypted bytes that cannot be read without your key.</p>
        <p>Encryption uses AES-256-GCM (military-grade) with keys protected by RSA-OAEP 2048-bit wrapping.</p>
      </Section>

      <Section id="doctors" title="What doctors can see" expanded={expanded} toggle={toggle}>
        <p>Doctors can only view records you explicitly share with them. Sharing gives them a time-limited ability to unlock specific records.</p>
        <p>Every time a doctor opens a shared record, it is logged in your audit trail.</p>
      </Section>

      <Section id="blockchain" title="What the blockchain stores" expanded={expanded} toggle={toggle}>
        <p>The blockchain stores only references and permissions — never your actual health files. It records:</p>
        <ul>
          <li>Encrypted storage references (not readable content)</li>
          <li>Content integrity hashes (to verify files haven't been tampered with)</li>
          <li>Access permissions and their timestamps</li>
          <li>Protected encryption keys (only usable by authorised parties)</li>
        </ul>
      </Section>

      <Section id="removal" title="What removing a record means" expanded={expanded} toggle={toggle}>
        <p>Archiving makes a record inactive — it cannot be accessed through normal sharing. Removing from vault clears the active reference.</p>
        <p><strong>Important:</strong> Blockchain history is immutable. Removing a record from the app does not erase historical blockchain entries or encrypted copies that may exist on the storage network.</p>
      </Section>

      <Section id="revocation" title="What revocation means" expanded={expanded} toggle={toggle}>
        <p>Revoking access prevents a doctor from opening your record again through this app. Their access key is removed.</p>
        <p>However, if a doctor downloaded the file while access was active, revocation cannot erase that copy. This is a fundamental limitation of any system where files can be downloaded.</p>
      </Section>

      <Section id="emergency" title="What emergency access means" expanded={expanded} toggle={toggle}>
        <p>Emergency access allows trusted contacts or verified healthcare providers to view your emergency-marked records when you cannot provide consent.</p>
        <p>Emergency sessions are temporary (time-limited) and every record access is permanently logged for accountability.</p>
        <p>You choose which records are emergency-accessible and who your trusted contacts are.</p>
      </Section>

      <Section id="keys" title="Local browser key" expanded={expanded} toggle={toggle}>
        <p>Your private decryption key is stored in this browser's local storage. This means:</p>
        <ul>
          <li>You can only unlock records from the browser where you registered</li>
          <li>Clearing browser data will remove your key</li>
          <li>If your key is lost, records encrypted with it cannot be recovered</li>
        </ul>
        <p>This is a security trade-off for the prototype. A production system would use more robust key management.</p>
      </Section>

      <div style={styles.footer}>
        <p style={styles.footerText}>
          You control access through this app, but blockchain history and already-downloaded files cannot be erased retroactively.
        </p>
      </div>
    </div>
  );
}

function Section({ id, title, expanded, toggle, children }: {
  id: string; title: string; expanded: string | null; toggle: (id: string) => void; children: React.ReactNode;
}) {
  const isOpen = expanded === id;
  return (
    <div style={styles.section}>
      <button style={styles.sectionBtn} onClick={() => toggle(id)}>
        <span>{isOpen ? "▾" : "▸"} {title}</span>
      </button>
      {isOpen && <div style={styles.sectionContent}>{children}</div>}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: { padding: "var(--space-md)", borderRadius: "var(--radius-lg)", border: "1px solid var(--color-border)", background: "var(--color-bg-secondary)" },
  heading: { margin: "0 0 var(--space-sm)", fontSize: "var(--font-lg)", fontWeight: 600 },
  intro: { margin: "0 0 var(--space-md)", fontSize: "var(--font-sm)", color: "var(--color-text-muted)" },
  section: { borderBottom: "1px solid var(--color-border)" },
  sectionBtn: { width: "100%", textAlign: "left", background: "none", border: "none", padding: "var(--space-sm) 0", cursor: "pointer", fontSize: "var(--font-base)", fontWeight: 500, color: "var(--color-text)", minHeight: "var(--touch-target)", display: "flex", alignItems: "center" },
  sectionContent: { padding: "0 0 var(--space-sm) var(--space-md)", fontSize: "var(--font-sm)", color: "var(--color-text-muted)", lineHeight: 1.6 },
  footer: { marginTop: "var(--space-md)", padding: "var(--space-sm)", background: "var(--color-info-bg, #eff6ff)", borderRadius: "var(--radius-md)" },
  footerText: { margin: 0, fontSize: "var(--font-sm)", color: "var(--color-text-muted)", fontStyle: "italic" },
};
