import React, { useEffect, useState } from "react";

interface Props {
  account: string | null;
  pendingAccounts: string[] | null;
  onConnect: () => void;
  onDisconnect: () => void;
  onConfirmAccount: (address: string) => void;
  onCancelPending: () => void;
  onRefreshPermitted: () => void;
}

export function WalletConnect({
  account,
  pendingAccounts,
  onConnect,
  onDisconnect,
  onConfirmAccount,
  onCancelPending,
  onRefreshPermitted,
}: Props) {
  const [choice, setChoice] = useState("");

  useEffect(() => {
    if (pendingAccounts?.length) {
      setChoice(pendingAccounts[0]);
    }
  }, [pendingAccounts]);

  const shortAddr = account
    ? `${account.slice(0, 6)}...${account.slice(-4)}`
    : "";

  return (
    <div style={styles.card}>
      <h2 style={styles.heading}>Wallet</h2>
      {account ? (
        <div style={styles.connected}>
          <span style={styles.dot} />
          <span style={styles.addr}>{shortAddr}</span>
          <button type="button" onClick={onDisconnect} style={styles.btnDisconnect}>
            Disconnect
          </button>
        </div>
      ) : pendingAccounts && pendingAccounts.length > 0 ? (
        <div style={styles.pick}>
          <p style={styles.pickHint}>
            Several MetaMask accounts are linked to this site. Choose which one this app should use
            (ethers defaults to the first permitted account unless we set it explicitly).
          </p>
          <label style={styles.label} htmlFor="wallet-account-pick">
            Account
          </label>
          <select
            id="wallet-account-pick"
            value={choice}
            onChange={(e) => setChoice(e.target.value)}
            style={styles.select}
          >
            {pendingAccounts.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <div style={styles.pickActions}>
            <button
              type="button"
              onClick={() => choice && onConfirmAccount(choice)}
              style={styles.btnConnect}
            >
              Use selected account
            </button>
            <button type="button" onClick={onRefreshPermitted} style={styles.btnSecondary}>
              Refresh list
            </button>
            <button type="button" onClick={onCancelPending} style={styles.btnDisconnect}>
              Cancel
            </button>
          </div>
          <p style={styles.metaHint}>
            Don&apos;t see your imported Hardhat account? In MetaMask, select it, then use{" "}
            <strong>Connect account</strong> for <code>localhost:5173</code>, and click{" "}
            <strong>Refresh list</strong> here.
          </p>
        </div>
      ) : (
        <div>
          <button type="button" onClick={onConnect} style={styles.btnConnect}>
            Connect MetaMask
          </button>
          <p style={styles.preConnectHint}>
            Use MetaMask&apos;s <strong>Connect account</strong> for this site so your imported
            Hardhat address is allowed. If only one account was linked before, connect the imported
            one in MetaMask, then press Connect again — you&apos;ll get a list to choose from.
          </p>
        </div>
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
  heading: {
    margin: "0 0 var(--space-sm)",
    fontSize: "var(--font-lg)",
    fontWeight: 600,
  },
  connected: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: "var(--space-sm)",
  },
  pick: {
    display: "flex",
    flexDirection: "column",
    gap: "var(--space-sm)",
  },
  pickHint: {
    margin: 0,
    fontSize: "var(--font-sm)",
    color: "var(--color-text-muted)",
    lineHeight: 1.45,
  },
  pickActions: {
    display: "flex",
    flexWrap: "wrap",
    gap: "var(--space-sm)",
    marginTop: "var(--space-xs)",
  },
  label: {
    fontSize: "var(--font-sm)",
    fontWeight: 500,
  },
  select: {
    padding: "var(--space-sm)",
    borderRadius: "var(--radius-md)",
    border: "1px solid var(--color-border)",
    fontSize: "var(--font-sm)",
    fontFamily: "monospace",
    width: "100%",
    minHeight: "var(--touch-target)",
    wordBreak: "break-all",
  },
  metaHint: {
    margin: "var(--space-xs) 0 0",
    fontSize: "var(--font-sm)",
    color: "var(--color-text-muted)",
    lineHeight: 1.4,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: "50%",
    background: "#4caf50",
    display: "inline-block",
    flexShrink: 0,
  },
  addr: {
    fontFamily: "monospace",
    fontSize: "var(--font-base)",
    flex: 1,
    wordBreak: "break-all",
    minWidth: 0,
  },
  btnConnect: {
    padding: "var(--space-sm) var(--space-md)",
    border: "none",
    borderRadius: "var(--radius-md)",
    background: "var(--color-primary)",
    color: "#fff",
    cursor: "pointer",
    fontSize: "var(--font-base)",
    fontWeight: 600,
    minHeight: "var(--touch-target)",
    width: "100%",
  },
  btnSecondary: {
    padding: "var(--space-sm) var(--space-md)",
    border: "1px solid var(--color-border)",
    borderRadius: "var(--radius-md)",
    background: "var(--color-bg)",
    cursor: "pointer",
    fontSize: "var(--font-base)",
    color: "var(--color-text)",
    minHeight: "var(--touch-target)",
    flex: "1 1 auto",
  },
  btnDisconnect: {
    padding: "var(--space-sm) var(--space-md)",
    border: "1px solid var(--color-border)",
    borderRadius: "var(--radius-md)",
    background: "transparent",
    cursor: "pointer",
    fontSize: "var(--font-sm)",
    color: "var(--color-text-muted)",
    minHeight: "var(--touch-target)",
  },
  preConnectHint: {
    margin: "var(--space-sm) 0 0",
    fontSize: "var(--font-sm)",
    color: "var(--color-text-muted)",
    lineHeight: 1.4,
  },
};
