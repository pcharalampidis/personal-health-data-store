import React, { useState } from "react";
import type { JsonRpcSigner, BrowserProvider } from "ethers";
import { isAddress } from "ethers";
import { useDoctorAccess, REQUEST_STATUS_LABELS } from "../hooks/useDoctorAccess.js";

interface Props {
  account: string;
  provider: BrowserProvider;
  signer: JsonRpcSigner;
  onRequested?: () => void;
}

export function RequestAccess({ account, provider, signer, onRequested }: Props) {
  const {
    myRequests,
    loading,
    error,
    loadMyRequests,
    requestAccess,
    isPatientRegistered,
    getPatientRecordIds,
  } = useDoctorAccess(account, provider, signer);

  const [patientAddress, setPatientAddress] = useState("");
  const [availableRecords, setAvailableRecords] = useState<bigint[]>([]);
  const [selectedRecords, setSelectedRecords] = useState<Set<string>>(new Set());
  const [reason, setReason] = useState("");
  const [processing, setProcessing] = useState(false);
  const [localError, setLocalError] = useState("");
  const [success, setSuccess] = useState("");
  const [lookingUp, setLookingUp] = useState(false);

  React.useEffect(() => {
    loadMyRequests();
  }, [loadMyRequests]);

  const handleLookupPatient = async () => {
    setLocalError("");
    setSuccess("");
    setAvailableRecords([]);
    setSelectedRecords(new Set());

    if (!isAddress(patientAddress)) {
      setLocalError("Invalid patient wallet address");
      return;
    }

    setLookingUp(true);

    try {
      const isPatient = await isPatientRegistered(patientAddress);
      if (!isPatient) {
        setLocalError("Address is not a registered patient");
        setLookingUp(false);
        return;
      }

      const recordIds = await getPatientRecordIds(patientAddress);
      if (recordIds.length === 0) {
        setLocalError("Patient has no health records");
        setLookingUp(false);
        return;
      }

      setAvailableRecords(recordIds);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : String(err));
    } finally {
      setLookingUp(false);
    }
  };

  const toggleRecord = (recordId: string) => {
    const newSet = new Set(selectedRecords);
    if (newSet.has(recordId)) {
      newSet.delete(recordId);
    } else {
      newSet.add(recordId);
    }
    setSelectedRecords(newSet);
  };

  const handleSubmitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError("");
    setSuccess("");

    if (selectedRecords.size === 0) {
      setLocalError("Please select at least one record");
      return;
    }

    if (!reason.trim()) {
      setLocalError("Please provide a reason for access");
      return;
    }

    setProcessing(true);

    try {
      const recordIds = Array.from(selectedRecords).map((id) => BigInt(id));
      const ok = await requestAccess(patientAddress, recordIds, reason.trim());

      if (ok) {
        setSuccess("Access request sent successfully");
        setPatientAddress("");
        setAvailableRecords([]);
        setSelectedRecords(new Set());
        setReason("");
        onRequested?.();
      }
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : String(err));
    } finally {
      setProcessing(false);
    }
  };

  const formatDate = (ts: bigint) =>
    new Date(Number(ts) * 1000).toLocaleString();

  const formatAddress = (addr: string) =>
    `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  const pendingRequests = myRequests.filter((r) => r.status === 0);
  const pastRequests = myRequests.filter((r) => r.status !== 0);

  return (
    <div style={styles.card}>
      <h2 style={styles.heading}>Request Patient Records</h2>

      <div style={styles.form}>
        <div style={styles.field}>
          <label style={styles.label}>Patient Wallet Address</label>
          <div style={styles.inputRow}>
            <input
              type="text"
              style={styles.input}
              placeholder="0x..."
              value={patientAddress}
              onChange={(e) => setPatientAddress(e.target.value)}
              disabled={processing || lookingUp}
            />
            <button
              type="button"
              style={styles.lookupBtn}
              onClick={handleLookupPatient}
              disabled={processing || lookingUp || !patientAddress}
            >
              {lookingUp ? "Looking up..." : "Lookup"}
            </button>
          </div>
        </div>

        {availableRecords.length > 0 && (
          <>
            <div style={styles.field}>
              <label style={styles.label}>Select Records to Request</label>
              <div style={styles.recordList}>
                {availableRecords.map((id) => {
                  const idStr = String(id);
                  return (
                    <label key={idStr} style={styles.checkboxLabel}>
                      <input
                        type="checkbox"
                        checked={selectedRecords.has(idStr)}
                        onChange={() => toggleRecord(idStr)}
                        disabled={processing}
                      />
                      <span>Record #{idStr}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div style={styles.field}>
              <label style={styles.label}>Reason for Access</label>
              <textarea
                style={styles.textarea}
                placeholder="Explain why you need access to these records..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={processing}
                rows={3}
              />
            </div>

            <button
              type="button"
              style={styles.submitBtn}
              onClick={handleSubmitRequest}
              disabled={processing || selectedRecords.size === 0}
            >
              {processing ? "Submitting..." : "Submit Request"}
            </button>
          </>
        )}

        {(localError || error) && <p style={styles.error}>{localError || error}</p>}
        {success && <p style={styles.success}>{success}</p>}
      </div>

      {pendingRequests.length > 0 && (
        <div style={styles.section}>
          <h3 style={styles.subheading}>My Pending Requests</h3>
          {pendingRequests.map((req) => (
            <div key={String(req.requestId)} style={styles.requestItem}>
              <div style={styles.requestHeader}>
                <span>Request #{String(req.requestId)}</span>
                <span style={styles.pendingBadge}>Pending</span>
              </div>
              <div style={styles.requestDetails}>
                <div>Patient: {formatAddress(req.patient)}</div>
                <div>Records: {req.recordIds.map((id) => `#${String(id)}`).join(", ")}</div>
                <div>Reason: {req.reason}</div>
                <div style={styles.timestamp}>Requested: {formatDate(req.requestedAt)}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {pastRequests.length > 0 && (
        <div style={styles.section}>
          <h3 style={styles.subheading}>Past Requests</h3>
          {pastRequests.slice(0, 5).map((req) => (
            <div key={String(req.requestId)} style={styles.requestItem}>
              <div style={styles.requestHeader}>
                <span>Request #{String(req.requestId)}</span>
                <span
                  style={{
                    ...styles.statusBadge,
                    background: req.status === 1 ? "#e8f5e9" : "#fce4ec",
                    color: req.status === 1 ? "#2e7d32" : "#c62828",
                  }}
                >
                  {REQUEST_STATUS_LABELS[req.status]}
                </span>
              </div>
              <div style={styles.requestDetails}>
                <div>Patient: {formatAddress(req.patient)}</div>
                <div>Records: {req.recordIds.map((id) => `#${String(id)}`).join(", ")}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={styles.refreshRow}>
        <button
          style={styles.refreshBtn}
          onClick={loadMyRequests}
          disabled={loading}
        >
          Refresh
        </button>
      </div>
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
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "var(--space-sm)",
  },
  field: {
    display: "flex",
    flexDirection: "column",
    gap: "var(--space-xs)",
  },
  label: {
    fontSize: "var(--font-sm)",
    fontWeight: 500,
    color: "var(--color-text)",
  },
  inputRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: "var(--space-sm)",
  },
  input: {
    flex: "1 1 200px",
    padding: "var(--space-sm)",
    borderRadius: "var(--radius-md)",
    border: "1px solid var(--color-border)",
    fontSize: "var(--font-base)",
    minHeight: "var(--touch-target)",
  },
  lookupBtn: {
    padding: "var(--space-sm) var(--space-md)",
    border: "1px solid var(--color-primary)",
    borderRadius: "var(--radius-md)",
    background: "var(--color-bg)",
    color: "var(--color-primary)",
    cursor: "pointer",
    fontSize: "var(--font-sm)",
    fontWeight: 500,
    minHeight: "var(--touch-target)",
    whiteSpace: "nowrap",
  },
  recordList: {
    display: "flex",
    flexDirection: "column",
    gap: "var(--space-sm)",
    padding: "var(--space-sm)",
    background: "var(--color-bg)",
    borderRadius: "var(--radius-md)",
    border: "1px solid var(--color-border)",
  },
  checkboxLabel: {
    display: "flex",
    alignItems: "center",
    gap: "var(--space-sm)",
    fontSize: "var(--font-base)",
    cursor: "pointer",
    padding: "var(--space-xs) 0",
    minHeight: "var(--touch-target)",
  },
  textarea: {
    padding: "var(--space-sm)",
    borderRadius: "var(--radius-md)",
    border: "1px solid var(--color-border)",
    fontSize: "var(--font-base)",
    resize: "vertical",
    fontFamily: "inherit",
    minHeight: "80px",
    width: "100%",
  },
  submitBtn: {
    padding: "var(--space-sm) var(--space-md)",
    border: "none",
    borderRadius: "var(--radius-md)",
    background: "var(--color-primary)",
    color: "#fff",
    cursor: "pointer",
    fontSize: "var(--font-base)",
    fontWeight: 500,
    minHeight: "var(--touch-target)",
    width: "100%",
  },
  error: {
    color: "var(--color-error)",
    fontSize: "var(--font-sm)",
    padding: "var(--space-sm)",
    background: "var(--color-error-bg)",
    borderRadius: "var(--radius-md)",
    margin: 0,
    wordBreak: "break-word",
  },
  success: {
    color: "var(--color-success)",
    fontSize: "var(--font-sm)",
    padding: "var(--space-sm)",
    background: "var(--color-success-bg)",
    borderRadius: "var(--radius-md)",
    margin: 0,
  },
  section: {
    marginTop: "var(--space-lg)",
  },
  subheading: {
    margin: "0 0 var(--space-sm)",
    fontSize: "var(--font-base)",
    fontWeight: 600,
    color: "var(--color-text-muted)",
  },
  requestItem: {
    padding: "var(--space-sm)",
    marginBottom: "var(--space-sm)",
    borderRadius: "var(--radius-md)",
    border: "1px solid var(--color-border)",
    background: "var(--color-bg)",
  },
  requestHeader: {
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "var(--space-sm)",
    marginBottom: "var(--space-sm)",
    fontWeight: 600,
    fontSize: "var(--font-base)",
  },
  pendingBadge: {
    padding: "var(--space-xs) var(--space-sm)",
    borderRadius: "var(--radius-sm)",
    fontSize: "var(--font-xs)",
    fontWeight: 500,
    background: "var(--color-warning-bg)",
    color: "var(--color-warning)",
  },
  statusBadge: {
    padding: "var(--space-xs) var(--space-sm)",
    borderRadius: "var(--radius-sm)",
    fontSize: "var(--font-xs)",
    fontWeight: 500,
  },
  requestDetails: {
    fontSize: "var(--font-sm)",
    color: "var(--color-text-muted)",
    display: "flex",
    flexDirection: "column",
    gap: "var(--space-xs)",
    wordBreak: "break-all",
  },
  timestamp: {
    fontSize: "var(--font-sm)",
    color: "var(--color-text-light)",
    marginTop: "var(--space-xs)",
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
