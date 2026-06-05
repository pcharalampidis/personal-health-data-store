import { useState, useCallback } from "react";
import type { JsonRpcSigner, BrowserProvider } from "ethers";
import {
  getEmergencyAccessContract,
  getRecordManagerContract,
  getUserRegistryContract,
  EMERGENCY_ACCESS_ADDRESS,
} from "../services/contracts.js";

export interface EmergencyConfig {
  patient: string;
  trustedContacts: string[];
  sessionDuration: bigint;
  isConfigured: boolean;
}

export interface EmergencySession {
  sessionId: bigint;
  patient: string;
  doctor: string;
  status: number;
  triggerType: number;
  triggeredAt: bigint;
  activatedAt: bigint;
  expiresAt: bigint;
  encryptedOTP: string;
  recordsAccessed: bigint;
}

export interface EmergencyRecord {
  recordId: bigint;
  isEmergency: boolean;
  recordType: number;
}

export const SESSION_STATUS_LABELS = ["Pending", "Active", "Opened", "Expired", "Revoked"] as const;
export const TRIGGER_TYPE_LABELS = ["Trusted Contact", "Custodian Registry"] as const;

export function useEmergencyAccess(
  account: string | null,
  provider: BrowserProvider | null,
  signer: JsonRpcSigner | null
) {
  const [config, setConfig] = useState<EmergencyConfig | null>(null);
  const [mySessions, setMySessions] = useState<EmergencySession[]>([]);
  const [emergencyRecords, setEmergencyRecords] = useState<EmergencyRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const checkContractExists = useCallback(async (): Promise<boolean> => {
    if (!provider) return false;
    const code = await provider.getCode(EMERGENCY_ACCESS_ADDRESS);
    return code !== "0x";
  }, [provider]);

  const loadConfig = useCallback(async () => {
    if (!account || !provider) return;
    setLoading(true);
    setError("");

    try {
      const exists = await checkContractExists();
      if (!exists) {
        setError("EmergencyAccess contract not deployed.");
        return;
      }

      const contract = getEmergencyAccessContract(provider);
      const cfg = await contract.getEmergencyConfig(account);

      setConfig({
        patient: cfg.patient,
        trustedContacts: [...cfg.trustedContacts],
        sessionDuration: cfg.sessionDuration,
        isConfigured: cfg.isConfigured,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [account, provider, checkContractExists]);

  const loadEmergencyRecords = useCallback(async () => {
    if (!account || !provider) return;

    try {
      const recordContract = getRecordManagerContract(provider);
      const recordIds: bigint[] = await recordContract.getRecordsByOwner(account);

      const records: EmergencyRecord[] = [];
      for (const id of recordIds) {
        try {
          const record = await recordContract.getRecord(id);
          records.push({
            recordId: record.recordId,
            isEmergency: record.isEmergency,
            recordType: Number(record.recordType),
          });
        } catch {
          // Record may be deleted
        }
      }

      setEmergencyRecords(records);
    } catch (err) {
      console.error("Failed to load emergency records:", err);
    }
  }, [account, provider]);

  const loadSessions = useCallback(async (role: "patient" | "doctor") => {
    if (!account || !provider) return;
    setLoading(true);
    setError("");

    try {
      const exists = await checkContractExists();
      if (!exists) {
        setError("EmergencyAccess contract not deployed.");
        return;
      }

      const contract = getEmergencyAccessContract(provider);
      let sessions: any[] = [];
      if (role === "patient") {
        const patientSessions = await contract.getSessionsByPatient(account);
        const accessorSessions = await contract.getSessionsByDoctor(account);
        const combined = [...patientSessions, ...accessorSessions];
        const seen = new Set<string>();
        for (const s of combined) {
          const key = s.sessionId.toString();
          if (!seen.has(key)) {
            seen.add(key);
            sessions.push(s);
          }
        }
        sessions.sort((a, b) => Number(b.sessionId - a.sessionId));
      } else {
        sessions = await contract.getSessionsByDoctor(account);
      }

      const parsed: EmergencySession[] = sessions.map((s: any) => ({
        sessionId: s.sessionId,
        patient: s.patient,
        doctor: s.doctor,
        status: Number(s.status),
        triggerType: Number(s.triggerType),
        triggeredAt: s.triggeredAt,
        activatedAt: s.activatedAt,
        expiresAt: s.expiresAt,
        encryptedOTP: s.encryptedOTP,
        recordsAccessed: s.recordsAccessed,
      }));

      setMySessions(parsed);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [account, provider, checkContractExists]);

  const configureEmergencyAccess = useCallback(
    async (trustedContacts: string[], sessionDurationHours: number): Promise<boolean> => {
      if (!signer) return false;
      setError("");

      try {
        const contract = getEmergencyAccessContract(signer);
        const sessionDuration = BigInt(sessionDurationHours * 60 * 60);
        const tx = await contract.configureEmergencyAccess(trustedContacts, sessionDuration);
        await tx.wait();
        await loadConfig();
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        return false;
      }
    },
    [signer, loadConfig]
  );

  const updateEmergencyContacts = useCallback(
    async (newContacts: string[]): Promise<boolean> => {
      if (!signer) return false;
      setError("");

      try {
        const contract = getEmergencyAccessContract(signer);
        const tx = await contract.updateEmergencyContacts(newContacts);
        await tx.wait();
        await loadConfig();
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        return false;
      }
    },
    [signer, loadConfig]
  );

  const setRecordEmergencyFlag = useCallback(
    async (recordId: bigint, isEmergency: boolean): Promise<boolean> => {
      if (!signer) return false;
      setError("");

      try {
        const contract = getRecordManagerContract(signer);
        const tx = await contract.setEmergencyFlag(recordId, isEmergency);
        await tx.wait();
        await loadEmergencyRecords();
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        return false;
      }
    },
    [signer, loadEmergencyRecords]
  );

  const storeEmergencyKeys = useCallback(
    async (
      recordIds: bigint[],
      contacts: string[],
      encryptedKeys: string[]
    ): Promise<boolean> => {
      if (!signer) return false;
      setError("");

      try {
        const contract = getEmergencyAccessContract(signer);
        const tx = await contract.storeEmergencyKeys(recordIds, contacts, encryptedKeys);
        await tx.wait();
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        return false;
      }
    },
    [signer]
  );

  const triggerEmergencyAccess = useCallback(
    async (patientAddress: string): Promise<bigint | null> => {
      if (!signer) return null;
      setError("");

      try {
        const contract = getEmergencyAccessContract(signer);
        const tx = await contract.triggerEmergencyAccess(patientAddress);
        const receipt = await tx.wait();

        const event = receipt.logs.find(
          (log: { fragment?: { name: string } }) => log.fragment?.name === "EmergencyAccessTriggered"
        );

        if (event && event.args) {
          return event.args[0] as bigint;
        }

        return null;
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        return null;
      }
    },
    [signer]
  );

  const revokeSession = useCallback(
    async (sessionId: bigint): Promise<boolean> => {
      if (!signer) return false;
      setError("");

      try {
        const contract = getEmergencyAccessContract(signer);
        const tx = await contract.revokeEmergencySession(sessionId);
        await tx.wait();
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        return false;
      }
    },
    [signer]
  );

  const consumeEmergencyAccess = useCallback(
    async (sessionId: bigint): Promise<{ encryptedData: string; recordIds: bigint[] } | null> => {
      if (!signer || !provider) return null;
      setError("");

      try {
        const contract = getEmergencyAccessContract(signer);
        const tx = await contract.consumeEmergencyAccess(sessionId);
        await tx.wait();

        // After successful tx, read state directly (don't rely on event parsing)
        const session = await contract.getSession(sessionId);
        const recordContract = getRecordManagerContract(provider);
        const recordIds: bigint[] = await recordContract.getEmergencyRecords(session.patient);

        return {
          encryptedData: session.encryptedOTP,
          recordIds,
        };
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        return null;
      }
    },
    [signer, provider]
  );

  const isUserRegistered = useCallback(
    async (address: string): Promise<boolean> => {
      if (!provider) return false;

      try {
        const contract = getUserRegistryContract(provider);
        return await contract.isRegistered(address);
      } catch {
        return false;
      }
    },
    [provider]
  );

  const hasPatientEmergencyRecords = useCallback(
    async (patientAddress: string): Promise<boolean> => {
      if (!provider) return false;

      try {
        const contract = getRecordManagerContract(provider);
        const recordIds: bigint[] = await contract.getRecordsByOwner(patientAddress);

        for (const id of recordIds) {
          const record = await contract.getRecord(id);
          if (record.isEmergency) return true;
        }

        return false;
      } catch {
        return false;
      }
    },
    [provider]
  );

  return {
    config,
    mySessions,
    emergencyRecords,
    loading,
    error,
    loadConfig,
    loadEmergencyRecords,
    loadSessions,
    configureEmergencyAccess,
    updateEmergencyContacts,
    setRecordEmergencyFlag,
    storeEmergencyKeys,
    triggerEmergencyAccess,
    revokeSession,
    consumeEmergencyAccess,
    isUserRegistered,
    hasPatientEmergencyRecords,
  };
}
