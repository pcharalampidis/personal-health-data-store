import React from "react";

interface Props {
  account: string | null;
  onConnect: () => void;
  onDisconnect: () => void;
}

export function WalletConnect({ account, onConnect, onDisconnect }: Props) {
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
          <button onClick={onDisconnect} style={styles.btnDisconnect}>
            Disconnect
          </button>
        </div>
      ) : (
        <button onClick={onConnect} style={styles.btnConnect}>
          Connect MetaMask
        </button>
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
    padding: "0.6rem 1.5rem",
    border: "none",
    borderRadius: 6,
    background: "#0f3460",
    color: "#fff",
    cursor: "pointer",
    fontSize: "0.95rem",
    fontWeight: 600,
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
};
