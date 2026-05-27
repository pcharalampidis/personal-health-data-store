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
import { PrivacySecurityInfo } from "./components/PrivacySecurityInfo.js";
import { ToastContainer } from "./components/Toast.js";

type PatientPage = "records" | "access" | "emergency" | "settings";
type DoctorPage = "shared" | "request" | "emergency" | "settings";

const PATIENT_NAV: { id: PatientPage; label: string; icon: string }[] = [
  { id: "records", label: "Records", icon: "📋" },
  { id: "access", label: "Access", icon: "🔑" },
  { id: "emergency", label: "Emergency", icon: "🚨" },
  { id: "settings", label: "Settings", icon: "⚙️" },
];

const DOCTOR_NAV: { id: DoctorPage; label: string; icon: string }[] = [
  { id: "shared", label: "Shared", icon: "📋" },
  { id: "request", label: "Request", icon: "🔑" },
  { id: "emergency", label: "Emergency", icon: "🚨" },
  { id: "settings", label: "Settings", icon: "⚙️" },
];

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
  const [patientPage, setPatientPage] = useState<PatientPage>("records");
  const [doctorPage, setDoctorPage] = useState<DoctorPage>("shared");

  useEffect(() => {
    if (account && provider) {
      loadRole();
      loadRecords();
    }
  }, [account, provider, loadRole, loadRecords, refreshKey]);

  const handleUploaded = () => {
    setRefreshKey((k) => k + 1);
    success("Record uploaded securely");
  };
  const handlePermissionChange = () => setRefreshKey((k) => k + 1);
  const handleRegistered = () => {
    loadRole();
    setRefreshKey((k) => k + 1);
    success("Registration successful");
  };

  const formatAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

  // Pre-auth state
  if (!account || !signer || !provider) {
    return (
      <div className="container" style={{ maxWidth: 480, margin: "0 auto", padding: "var(--space-xl)", textAlign: "center" }}>
        <h1 style={{ fontSize: "var(--font-xxl)", fontWeight: 700, color: "var(--color-primary)", marginBottom: "var(--space-sm)" }}>
          Secure Health Vault
        </h1>
        <p style={{ color: "var(--color-text-muted)", marginBottom: "var(--space-xl)", fontSize: "var(--font-base)" }}>
          Store encrypted health records, control who can access them, and enable emergency access when needed.
        </p>
        <WalletConnect
          account={account}
          pendingAccounts={pendingAccounts}
          onConnect={connect}
          onDisconnect={disconnect}
          onConfirmAccount={confirmAccount}
          onCancelPending={cancelAccountPick}
          onRefreshPermitted={refreshPermittedAccounts}
        />
        <ToastContainer toasts={toasts} onRemove={removeToast} />
      </div>
    );
  }

  // Unregistered
  if (role === "unregistered") {
    return (
      <div className="container" style={{ maxWidth: 480, margin: "0 auto", padding: "var(--space-xl)" }}>
        <h1 style={{ fontSize: "var(--font-xl)", fontWeight: 700, marginBottom: "var(--space-md)" }}>Welcome</h1>
        <p style={{ color: "var(--color-text-muted)", marginBottom: "var(--space-md)" }}>
          Connected as {formatAddr(account)}. Register to get started.
        </p>
        <Register signer={signer} account={account} onRegistered={handleRegistered} />
        <ToastContainer toasts={toasts} onRemove={removeToast} />
      </div>
    );
  }

  // Authenticated app shell
  const isPatient = role === "patient";
  const navItems = isPatient ? PATIENT_NAV : DOCTOR_NAV;
  const activePage = isPatient ? patientPage : doctorPage;
  const setPage = isPatient
    ? (p: string) => setPatientPage(p as PatientPage)
    : (p: string) => setDoctorPage(p as DoctorPage);

  return (
    <div className="app-shell">
      {/* Sidebar (desktop) */}
      <aside className="app-sidebar">
        <div className="app-sidebar__logo">Health Vault</div>
        <div className="app-sidebar__role">
          <span className={`role-badge role-badge--${role}`}>
            {isPatient ? "Patient" : "Doctor"}
          </span>
        </div>
        <ul className="app-sidebar__nav">
          {navItems.map((item) => (
            <li key={item.id}>
              <button data-active={activePage === item.id} onClick={() => setPage(item.id)}>
                <span>{item.icon}</span> {item.label}
              </button>
            </li>
          ))}
        </ul>
        <div className="app-sidebar__wallet">{formatAddr(account)}</div>
      </aside>

      {/* Main content */}
      <main className="app-main">
        {isPatient && patientPage === "records" && (
          <>
            <div className="page-header">
              <h1 className="page-header__title">Records</h1>
              <p className="page-header__description">Upload, view, and manage your encrypted health records.</p>
            </div>
            <UploadRecord signer={signer} onUploaded={handleUploaded} />
            <RecordList key={refreshKey} account={account} provider={provider} signer={signer} />
          </>
        )}

        {isPatient && patientPage === "access" && (
          <>
            <div className="page-header">
              <h1 className="page-header__title">Access Management</h1>
              <p className="page-header__description">Control who can view your health records.</p>
            </div>
            <PermissionManager
              account={account} provider={provider} signer={signer}
              records={records.map((r) => ({ recordId: r.recordId, recordType: r.recordType }))}
            />
            <GrantAccess
              account={account} provider={provider} signer={signer}
              records={records.map((r) => ({ recordId: r.recordId, recordType: r.recordType }))}
              onGranted={handlePermissionChange}
            />
          </>
        )}

        {isPatient && patientPage === "emergency" && (
          <>
            <div className="page-header">
              <h1 className="page-header__title">Emergency Access</h1>
              <p className="page-header__description">Configure what can be accessed if you cannot provide consent.</p>
            </div>
            <EmergencyConfig account={account} provider={provider} signer={signer} />
            <EmergencySessions account={account} provider={provider} signer={signer} role="patient" refreshKey={refreshKey} />
          </>
        )}

        {isPatient && patientPage === "settings" && (
          <>
            <div className="page-header">
              <h1 className="page-header__title">Settings</h1>
              <p className="page-header__description">Privacy, security, and account information.</p>
            </div>
            <PrivacySecurityInfo />
            <div style={{ marginTop: "var(--space-md)", padding: "var(--space-md)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)", background: "var(--color-bg-secondary)" }}>
              <p style={{ fontSize: "var(--font-sm)", color: "var(--color-text-muted)" }}>
                <strong>Wallet:</strong> {account}
              </p>
              <button onClick={disconnect} style={{ marginTop: "var(--space-sm)", padding: "var(--space-sm) var(--space-md)", border: "1px solid var(--color-error)", borderRadius: "var(--radius-md)", background: "var(--color-bg)", color: "var(--color-error)", cursor: "pointer" }}>
                Disconnect wallet
              </button>
            </div>
          </>
        )}

        {!isPatient && doctorPage === "shared" && (
          <>
            <div className="page-header">
              <h1 className="page-header__title">Shared Records</h1>
              <p className="page-header__description">Records patients have authorised you to view.</p>
            </div>
            <SharedRecords account={account} provider={provider} signer={signer} />
          </>
        )}

        {!isPatient && doctorPage === "request" && (
          <>
            <div className="page-header">
              <h1 className="page-header__title">Request Access</h1>
              <p className="page-header__description">Request permission to view a patient's records.</p>
            </div>
            <RequestAccess account={account} provider={provider} signer={signer} onRequested={handlePermissionChange} />
          </>
        )}

        {!isPatient && doctorPage === "emergency" && (
          <>
            <div className="page-header">
              <h1 className="page-header__title">Emergency Access</h1>
              <p className="page-header__description">Request emergency access when a patient cannot consent.</p>
            </div>
            <EmergencyTrigger account={account} provider={provider} signer={signer} onTriggered={handlePermissionChange} />
            <EmergencySessions account={account} provider={provider} signer={signer} role="doctor" refreshKey={refreshKey} />
          </>
        )}

        {!isPatient && doctorPage === "settings" && (
          <>
            <div className="page-header">
              <h1 className="page-header__title">Settings</h1>
              <p className="page-header__description">Account information.</p>
            </div>
            <div style={{ padding: "var(--space-md)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)", background: "var(--color-bg-secondary)" }}>
              <p style={{ fontSize: "var(--font-sm)", color: "var(--color-text-muted)" }}>
                <strong>Wallet:</strong> {account}
              </p>
              <button onClick={disconnect} style={{ marginTop: "var(--space-sm)", padding: "var(--space-sm) var(--space-md)", border: "1px solid var(--color-error)", borderRadius: "var(--radius-md)", background: "var(--color-bg)", color: "var(--color-error)", cursor: "pointer" }}>
                Disconnect wallet
              </button>
            </div>
          </>
        )}
      </main>

      {/* Bottom nav (mobile) */}
      <nav className="app-bottom-nav">
        {navItems.map((item) => (
          <button key={item.id} data-active={activePage === item.id} onClick={() => setPage(item.id)}>
            <span className="app-bottom-nav__icon">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>

      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  );
}

export default App;
