import { useState, useEffect } from "react";
import { useWallet } from "./hooks/useWallet.js";
import { useRecords } from "./hooks/useRecords.js";
import { useUserRole } from "./hooks/useUserRole.js";
import { useToast } from "./hooks/useToast.js";
import { WalletConnect } from "./components/WalletConnect.js";
import { Register } from "./components/Register.js";
import { UploadRecord } from "./components/UploadRecord.js";
import { RecordList } from "./components/RecordList.js";
import { PermissionManager } from "./components/PermissionManager.js";
import { GrantAccess } from "./components/GrantAccess.js";
import { RequestAccess } from "./components/RequestAccess.js";
import { SharedRecords } from "./components/SharedRecords.js";
import { EmergencyConfig } from "./components/EmergencyConfig.js";
import { EmergencyTrigger } from "./components/EmergencyTrigger.js";
import { EmergencySessions } from "./components/EmergencySessions.js";
import { ToastContainer } from "./components/Toast.js";

function App() {
  const {
    account,
    provider,
    signer,
    connect,
    disconnect,
    pendingAccounts,
    confirmAccount,
    cancelAccountPick,
    refreshPermittedAccounts,
  } = useWallet();
  const { records, loadRecords } = useRecords(account, provider);
  const { role, loadRole } = useUserRole(account, provider);
  const { toasts, removeToast, success } = useToast();
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (account && provider) {
      loadRole();
      loadRecords();
    }
  }, [account, provider, loadRole, loadRecords, refreshKey]);

  const handleUploaded = () => {
    setRefreshKey((k) => k + 1);
    success("Record uploaded successfully");
  };
  const handlePermissionChange = () => setRefreshKey((k) => k + 1);
  const handleRegistered = () => {
    loadRole();
    setRefreshKey((k) => k + 1);
    success("Registration successful");
  };

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
          pendingAccounts={pendingAccounts}
          onConnect={connect}
          onDisconnect={disconnect}
          onConfirmAccount={confirmAccount}
          onCancelPending={cancelAccountPick}
          onRefreshPermitted={refreshPermittedAccounts}
        />

        {account && signer && provider && (
          <>
            {role === "unregistered" && (
              <Register signer={signer} account={account} onRegistered={handleRegistered} />
            )}

            {role === "patient" && (
              <>
                <div style={styles.roleIndicator}>
                  <span style={styles.roleBadge}>Patient</span>
                </div>
                <UploadRecord signer={signer} onUploaded={handleUploaded} />
                <RecordList
                  key={refreshKey}
                  account={account}
                  provider={provider}
                  signer={signer}
                />
                <PermissionManager
                  account={account}
                  provider={provider}
                  signer={signer}
                  records={records.map((r) => ({
                    recordId: r.recordId,
                    recordType: r.recordType,
                  }))}
                />
                <GrantAccess
                  account={account}
                  provider={provider}
                  signer={signer}
                  records={records.map((r) => ({
                    recordId: r.recordId,
                    recordType: r.recordType,
                  }))}
                  onGranted={handlePermissionChange}
                />
                <EmergencyConfig
                  account={account}
                  provider={provider}
                  signer={signer}
                />
                <EmergencySessions
                  account={account}
                  provider={provider}
                  signer={signer}
                  role="patient"
                  refreshKey={refreshKey}
                />
              </>
            )}

            {role === "doctor" && (
              <>
                <div style={styles.roleIndicator}>
                  <span style={{ ...styles.roleBadge, background: "#e3f2fd", color: "#1565c0" }}>
                    Doctor
                  </span>
                </div>
                <RequestAccess
                  account={account}
                  provider={provider}
                  signer={signer}
                  onRequested={handlePermissionChange}
                />
                <SharedRecords
                  account={account}
                  provider={provider}
                  signer={signer}
                />
                <EmergencyTrigger
                  account={account}
                  provider={provider}
                  signer={signer}
                  onTriggered={handlePermissionChange}
                />
                <EmergencySessions
                  account={account}
                  provider={provider}
                  signer={signer}
                  role="doctor"
                  refreshKey={refreshKey}
                />
              </>
            )}
          </>
        )}
      </main>

      <footer style={styles.footer}>
        <p>Dissertation Prototype &mdash; Blockchain Health Records</p>
      </footer>

      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: "100%",
    maxWidth: "var(--container-max)",
    margin: "0 auto",
    padding: "var(--space-md)",
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
  },
  header: {
    textAlign: "center",
    marginBottom: "var(--space-lg)",
    padding: "var(--space-md)",
    background: "linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-dark) 100%)",
    borderRadius: "var(--radius-lg)",
    color: "#e0e0e0",
  },
  title: {
    margin: 0,
    fontSize: "var(--font-xxl)",
    fontWeight: 700,
    color: "#ffffff",
    wordBreak: "break-word",
  },
  subtitle: {
    margin: "var(--space-sm) 0 0",
    fontSize: "var(--font-sm)",
    opacity: 0.85,
  },
  main: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: "var(--space-md)",
  },
  roleIndicator: {
    display: "flex",
    justifyContent: "center",
  },
  roleBadge: {
    padding: "var(--space-sm) var(--space-md)",
    borderRadius: "var(--radius-pill)",
    fontSize: "var(--font-sm)",
    fontWeight: 600,
    background: "var(--color-success-bg)",
    color: "var(--color-success)",
  },
  footer: {
    textAlign: "center",
    marginTop: "var(--space-lg)",
    padding: "var(--space-md)",
    fontSize: "var(--font-sm)",
    color: "var(--color-text-light)",
    borderTop: "1px solid var(--color-border)",
  },
};

export default App;
