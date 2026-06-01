import React, { useState } from "react";
import type { JsonRpcSigner, BrowserProvider } from "ethers";
import { isAddress } from "ethers";
import { usePermissions } from "../hooks/usePermissions.js";
import { RECORD_TYPES, getRecordManagerContract, getUserRegistryContract } from "../services/contracts.js";
import { fromHex, toHex } from "../utils/encryption.js";
import { importPublicKeyJWK, importPrivateKeyJWK, wrapAESKey, unwrapAESKey, getStoredPrivateKeyJWK } from "../utils/rsaKeys.js";
import { useDoctorProfiles } from "../hooks/useDoctorProfiles.js";
import { DoctorIdentityCard } from "./DoctorIdentityCard.js";
import type { DoctorIdentity } from "../types/profiles.js";

interface RecordInfo {
  recordId: bigint;
  recordType: number;
}

interface Props {
  account: string;
  provider: BrowserProvider;
  signer: JsonRpcSigner;
  records: RecordInfo[];
  onGranted?: () => void;
}

export function GrantAccess({ account, provider, signer, records, onGranted }: Props) {
  const { grantAccess, isDoctorVerified, error } = usePermissions(account, provider, signer);

  const [selectedRecord, setSelectedRecord] = useState("");
  const [doctorAddress, setDoctorAddress] = useState("");
  const [expiryDays, setExpiryDays] = useState("30");
  const [processing, setProcessing] = useState(false);
  const [localError, setLocalError] = useState("");
  const [success, setSuccess] = useState("");

  const { resolveDoctor } = useDoctorProfiles(provider);
  const [resolvedDoctor, setResolvedDoctor] = useState<DoctorIdentity | null>(null);
  const [lookingUp, setLookingUp] = useState(false);

  const handleLookup = async () => {
    setLocalError("");
    setSuccess("");
    setResolvedDoctor(null);

    if (!isAddress(doctorAddress)) {
      setLocalError("Invalid doctor wallet address");
      return;
    }

    setLookingUp(true);
    try {
      const doc = await resolveDoctor(doctorAddress);
      if (doc.isVerified) {
        setResolvedDoctor(doc);
      } else {
        setLocalError("This address is not registered as a doctor");
      }
    } catch (err) {
      setLocalError("Error looking up doctor");
    } finally {
      setLookingUp(false);
    }
  };

  const handleGrant = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError("");
    setSuccess("");

    if (!selectedRecord) {
      setLocalError("Please select a record");
      return;
    }

    if (!isAddress(doctorAddress)) {
      setLocalError("Invalid doctor wallet address");
      return;
    }

    const days = parseInt(expiryDays, 10);
    if (isNaN(days) || days < 1 || days > 365) {
      setLocalError("Expiry must be between 1 and 365 days");
      return;
    }

    if (!resolvedDoctor || !resolvedDoctor.isVerified) {
      setLocalError("Please look up a registered doctor profile before granting access.");
      return;
    }

    if (resolvedDoctor.address.toLowerCase() !== doctorAddress.toLowerCase()) {
      setLocalError("Doctor address changed. Please look up the doctor again.");
      return;
    }

    setProcessing(true);

    try {
      const recordId = BigInt(selectedRecord);
      const expiresAt = BigInt(Math.floor(Date.now() / 1000) + days * 24 * 60 * 60);

      // Unwrap patient's AES key
      const recordManager = getRecordManagerContract(signer);
      const patientWrappedHex: string = await recordManager.getEncryptedKey(recordId, account);
      const privJwk = getStoredPrivateKeyJWK(account);
      if (!privJwk) {
        setLocalError("Private key not found in browser. Re-register to generate keys.");
        setProcessing(false);
        return;
      }
      const rsaPrivKey = await importPrivateKeyJWK(privJwk);
      const aesKey = await unwrapAESKey(fromHex(patientWrappedHex), rsaPrivKey);

      // Wrap for doctor
      const userRegistry = getUserRegistryContract(signer);
      const doctorPubHex: string = await userRegistry.getPublicKey(doctorAddress);
      const doctorPubJson = new TextDecoder().decode(fromHex(doctorPubHex));
      const doctorRsaPub = await importPublicKeyJWK(doctorPubJson);
      const doctorWrapped = await wrapAESKey(aesKey, doctorRsaPub);
      const doctorWrappedHex = toHex(doctorWrapped);

      const success = await grantAccess(recordId, resolvedDoctor.address, expiresAt, doctorWrappedHex);

      if (success) {
        setSuccess(`Access granted to ${resolvedDoctor.displayName} for ${days} days`);
        setDoctorAddress("");
        setResolvedDoctor(null);
        setSelectedRecord("");
        onGranted?.();
      }
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : String(err));
    } finally {
      setProcessing(false);
    }
  };

  const activeRecords = records.filter((r) => true);

  const normalizedDoctorInput = doctorAddress.toLowerCase();

  const lookupMatchesInput =
    resolvedDoctor &&
    resolvedDoctor.address.toLowerCase() === normalizedDoctorInput;

  const canSubmitGrant =
    Boolean(selectedRecord) &&
    isAddress(doctorAddress) &&
    Boolean(resolvedDoctor?.isVerified) &&
    Boolean(lookupMatchesInput) &&
    !processing &&
    !lookingUp;

  return (
    <div style={styles.card}>
      <h3 style={styles.heading}>Grant Direct Access</h3>
      <p style={styles.description}>
        Share a health record directly with a registered doctor profile without waiting for a request.
      </p>

      <form onSubmit={handleGrant} style={styles.form}>
        <div style={styles.field}>
          <label style={styles.label}>Select Record</label>
          <select
            style={styles.select}
            value={selectedRecord}
            onChange={(e) => setSelectedRecord(e.target.value)}
            disabled={processing}
          >
            <option value="">-- Select a record --</option>
            {activeRecords.map((r) => (
              <option key={String(r.recordId)} value={String(r.recordId)}>
                #{String(r.recordId)} - {RECORD_TYPES[r.recordType] || "Unknown"}
              </option>
            ))}
          </select>
        </div>

        <div style={styles.field}>
          <label style={styles.label}>Doctor Wallet Address</label>
          <div style={styles.lookupContainer}>
            <input
              type="text"
              style={{ ...styles.input, flex: 1 }}
              placeholder="0x..."
              value={doctorAddress}
              onChange={(e) => {
                setDoctorAddress(e.target.value);
                setResolvedDoctor(null);
                setLocalError("");
              }}
              disabled={processing || lookingUp}
            />
            <button
              type="button"
              onClick={handleLookup}
              style={styles.lookupBtn}
              disabled={processing || lookingUp || !doctorAddress}
            >
              {lookingUp ? "Searching..." : "Lookup Doctor"}
            </button>
          </div>
        </div>

        {resolvedDoctor && (
          <div style={styles.profileCardWrapper}>
            <DoctorIdentityCard profile={resolvedDoctor} compact={false} />
          </div>
        )}

        <div style={styles.field}>
          <label style={styles.label}>Access Duration (days)</label>
          <input
            type="number"
            style={styles.input}
            min="1"
            max="365"
            value={expiryDays}
            onChange={(e) => setExpiryDays(e.target.value)}
            disabled={processing}
          />
        </div>

        {(localError || error) && (
          <p style={styles.error}>{localError || error}</p>
        )}
        {success && <p style={styles.success}>{success}</p>}

        <button
          type="submit"
          style={styles.submitBtn}
          disabled={!canSubmitGrant}
        >
          {processing
            ? "Processing..."
            : resolvedDoctor
            ? `Grant Access to ${resolvedDoctor.displayName}`
            : "Look up doctor first"}
        </button>
      </form>
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
  lookupContainer: {
    display: "flex",
    gap: "var(--space-sm)",
  },
  lookupBtn: {
    padding: "var(--space-sm) var(--space-md)",
    border: "1px solid var(--color-primary)",
    borderRadius: "var(--radius-md)",
    background: "var(--color-bg)",
    color: "var(--color-primary)",
    cursor: "pointer",
    fontSize: "var(--font-sm)",
    fontWeight: 600,
    minHeight: "var(--touch-target)",
  },
  profileCardWrapper: {
    marginTop: "var(--space-xs)",
    marginBottom: "var(--space-xs)",
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
  select: {
    padding: "var(--space-sm)",
    borderRadius: "var(--radius-md)",
    border: "1px solid var(--color-border)",
    fontSize: "var(--font-base)",
    background: "var(--color-bg)",
    minHeight: "var(--touch-target)",
    width: "100%",
  },
  input: {
    padding: "var(--space-sm)",
    borderRadius: "var(--radius-md)",
    border: "1px solid var(--color-border)",
    fontSize: "var(--font-base)",
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
  submitBtn: {
    padding: "var(--space-sm) var(--space-md)",
    border: "none",
    borderRadius: "var(--radius-md)",
    background: "var(--color-primary)",
    color: "#fff",
    cursor: "pointer",
    fontSize: "var(--font-base)",
    fontWeight: 500,
    marginTop: "var(--space-sm)",
    minHeight: "var(--touch-target)",
    width: "100%",
  },
};
