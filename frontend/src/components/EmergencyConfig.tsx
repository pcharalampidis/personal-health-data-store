import React, { useState, useEffect } from "react";
import type { JsonRpcSigner, BrowserProvider } from "ethers";
import { isAddress } from "ethers";
import { useEmergencyAccess } from "../hooks/useEmergencyAccess.js";
import { RECORD_TYPES, getRecordManagerContract, getUserRegistryContract, getEmergencyAccessContract } from "../services/contracts.js";
import { fromHex, toHex } from "../utils/encryption.js";
import { importPublicKeyJWK, importPrivateKeyJWK, wrapAESKey, unwrapAESKey, getStoredPrivateKeyJWK } from "../utils/rsaKeys.js";

interface Props {
  account: string;
  provider: BrowserProvider;
  signer: JsonRpcSigner;
}

export function EmergencyConfig({ account, provider, signer }: Props) {
  const {
    config,
    emergencyRecords,
    loading,
    error,
    loadConfig,
    loadEmergencyRecords,
    configureEmergencyAccess,
    updateEmergencyContacts,
    setRecordEmergencyFlag,
    storeEmergencyKeys,
    isUserRegistered,
  } = useEmergencyAccess(account, provider, signer);

  const [contacts, setContacts] = useState<string[]>([""]);
  const [sessionDuration, setSessionDuration] = useState(24);
  const [processing, setProcessing] = useState(false);
  const [localError, setLocalError] = useState("");
  const [success, setSuccess] = useState("");
  const [togglingRecord, setTogglingRecord] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    loadConfig();
    loadEmergencyRecords();
  }, [loadConfig, loadEmergencyRecords]);

  useEffect(() => {
    if (config?.isConfigured) {
      setContacts(config.trustedContacts.length > 0 ? config.trustedContacts : [""]);
      setSessionDuration(Number(config.sessionDuration) / 3600);
    }
  }, [config]);

  const addContact = () => setContacts([...contacts, ""]);

  const removeContact = (index: number) => {
    if (contacts.length > 1) {
      setContacts(contacts.filter((_, i) => i !== index));
    }
  };

  const updateContact = (index: number, value: string) => {
    const updated = [...contacts];
    updated[index] = value;
    setContacts(updated);
  };

  const validateContacts = async (): Promise<string[]> => {
    const valid: string[] = [];
    const errors: string[] = [];

    for (const contact of contacts) {
      const trimmed = contact.trim();
      if (!trimmed) continue;

      const preview = trimmed.length > 10 ? `${trimmed.slice(0, 10)}...` : trimmed;

      if (!isAddress(trimmed)) {
        errors.push(`Invalid address: ${preview}`);
        continue;
      }

      const registered = await isUserRegistered(trimmed);
      if (!registered) {
        errors.push(`Not registered: ${preview}`);
        continue;
      }

      valid.push(trimmed);
    }

    if (errors.length > 0) {
      setLocalError(errors.join("; "));
      return [];
    }

    return valid;
  };

  const handleSaveConfig = async () => {
    setLocalError("");
    setSuccess("");
    setProcessing(true);

    try {
      const validContacts = await validateContacts();
      if (validContacts.length === 0) {
        setLocalError("Please add at least one valid registered contact");
        setProcessing(false);
        return;
      }

      if (sessionDuration < 1 || sessionDuration > 72) {
        setLocalError("Session duration must be between 1 and 72 hours");
        setProcessing(false);
        return;
      }

      let ok: boolean;
      if (config?.isConfigured) {
        ok = await updateEmergencyContacts(validContacts);
      } else {
        ok = await configureEmergencyAccess(validContacts, sessionDuration);
      }

      if (ok) {
        setSuccess("Emergency access configured successfully");
      }
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : String(err));
    } finally {
      setProcessing(false);
    }
  };

  const handleToggleEmergency = async (recordId: bigint, currentState: boolean) => {
    setTogglingRecord(String(recordId));
    setLocalError("");

    try {
      await setRecordEmergencyFlag(recordId, !currentState);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : String(err));
    } finally {
      setTogglingRecord(null);
    }
  };

  const handleSyncEmergencyKeys = async () => {
    if (!config?.isConfigured) {
      setLocalError("Configure emergency access first");
      return;
    }

    const flaggedRecords = emergencyRecords.filter((r) => r.isEmergency);
    if (flaggedRecords.length === 0) {
      setLocalError("No emergency-flagged records to sync");
      return;
    }

    setSyncing(true);
    setLocalError("");
    setSuccess("");

    try {
      const privJwk = getStoredPrivateKeyJWK(account);
      if (!privJwk) throw new Error("Private key not found. Re-register to generate keys.");
      const rsaPrivKey = await importPrivateKeyJWK(privJwk);

      const recordManager = getRecordManagerContract(signer);
      const userRegistry = getUserRegistryContract(signer);
      const trustedContacts = config.trustedContacts;

      // Pre-fetch contact public keys
      const contactPubKeys: CryptoKey[] = [];
      for (const contact of trustedContacts) {
        const pubHex: string = await userRegistry.getPublicKey(contact);
        const pubJson = new TextDecoder().decode(fromHex(pubHex));
        contactPubKeys.push(await importPublicKeyJWK(pubJson));
      }

      // Fetch Custodian public key
      let custodianPubKey: CryptoKey | null = null;
      try {
        const res = await fetch("/api/custodian/public-key");
        if (res.ok) {
          const { publicKeyHex } = await res.json();
          const custodianPubJson = new TextDecoder().decode(fromHex(publicKeyHex));
          custodianPubKey = await importPublicKeyJWK(custodianPubJson);
        }
      } catch { /* Custodian endpoint may not be available */ }

      const recordIds = flaggedRecords.map((r) => r.recordId);
      // Keys order for trusted contacts: [rec0-contact0, rec0-contact1, ..., rec1-contact0, ...]
      const wrappedKeys: string[] = [];
      const custodianWrappedKeys: string[] = [];

      for (const record of flaggedRecords) {
        const patientWrappedHex: string = await recordManager.getEncryptedKey(record.recordId, account);
        const aesKey = await unwrapAESKey(fromHex(patientWrappedHex), rsaPrivKey);

        for (const contactPub of contactPubKeys) {
          const wrapped = await wrapAESKey(aesKey, contactPub);
          wrappedKeys.push(toHex(wrapped));
        }

        // Wrap for Custodian
        if (custodianPubKey) {
          const custWrapped = await wrapAESKey(aesKey, custodianPubKey);
          custodianWrappedKeys.push(toHex(custWrapped));
        }
      }

      // Store trusted-contact wrapped keys
      const ok = await storeEmergencyKeys(recordIds, trustedContacts, wrappedKeys);

      // Store custodian-wrapped keys
      if (custodianPubKey && custodianWrappedKeys.length > 0) {
        const emergencyContract = getEmergencyAccessContract(signer);
        const tx = await emergencyContract.storeCustodianEmergencyKeys(recordIds, custodianWrappedKeys);
        await tx.wait();
      }

      if (ok) setSuccess("Emergency keys synced for trusted contacts and Custodian");
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : String(err));
    } finally {
      setSyncing(false);
    }
  };

  const formatAddress = (addr: string) =>
    `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  const emergencyCount = emergencyRecords.filter((r) => r.isEmergency).length;

  return (
    <div style={styles.card}>
      <h2 style={styles.heading}>Emergency Access Configuration</h2>
      <p style={styles.description}>
        Configure trusted contacts who can access your emergency-flagged records in case of an emergency.
      </p>

      {loading && <p style={styles.muted}>Loading configuration...</p>}

      <div style={styles.section}>
        <h3 style={styles.subheading}>Trusted Contacts</h3>
        <p style={styles.hint}>
          These users can immediately access your emergency records without Custodian validation.
          They must be registered users (can be doctors or family members).
        </p>

        {contacts.map((contact, index) => (
          <div key={index} style={styles.contactRow}>
            <input
              type="text"
              style={styles.input}
              placeholder="0x... (wallet address)"
              value={contact}
              onChange={(e) => updateContact(index, e.target.value)}
              disabled={processing}
            />
            {contacts.length > 1 && (
              <button
                type="button"
                style={styles.removeBtn}
                onClick={() => removeContact(index)}
                disabled={processing}
              >
                ×
              </button>
            )}
          </div>
        ))}

        <button
          type="button"
          style={styles.addBtn}
          onClick={addContact}
          disabled={processing}
        >
          + Add Contact
        </button>
      </div>

      <div style={styles.section}>
        <h3 style={styles.subheading}>Session Duration</h3>
        <div style={styles.durationRow}>
          <input
            type="number"
            style={styles.durationInput}
            min={1}
            max={72}
            value={sessionDuration}
            onChange={(e) => setSessionDuration(Number(e.target.value))}
            disabled={processing || config?.isConfigured}
          />
          <span style={styles.durationLabel}>hours (1-72)</span>
        </div>
        {config?.isConfigured && (
          <p style={styles.hint}>
            Duration cannot be changed after initial configuration.
          </p>
        )}
      </div>

      <button
        style={styles.saveBtn}
        onClick={handleSaveConfig}
        disabled={processing}
      >
        {processing
          ? "Saving..."
          : config?.isConfigured
          ? "Update Contacts"
          : "Configure Emergency Access"}
      </button>

      {(localError || error) && <p style={styles.error}>{localError || error}</p>}
      {success && <p style={styles.success}>{success}</p>}

      <div style={styles.section}>
        <h3 style={styles.subheading}>
          Emergency Records ({emergencyCount} of {emergencyRecords.length})
        </h3>
        <p style={styles.hint}>
          Toggle which records should be accessible during an emergency.
        </p>

        {emergencyRecords.length === 0 ? (
          <p style={styles.muted}>No records found. Upload records first.</p>
        ) : (
          <div style={styles.recordList}>
            {emergencyRecords.map((record) => (
              <div key={String(record.recordId)} style={styles.recordItem}>
                <div style={styles.recordInfo}>
                  <span style={styles.recordId}>#{String(record.recordId)}</span>
                  <span style={styles.recordType}>
                    {RECORD_TYPES[record.recordType] || "Unknown"}
                  </span>
                </div>
                <button
                  style={{
                    ...styles.toggleBtn,
                    background: record.isEmergency ? "#e8f5e9" : "#f5f5f5",
                    color: record.isEmergency ? "#2e7d32" : "#666",
                    borderColor: record.isEmergency ? "#a5d6a7" : "#ddd",
                  }}
                  onClick={() => handleToggleEmergency(record.recordId, record.isEmergency)}
                  disabled={togglingRecord === String(record.recordId)}
                >
                  {togglingRecord === String(record.recordId)
                    ? "..."
                    : record.isEmergency
                    ? "Emergency"
                    : "Not Emergency"}
                </button>
              </div>
            ))}

            {config?.isConfigured && emergencyCount > 0 && (
              <button
                style={{ ...styles.saveBtn, marginTop: "var(--space-sm)" }}
                onClick={handleSyncEmergencyKeys}
                disabled={syncing}
              >
                {syncing ? "Preparing Keys..." : "Prepare Emergency Access Keys"}
              </button>
            )}
          </div>
        )}
      </div>

      {config?.isConfigured && (
        <div style={styles.statusBox}>
          <strong>Status:</strong> Configured
          <br />
          <strong>Trusted Contacts:</strong>{" "}
          {config.trustedContacts.map(formatAddress).join(", ") || "None"}
          <br />
          <strong>Session Duration:</strong> {Number(config.sessionDuration) / 3600} hours
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
  description: {
    margin: "0 0 var(--space-md)",
    fontSize: "var(--font-sm)",
    color: "var(--color-text-muted)",
  },
  section: {
    marginBottom: "var(--space-lg)",
  },
  subheading: {
    margin: "0 0 var(--space-sm)",
    fontSize: "var(--font-base)",
    fontWeight: 600,
    color: "var(--color-text-muted)",
  },
  hint: {
    fontSize: "var(--font-sm)",
    color: "var(--color-text-light)",
    margin: "0 0 var(--space-sm)",
  },
  muted: {
    color: "var(--color-text-light)",
    fontSize: "var(--font-base)",
  },
  contactRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: "var(--space-sm)",
    marginBottom: "var(--space-sm)",
  },
  input: {
    flex: "1 1 200px",
    padding: "var(--space-sm)",
    borderRadius: "var(--radius-md)",
    border: "1px solid var(--color-border)",
    fontSize: "var(--font-base)",
    minHeight: "var(--touch-target)",
  },
  removeBtn: {
    padding: "var(--space-sm)",
    border: "1px solid var(--color-border)",
    borderRadius: "var(--radius-md)",
    background: "var(--color-bg)",
    color: "var(--color-error)",
    cursor: "pointer",
    fontSize: "var(--font-lg)",
    fontWeight: 600,
    minWidth: "var(--touch-target)",
    minHeight: "var(--touch-target)",
  },
  addBtn: {
    padding: "var(--space-sm) var(--space-md)",
    border: "1px dashed var(--color-text-light)",
    borderRadius: "var(--radius-md)",
    background: "transparent",
    color: "var(--color-text-muted)",
    cursor: "pointer",
    fontSize: "var(--font-sm)",
    minHeight: "var(--touch-target)",
    width: "100%",
  },
  durationRow: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: "var(--space-sm)",
  },
  durationInput: {
    width: "100px",
    padding: "var(--space-sm)",
    borderRadius: "var(--radius-md)",
    border: "1px solid var(--color-border)",
    fontSize: "var(--font-base)",
    minHeight: "var(--touch-target)",
  },
  durationLabel: {
    fontSize: "var(--font-base)",
    color: "var(--color-text-muted)",
  },
  saveBtn: {
    padding: "var(--space-sm) var(--space-lg)",
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
    marginTop: "var(--space-sm)",
    wordBreak: "break-word",
  },
  success: {
    color: "var(--color-success)",
    fontSize: "var(--font-sm)",
    padding: "var(--space-sm)",
    background: "var(--color-success-bg)",
    borderRadius: "var(--radius-md)",
    marginTop: "var(--space-sm)",
  },
  recordList: {
    display: "flex",
    flexDirection: "column",
    gap: "var(--space-sm)",
  },
  recordItem: {
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "var(--space-sm)",
    padding: "var(--space-sm)",
    background: "var(--color-bg)",
    borderRadius: "var(--radius-md)",
    border: "1px solid var(--color-border)",
  },
  recordInfo: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: "var(--space-sm)",
    flex: "1 1 auto",
    minWidth: 0,
  },
  recordId: {
    fontFamily: "monospace",
    fontWeight: 600,
    fontSize: "var(--font-base)",
  },
  recordType: {
    fontSize: "var(--font-sm)",
    color: "var(--color-text-muted)",
  },
  toggleBtn: {
    padding: "var(--space-sm) var(--space-md)",
    border: "1px solid",
    borderRadius: "var(--radius-md)",
    cursor: "pointer",
    fontSize: "var(--font-sm)",
    fontWeight: 500,
    minHeight: "var(--touch-target)",
    whiteSpace: "nowrap",
  },
  statusBox: {
    marginTop: "var(--space-md)",
    padding: "var(--space-sm)",
    background: "var(--color-info-bg)",
    borderRadius: "var(--radius-md)",
    fontSize: "var(--font-sm)",
    lineHeight: 1.6,
    wordBreak: "break-all",
  },
};
