import { useState } from "react";
import { useWallet } from "./hooks/useWallet.js";
import { WalletConnect } from "./components/WalletConnect.js";
import { UploadRecord } from "./components/UploadRecord.js";
import { RecordList } from "./components/RecordList.js";

function App() {
  const { account, provider, signer, connect, disconnect } = useWallet();
  const [refreshKey, setRefreshKey] = useState(0);

  const handleUploaded = () => setRefreshKey((k) => k + 1);

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.title}>Personal Health Data Store</h1>
        <p style={styles.subtitle}>
          Secure, decentralised health record management
        </p>
      </header>

      <main style={styles.main}>
        <WalletConnect
          account={account}
          onConnect={connect}
          onDisconnect={disconnect}
        />

        {account && signer && provider && (
          <>
            <UploadRecord signer={signer} onUploaded={handleUploaded} />
            <RecordList
              key={refreshKey}
              account={account}
              provider={provider}
            />
          </>
        )}
      </main>

      <footer style={styles.footer}>
        <p>Dissertation Prototype &mdash; Blockchain Health Records</p>
      </footer>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: 900,
    margin: "0 auto",
    padding: "2rem",
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    color: "#1a1a2e",
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
  },
  header: {
    textAlign: "center",
    marginBottom: "2rem",
    padding: "1.5rem",
    background: "linear-gradient(135deg, #0f3460 0%, #16213e 100%)",
    borderRadius: 12,
    color: "#e0e0e0",
  },
  title: {
    margin: 0,
    fontSize: "1.8rem",
    fontWeight: 700,
    color: "#ffffff",
  },
  subtitle: {
    margin: "0.5rem 0 0",
    fontSize: "0.95rem",
    opacity: 0.85,
  },
  main: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: "1.5rem",
  },
  footer: {
    textAlign: "center",
    marginTop: "2rem",
    padding: "1rem",
    fontSize: "0.85rem",
    color: "#888",
    borderTop: "1px solid #eee",
  },
};

export default App;
