import React, { useEffect, useState, useMemo } from "react";
import type { JsonRpcSigner, BrowserProvider } from "ethers";
import { ConfirmModal } from "./ConfirmModal.js";
import {
  usePermissions,
  type AccessRequest,
  type Permission,
} from "../hooks/usePermissions.js";
import { RECORD_TYPES, getRecordManagerContract, getUserRegistryContract } from "../services/contracts.js";
import { fromHex, toHex } from "../utils/encryption.js";
import { importPublicKeyJWK, importPrivateKeyJWK, wrapAESKey, unwrapAESKey, getStoredPrivateKeyJWK } from "../utils/rsaKeys.js";
import { useDoctorProfiles } from "../hooks/useDoctorProfiles.js";
import { DoctorIdentityCard } from "./DoctorIdentityCard.js";
import type { DoctorIdentity } from "../types/profiles.js";

interface Props {
  account: string;
  provider: BrowserProvider;
  signer: JsonRpcSigner;
  records: { recordId: bigint; recordType: number }[];
}

function formatTimeRemaining(expiresAt: bigint): string {
  const now = Date.now();
  const expiry = Number(expiresAt) * 1000;
  const diff = expiry - now;

  if (diff <= 0) return "Expired";

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (days > 0) return `${days}d ${hours}h remaining`;
  if (hours > 0) return `${hours}h ${minutes}m remaining`;
  return `${minutes}m remaining`;
}

export function PermissionManager({ account, provider, signer, records }: Props) {
  const {
    pendingRequests,
    permissions,
    loading,
    error,
    loadPendingRequests,
    loadPermissions,
    approveRequest,
    rejectRequest,
    revokeAccess,
  } = usePermissions(account, provider, signer);

  const [activeTab, setActiveTab] = useState<"requests" | "permissions">("requests");
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [selectedRequests, setSelectedRequests] = useState<Set<string>>(new Set());
  const [batchProcessing, setBatchProcessing] = useState(false);
  const [, setTick] = useState(0);

  const { resolveDoctor } = useDoctorProfiles(provider);
  const [doctorProfiles, setDoctorProfiles] = useState<Record<string, DoctorIdentity>>({});

  useEffect(() => {
    loadPendingRequests();
    loadPermissions();
  }, [loadPendingRequests, loadPermissions]);

  useEffect(() => {
    const fetchProfiles = async () => {
      const addresses = new Set<string>();
      pendingRequests.forEach((r) => addresses.add(r.doctor.toLowerCase()));
      permissions.forEach((p) => addresses.add(p.grantedTo.toLowerCase()));

      const profilesMap: Record<string, DoctorIdentity> = { ...doctorProfiles };
      let updated = false;

      for (const addr of addresses) {
        if (!profilesMap[addr]) {
          const profile = await resolveDoctor(addr);
          profilesMap[addr] = profile;
          updated = true;
        }
      }

      if (updated) {
        setDoctorProfiles(profilesMap);
      }
    };

    if (pendingRequests.length > 0 || permissions.length > 0) {
      fetchProfiles();
    }
  }, [pendingRequests, permissions, resolveDoctor]);

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(interval);
  }, []);

  const wrapKeysForDoctor = async (recordIds: bigint[], doctorAddress: string): Promise<string[]> => {
    const privJwk = getStoredPrivateKeyJWK(account);
    if (!privJwk) throw new Error("Private key not found. Re-register to generate keys.");
    const rsaPrivKey = await importPrivateKeyJWK(privJwk);

    const recordManager = getRecordManagerContract(signer);
    const userRegistry = getUserRegistryContract(signer);
    const doctorPubHex: string = await userRegistry.getPublicKey(doctorAddress);
    const doctorPubJson = new TextDecoder().decode(fromHex(doctorPubHex));
    const doctorRsaPub = await importPublicKeyJWK(doctorPubJson);

    const wrappedKeys: string[] = [];
    for (const recordId of recordIds) {
      const patientWrappedHex: string = await recordManager.getEncryptedKey(recordId, account);
      const aesKey = await unwrapAESKey(fromHex(patientWrappedHex), rsaPrivKey);
      const doctorWrapped = await wrapAESKey(aesKey, doctorRsaPub);
      wrappedKeys.push(toHex(doctorWrapped));
    }
    return wrappedKeys;
  };

  const handleApprove = async (request: AccessRequest) => {
    const id = String(request.requestId);
    setProcessingId(id);

    try {
      const expiresAt = BigInt(Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60);
      const encryptedKeys = await wrapKeysForDoctor(request.recordIds, request.doctor);
      await approveRequest(request.requestId, expiresAt, encryptedKeys);
    } catch (err) {
      console.error("Approve failed:", err);
    }

    setProcessingId(null);
    setSelectedRequests((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const handleReject = async (request: AccessRequest) => {
    const id = String(request.requestId);
    setProcessingId(id);
    await rejectRequest(request.requestId);
    setProcessingId(null);
    setSelectedRequests((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const handleRevoke = async (permission: Permission) => {
    setConfirmRevoke(permission);
  };

  const [confirmRevoke, setConfirmRevoke] = useState<Permission | null>(null);

  const executeRevoke = async () => {
    if (!confirmRevoke) return;
    const id = `${confirmRevoke.recordId}-${confirmRevoke.grantedTo}`;
    setProcessingId(id);
    await revokeAccess(confirmRevoke.recordId, confirmRevoke.grantedTo);
    setProcessingId(null);
    setConfirmRevoke(null);
  };

  const toggleSelectRequest = (id: string) => {
    setSelectedRequests((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllRequests = () => {
    if (selectedRequests.size === pendingRequests.length) {
      setSelectedRequests(new Set());
    } else {
      setSelectedRequests(new Set(pendingRequests.map((r) => String(r.requestId))));
    }
  };

  const handleBatchApprove = async () => {
    setBatchProcessing(true);
    const selected = pendingRequests.filter((r) => selectedRequests.has(String(r.requestId)));

    for (const request of selected) {
      try {
        const expiresAt = BigInt(Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60);
        const encryptedKeys = await wrapKeysForDoctor(request.recordIds, request.doctor);
        await approveRequest(request.requestId, expiresAt, encryptedKeys);
      } catch (err) {
        console.error(`Batch approve failed for request #${request.requestId}:`, err);
      }
    }

    setSelectedRequests(new Set());
    setBatchProcessing(false);
  };

  const handleBatchReject = async () => {
    setBatchProcessing(true);
    const selected = pendingRequests.filter((r) => selectedRequests.has(String(r.requestId)));

    for (const request of selected) {
      await rejectRequest(request.requestId);
    }

    setSelectedRequests(new Set());
    setBatchProcessing(false);
  };

  const formatDate = (ts: bigint) =>
    new Date(Number(ts) * 1000).toLocaleString();

  const formatAddress = (addr: string) =>
    `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  const activePermissions = useMemo(() => {
    const now = Math.floor(Date.now() / 1000);
    return permissions.filter((p) => p.isActive && Number(p.expiresAt) > now);
  }, [permissions]);

  const expiredPermissions = useMemo(() => {
    const now = Math.floor(Date.now() / 1000);
    return permissions.filter((p) => p.isActive && Number(p.expiresAt) <= now);
  }, [permissions]);

  return (
    <div style={styles.card}>
      <h2 style={styles.heading}>Access Permissions</h2>

      <div style={styles.tabs}>
        <button
          style={{
            ...styles.tab,
            ...(activeTab === "requests" ? styles.tabActive : {}),
          }}
          onClick={() => setActiveTab("requests")}
        >
          Pending Requests ({pendingRequests.length})
        </button>
        <button
          style={{
            ...styles.tab,
            ...(activeTab === "permissions" ? styles.tabActive : {}),
          }}
          onClick={() => setActiveTab("permissions")}
        >
          Active Permissions ({activePermissions.length})
        </button>
      </div>

      {loading && <p style={styles.muted}>Loading...</p>}
      {error && <p style={styles.error}>{error}</p>}

      {activeTab === "requests" && (
        <div style={styles.section}>
          {pendingRequests.length === 0 ? (
            <p style={styles.muted}>No pending access requests.</p>
          ) : (
            <>
              {pendingRequests.length > 1 && (
                <div style={styles.batchBar}>
                  <label style={styles.selectAllLabel}>
                    <input
                      type="checkbox"
                      checked={selectedRequests.size === pendingRequests.length}
                      onChange={selectAllRequests}
                      disabled={batchProcessing}
                    />
                    Select All ({selectedRequests.size}/{pendingRequests.length})
                  </label>
                  {selectedRequests.size > 0 && (
                    <div style={styles.batchActions}>
                      <button
                        style={styles.batchApproveBtn}
                        onClick={handleBatchApprove}
                        disabled={batchProcessing}
                      >
                        {batchProcessing ? "Processing..." : `Approve ${selectedRequests.size}`}
                      </button>
                      <button
                        style={styles.batchRejectBtn}
                        onClick={handleBatchReject}
                        disabled={batchProcessing}
                      >
                        Reject {selectedRequests.size}
                      </button>
                    </div>
                  )}
                </div>
              )}
              {pendingRequests.map((req) => {
                const reqId = String(req.requestId);
                return (
                  <div key={reqId} style={styles.item}>
                    <div style={styles.itemHeader}>
                      {pendingRequests.length > 1 && (
                        <input
                          type="checkbox"
                          checked={selectedRequests.has(reqId)}
                          onChange={() => toggleSelectRequest(reqId)}
                          disabled={batchProcessing || processingId === reqId}
                          style={styles.checkbox}
                        />
                      )}
                      <span style={styles.label}>Request #{reqId}</span>
                      <span style={styles.badge}>Pending</span>
                    </div>
                    <div style={styles.itemDetails}>
                      <div style={{ marginBottom: "var(--space-xs)" }}>
                        <strong>Doctor:</strong>
                        <DoctorIdentityCard
                          profile={doctorProfiles[req.doctor.toLowerCase()] || {
                            address: req.doctor,
                            name: "Loading doctor profile...",
                            licenseNumber: "",
                            specialty: "",
                            institution: "",
                            registeredAt: null,
                            isVerified: false,
                            displayName: formatAddress(req.doctor),
                            displaySubtitle: "Retrieving credentials...",
                            formattedAddress: formatAddress(req.doctor),
                          }}
                          compact={false}
                        />
                      </div>
                      <div>
                        <strong>Records:</strong>{" "}
                        {req.recordIds.map((id) => `#${String(id)}`).join(", ")}
                      </div>
                      <div>
                        <strong>Reason:</strong> {req.reason}
                      </div>
                      <div style={styles.timestamp}>
                        Requested: {formatDate(req.requestedAt)}
                      </div>
                    </div>
                    <div style={styles.actions}>
                      <button
                        style={styles.approveBtn}
                        onClick={() => handleApprove(req)}
                        disabled={processingId === reqId || batchProcessing}
                      >
                        {processingId === reqId ? "Processing..." : "Approve"}
                      </button>
                      <button
                        style={styles.rejectBtn}
                        onClick={() => handleReject(req)}
                        disabled={processingId === reqId || batchProcessing}
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}

      {activeTab === "permissions" && (
        <div style={styles.section}>
          {activePermissions.length === 0 && expiredPermissions.length === 0 ? (
            <p style={styles.muted}>No permissions granted.</p>
          ) : (
            <>
              {activePermissions.length > 0 && (
                <>
                  <h4 style={styles.subsectionTitle}>Active ({activePermissions.length})</h4>
                  {activePermissions.map((perm) => {
                    const permId = `${perm.recordId}-${perm.grantedTo}`;
                    const record = records.find(
                      (r) => String(r.recordId) === String(perm.recordId)
                    );
                    const recordLabel = record
                      ? RECORD_TYPES[record.recordType] || "Record"
                      : "Record";
                    const timeRemaining = formatTimeRemaining(perm.expiresAt);
                    const isExpiringSoon = Number(perm.expiresAt) * 1000 - Date.now() < 24 * 60 * 60 * 1000;

                    return (
                      <div key={permId} style={styles.item}>
                        <div style={styles.itemHeader}>
                          <span style={styles.label}>
                            {recordLabel} #{String(perm.recordId)}
                          </span>
                          <span style={{ ...styles.badge, background: "#e8f5e9", color: "#2e7d32" }}>
                            Active
                          </span>
                          <span
                            style={{
                              ...styles.expiryBadge,
                              color: isExpiringSoon ? "#e65100" : "#666",
                            }}
                          >
                            {timeRemaining}
                          </span>
                        </div>
                        <div style={styles.itemDetails}>
                          <div style={{ marginBottom: "var(--space-xs)" }}>
                            <strong>Granted to:</strong>
                            <DoctorIdentityCard
                              profile={doctorProfiles[perm.grantedTo.toLowerCase()] || {
                                address: perm.grantedTo,
                                name: "Loading doctor profile...",
                                licenseNumber: "",
                                specialty: "",
                                institution: "",
                                registeredAt: null,
                                isVerified: false,
                                displayName: formatAddress(perm.grantedTo),
                                displaySubtitle: "Retrieving credentials...",
                                formattedAddress: formatAddress(perm.grantedTo),
                              }}
                              compact={true}
                            />
                          </div>
                          <div>
                            <strong>Granted:</strong> {formatDate(perm.grantedAt)}
                          </div>
                          <div>
                            <strong>Expires:</strong> {formatDate(perm.expiresAt)}
                          </div>
                        </div>
                        <div style={styles.actions}>
                          <button
                            style={styles.revokeBtn}
                            onClick={() => handleRevoke(perm)}
                            disabled={processingId === permId}
                          >
                            {processingId === permId ? "Revoking..." : "Revoke Access"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
              {expiredPermissions.length > 0 && (
                <>
                  <h4 style={styles.subsectionTitle}>Expired ({expiredPermissions.length})</h4>
                  {expiredPermissions.slice(0, 3).map((perm) => {
                    const permId = `${perm.recordId}-${perm.grantedTo}`;
                    const record = records.find(
                      (r) => String(r.recordId) === String(perm.recordId)
                    );
                    const recordLabel = record
                      ? RECORD_TYPES[record.recordType] || "Record"
                      : "Record";

                    return (
                      <div key={permId} style={{ ...styles.item, opacity: 0.7 }}>
                        <div style={styles.itemHeader}>
                          <span style={styles.label}>
                            {recordLabel} #{String(perm.recordId)}
                          </span>
                          <span style={{ ...styles.badge, background: "#f5f5f5", color: "#888" }}>
                            Expired
                          </span>
                        </div>
                        <div style={styles.itemDetails}>
                          <div style={{ marginBottom: "var(--space-xs)" }}>
                            <strong>Was granted to:</strong>
                            <DoctorIdentityCard
                              profile={doctorProfiles[perm.grantedTo.toLowerCase()] || {
                                address: perm.grantedTo,
                                name: "Loading doctor profile...",
                                licenseNumber: "",
                                specialty: "",
                                institution: "",
                                registeredAt: null,
                                isVerified: false,
                                displayName: formatAddress(perm.grantedTo),
                                displaySubtitle: "Retrieving credentials...",
                                formattedAddress: formatAddress(perm.grantedTo),
                              }}
                              compact={true}
                              showVerificationNote={false}
                            />
                          </div>
                          <div>
                            <strong>Expired:</strong> {formatDate(perm.expiresAt)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </>
          )}
        </div>
      )}

      <div style={styles.refreshRow}>
        <button
          style={styles.refreshBtn}
          onClick={() => {
            loadPendingRequests();
            loadPermissions();
          }}
          disabled={loading}
        >
          Refresh
        </button>
      </div>

      {confirmRevoke && (
        <ConfirmModal
          title="Stop future access?"
          message={`Stop access for ${doctorProfiles[confirmRevoke.grantedTo.toLowerCase()]?.displayName || formatAddress(confirmRevoke.grantedTo)}? This doctor will no longer be able to open this record through the app. This cannot delete copies they may have already downloaded.`}
          confirmLabel="Revoke access"
          onConfirm={executeRevoke}
          onCancel={() => setConfirmRevoke(null)}
        />
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
    margin: "0 0 var(--space-md)",
    fontSize: "var(--font-lg)",
    fontWeight: 600,
  },
  tabs: {
    display: "flex",
    flexWrap: "wrap",
    gap: "var(--space-sm)",
    marginBottom: "var(--space-md)",
  },
  tab: {
    padding: "var(--space-sm) var(--space-md)",
    border: "1px solid var(--color-border)",
    borderRadius: "var(--radius-md)",
    background: "var(--color-bg)",
    cursor: "pointer",
    fontSize: "var(--font-base)",
    fontWeight: 500,
    color: "var(--color-text-muted)",
    minHeight: "var(--touch-target)",
    flex: "1 1 auto",
    textAlign: "center",
  },
  tabActive: {
    background: "var(--color-primary)",
    color: "#fff",
    borderColor: "var(--color-primary)",
  },
  section: {
    display: "flex",
    flexDirection: "column",
    gap: "var(--space-sm)",
  },
  subsectionTitle: {
    margin: "var(--space-sm) 0 var(--space-xs)",
    fontSize: "var(--font-sm)",
    fontWeight: 600,
    color: "var(--color-text-muted)",
  },
  muted: {
    color: "var(--color-text-light)",
    fontSize: "var(--font-base)",
  },
  error: {
    color: "var(--color-error)",
    fontSize: "var(--font-base)",
    padding: "var(--space-sm)",
    background: "var(--color-error-bg)",
    borderRadius: "var(--radius-md)",
    wordBreak: "break-word",
  },
  batchBar: {
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "var(--space-sm)",
    padding: "var(--space-sm)",
    background: "var(--color-info-bg)",
    borderRadius: "var(--radius-md)",
    marginBottom: "var(--space-sm)",
  },
  selectAllLabel: {
    display: "flex",
    alignItems: "center",
    gap: "var(--space-sm)",
    fontSize: "var(--font-sm)",
    cursor: "pointer",
    minHeight: "var(--touch-target)",
  },
  batchActions: {
    display: "flex",
    flexWrap: "wrap",
    gap: "var(--space-sm)",
  },
  batchApproveBtn: {
    padding: "var(--space-sm) var(--space-md)",
    border: "none",
    borderRadius: "var(--radius-sm)",
    background: "var(--color-success)",
    color: "#fff",
    cursor: "pointer",
    fontSize: "var(--font-sm)",
    fontWeight: 500,
    minHeight: "var(--touch-target)",
  },
  batchRejectBtn: {
    padding: "var(--space-sm) var(--space-md)",
    border: "1px solid var(--color-error)",
    borderRadius: "var(--radius-sm)",
    background: "var(--color-bg)",
    color: "var(--color-error)",
    cursor: "pointer",
    fontSize: "var(--font-sm)",
    fontWeight: 500,
    minHeight: "var(--touch-target)",
  },
  checkbox: {
    marginRight: "var(--space-xs)",
    width: "20px",
    height: "20px",
  },
  item: {
    padding: "var(--space-sm)",
    borderRadius: "var(--radius-md)",
    border: "1px solid var(--color-border)",
    background: "var(--color-bg)",
  },
  itemHeader: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: "var(--space-sm)",
    marginBottom: "var(--space-sm)",
  },
  label: {
    fontWeight: 600,
    fontSize: "var(--font-base)",
    wordBreak: "break-all",
  },
  badge: {
    padding: "var(--space-xs) var(--space-sm)",
    borderRadius: "var(--radius-sm)",
    fontSize: "var(--font-xs)",
    fontWeight: 500,
    background: "var(--color-warning-bg)",
    color: "var(--color-warning)",
    whiteSpace: "nowrap",
  },
  expiryBadge: {
    fontSize: "var(--font-xs)",
    fontWeight: 500,
  },
  itemDetails: {
    fontSize: "var(--font-sm)",
    color: "var(--color-text-muted)",
    display: "flex",
    flexDirection: "column",
    gap: "var(--space-xs)",
    marginBottom: "var(--space-sm)",
    wordBreak: "break-all",
  },
  timestamp: {
    fontSize: "var(--font-sm)",
    color: "var(--color-text-light)",
    marginTop: "var(--space-xs)",
  },
  actions: {
    display: "flex",
    flexWrap: "wrap",
    gap: "var(--space-sm)",
    marginTop: "var(--space-sm)",
  },
  approveBtn: {
    padding: "var(--space-sm) var(--space-md)",
    border: "none",
    borderRadius: "var(--radius-md)",
    background: "var(--color-success)",
    color: "#fff",
    cursor: "pointer",
    fontSize: "var(--font-sm)",
    fontWeight: 500,
    minHeight: "var(--touch-target)",
    flex: "1 1 auto",
  },
  rejectBtn: {
    padding: "var(--space-sm) var(--space-md)",
    border: "1px solid var(--color-error)",
    borderRadius: "var(--radius-md)",
    background: "var(--color-bg)",
    color: "var(--color-error)",
    cursor: "pointer",
    fontSize: "var(--font-sm)",
    fontWeight: 500,
    minHeight: "var(--touch-target)",
    flex: "1 1 auto",
  },
  revokeBtn: {
    padding: "var(--space-sm) var(--space-md)",
    border: "1px solid var(--color-error)",
    borderRadius: "var(--radius-md)",
    background: "var(--color-error-bg)",
    color: "var(--color-error)",
    cursor: "pointer",
    fontSize: "var(--font-sm)",
    fontWeight: 500,
    minHeight: "var(--touch-target)",
  },
  refreshRow: {
    marginTop: "var(--space-md)",
    textAlign: "right",
  },
  refreshBtn: {
    padding: "var(--space-sm) var(--space-md)",
    border: "1px solid var(--color-border)",
    borderRadius: "var(--radius-md)",
    background: "var(--color-bg)",
    cursor: "pointer",
    fontSize: "var(--font-sm)",
    minHeight: "var(--touch-target)",
  },
};
