import React, { useState } from "react";
import type { JsonRpcSigner, BrowserProvider } from "ethers";
import { isAddress } from "ethers";
import { useEmergencyAccess, TRIGGER_TYPE_LABELS } from "../hooks/useEmergencyAccess.js";
import { getUserRegistryContract } from "../services/contracts.js";
import { ConfirmModal } from "./ConfirmModal.js";

interface Props {
  account: string;
  provider: BrowserProvider;
  signer: JsonRpcSigner;
  onTriggered?: () => void;
}

export function EmergencyTrigger({ account, provider, signer, onTriggered }: Props) {
  const {
    error,
    triggerEmergencyAccess,
    hasPatientEmergencyRecords,
  } = useEmergencyAccess(account, provider, signer);

  const [patientAddress, setPatientAddress] = useState("");
  const [processing, setProcessing] = useState(false);
  const [checking, setChecking] = useState(false);
  const [localError, setLocalError] = useState("");
  const [success, setSuccess] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);
  const [patientInfo, setPatientInfo] = useState<{
    isValid: boolean;
    hasEmergencyRecords: boolean;
    isTrustedContact: boolean;
  } | null>(null);

  const checkPatient = async () => {
    setLocalError("");
    setSuccess("");
    setPatientInfo(null);

    if (!isAddress(patientAddress)) {
      setLocalError("Invalid patient wallet address");
      return;
    }

    setChecking(true);

    try {
      const userRegistry = getUserRegistryContract(provider);

      const isRegistered = await userRegistry.isRegistered(patientAddress);
      if (!isRegistered) {
        setLocalError("Address is not a registered user");
        setChecking(false);
        return;
      }

      const role = await userRegistry.getUserRole(patientAddress);
      if (Number(role) !== 1) {
        setLocalError("Address is not a patient");
        setChecking(false);
        return;
      }

      const hasEmergencyRecords = await hasPatientEmergencyRecords(patientAddress);

      const { getEmergencyAccessContract } = await import("../services/contracts.js");
      const emergencyContract = getEmergencyAccessContract(provider);
      const isTrustedContact = await emergencyContract.isEmergencyContact(account, patientAddress);

      setPatientInfo({
        isValid: true,
        hasEmergencyRecords,
        isTrustedContact,
      });
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : String(err));
    } finally {
      setChecking(false);
    }
  };

  const handleTrigger = async () => {
    setLocalError("");
    setSuccess("");
    setProcessing(true);

    try {
      const sessionId = await triggerEmergencyAccess(patientAddress);

      if (sessionId !== null) {
        const triggerType = patientInfo?.isTrustedContact ? 0 : 1;
        setSuccess(
          `Emergency access requested. Session #${sessionId} created (${TRIGGER_TYPE_LABELS[triggerType]}). ` +
            (triggerType === 0
              ? "You have immediate access."
              : "Awaiting Custodian validation...")
        );
        setPatientAddress("");
        setPatientInfo(null);
        onTriggered?.();
      }
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : String(err));
    } finally {
      setProcessing(false);
    }
  };

  const formatAddress = (addr: string) =>
    `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  return (
    <div style={styles.card}>
      <h2 style={styles.heading}>Request Emergency Access</h2>
      <p style={styles.description}>
        Use this only when the patient cannot provide consent. Emergency access is temporary and permanently logged.
      </p>

      <div style={styles.warningBox}>
        <strong>Important:</strong> Emergency access should only be used for genuine medical emergencies.
        All access is logged on-chain for audit purposes.
      </div>

      <div style={styles.form}>
        <div style={styles.field}>
          <label style={styles.label}>Patient Wallet Address</label>
          <div style={styles.inputRow}>
            <input
              type="text"
              style={styles.input}
              placeholder="0x..."
              value={patientAddress}
              onChange={(e) => {
                setPatientAddress(e.target.value);
                setPatientInfo(null);
              }}
              disabled={processing || checking}
            />
            <button
              type="button"
              style={styles.checkBtn}
              onClick={checkPatient}
              disabled={processing || checking || !patientAddress}
            >
              {checking ? "Checking..." : "Check"}
            </button>
          </div>
        </div>

        {patientInfo && (
          <div style={styles.patientInfo}>
            <div style={styles.infoRow}>
              <span>Patient:</span>
              <span style={styles.mono}>{formatAddress(patientAddress)}</span>
            </div>
            <div style={styles.infoRow}>
              <span>Emergency Records:</span>
              <span
                style={{
                  color: patientInfo.hasEmergencyRecords ? "#2e7d32" : "#c62828",
                }}
              >
                {patientInfo.hasEmergencyRecords ? "Yes" : "No"}
              </span>
            </div>
            <div style={styles.infoRow}>
              <span>Access Type:</span>
              <span
                style={{
                  fontWeight: 500,
                  color: patientInfo.isTrustedContact ? "#2e7d32" : "#e65100",
                }}
              >
                {patientInfo.isTrustedContact
                  ? "Trusted Contact (Immediate)"
                  : "Custodian Registry (Requires Validation)"}
              </span>
            </div>

            {!patientInfo.hasEmergencyRecords && (
              <p style={styles.warningText}>
                This patient has no emergency-flagged records.
                Emergency access cannot be triggered.
              </p>
            )}

            {patientInfo.hasEmergencyRecords && !patientInfo.isTrustedContact && (
              <p style={styles.infoText}>
                You are not a trusted contact. Your request will be validated by the Custodian
                against the healthcare provider registry. If approved, you will receive an OTP.
              </p>
            )}
          </div>
        )}

        {patientInfo?.hasEmergencyRecords && (
          <button
            style={styles.triggerBtn}
            onClick={() => setShowConfirm(true)}
            disabled={processing}
          >
            {processing ? "Requesting..." : "Request Emergency Access"}
          </button>
        )}

        {(localError || error) && <p style={styles.error}>{localError || error}</p>}
        {success && <p style={styles.success}>{success}</p>}
      </div>
      {showConfirm && (
        <ConfirmModal
          title="Request emergency access?"
          message="Use this only when the patient cannot provide consent. Emergency access is temporary and permanently logged."
          confirmLabel="Request access"
          confirmStyle="danger"
          onConfirm={() => { setShowConfirm(false); handleTrigger(); }}
          onCancel={() => setShowConfirm(false)}
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
    margin: "0 0 var(--space-sm)",
    fontSize: "var(--font-lg)",
    fontWeight: 600,
  },
  description: {
    margin: "0 0 var(--space-md)",
    fontSize: "var(--font-sm)",
    color: "var(--color-text-muted)",
  },
  warningBox: {
    padding: "var(--space-sm)",
    marginBottom: "var(--space-md)",
    background: "var(--color-warning-bg)",
    border: "1px solid #ffcc80",
    borderRadius: "var(--radius-md)",
    fontSize: "var(--font-sm)",
    color: "var(--color-warning)",
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
  checkBtn: {
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
  patientInfo: {
    padding: "var(--space-sm)",
    background: "var(--color-bg)",
    borderRadius: "var(--radius-md)",
    border: "1px solid var(--color-border)",
  },
  infoRow: {
    display: "flex",
    flexDirection: "column",
    gap: "var(--space-xs)",
    padding: "var(--space-sm) 0",
    fontSize: "var(--font-sm)",
    borderBottom: "1px solid var(--color-border)",
  },
  mono: {
    fontFamily: "monospace",
    fontSize: "var(--font-sm)",
    wordBreak: "break-all",
  },
  warningText: {
    marginTop: "var(--space-sm)",
    marginBottom: 0,
    padding: "var(--space-sm)",
    background: "var(--color-error-bg)",
    borderRadius: "var(--radius-sm)",
    fontSize: "var(--font-sm)",
    color: "var(--color-error)",
  },
  infoText: {
    marginTop: "var(--space-sm)",
    marginBottom: 0,
    padding: "var(--space-sm)",
    background: "var(--color-info-bg)",
    borderRadius: "var(--radius-sm)",
    fontSize: "var(--font-sm)",
    color: "var(--color-info)",
  },
  triggerBtn: {
    padding: "var(--space-sm) var(--space-lg)",
    border: "none",
    borderRadius: "var(--radius-md)",
    background: "var(--color-error)",
    color: "#fff",
    cursor: "pointer",
    fontSize: "var(--font-base)",
    fontWeight: 600,
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
};
