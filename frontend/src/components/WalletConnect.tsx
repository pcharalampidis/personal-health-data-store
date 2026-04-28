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
    padding: "1.25rem",
    borderRadius: 10,
    border: "1px solid #e0e0e0",
    background: "#fafafa",
  },
  heading: {
    margin: "0 0 0.75rem",
    fontSize: "1.1rem",
    fontWeight: 600,
  },
  connected: {
    display: "flex",
    alignItems: "center",
    gap: "0.75rem",
  },
  pick: {
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
  },
  pickHint: {
    margin: 0,
    fontSize: "0.88rem",
    color: "#444",
    lineHeight: 1.45,
  },
  pickActions: {
    display: "flex",
    flexWrap: "wrap",
    gap: "0.5rem",
    marginTop: "0.25rem",
  },
  label: {
    fontSize: "0.85rem",
    fontWeight: 500,
  },
  select: {
    padding: "0.5rem",
    borderRadius: 6,
    border: "1px solid #ccc",
    fontSize: "0.85rem",
    fontFamily: "monospace",
    maxWidth: "100%",
  },
  metaHint: {
    margin: "0.35rem 0 0",
    fontSize: "0.8rem",
    color: "#666",
    lineHeight: 1.4,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: "50%",
    background: "#4caf50",
    display: "inline-block",
  },
  addr: {
    fontFamily: "monospace",
    fontSize: "0.95rem",
    flex: 1,
  },
  btnConnect: {
    padding: "0.6rem 1.25rem",
    border: "none",
    borderRadius: 6,
    background: "#0f3460",
    color: "#fff",
    cursor: "pointer",
    fontSize: "0.9rem",
    fontWeight: 600,
  },
  btnSecondary: {
    padding: "0.6rem 1rem",
    border: "1px solid #ccc",
    borderRadius: 6,
    background: "#fff",
    cursor: "pointer",
    fontSize: "0.9rem",
    color: "#333",
  },
  btnDisconnect: {
    padding: "0.4rem 1rem",
    border: "1px solid #ccc",
    borderRadius: 6,
    background: "transparent",
    cursor: "pointer",
    fontSize: "0.85rem",
    color: "#666",
  },
  preConnectHint: {
    margin: "0.65rem 0 0",
    fontSize: "0.78rem",
    color: "#666",
    lineHeight: 1.4,
    maxWidth: 520,
  },
};
