import { useState, useCallback } from "react";
import type { JsonRpcSigner, BrowserProvider } from "ethers";
import {
  getAccessControlContract,
  getRecordManagerContract,
  getUserRegistryContract,
  ACCESS_CONTROL_ADDRESS,
} from "../services/contracts.js";

export interface DoctorRequest {
  requestId: bigint;
  doctor: string;
  patient: string;
  recordIds: bigint[];
  reason: string;
  status: number;
  requestedAt: bigint;
  respondedAt: bigint;
}

export interface SharedRecord {
  recordId: bigint;
  owner: string;
  ipfsCID: string;
  recordType: number;
  status: number;
  isEmergency: boolean;
  createdAt: bigint;
  hasAccess: boolean;
  encryptedKey: string;
}

export const REQUEST_STATUS_LABELS = ["Pending", "Approved", "Rejected", "Expired"] as const;

export function useDoctorAccess(
  account: string | null,
  provider: BrowserProvider | null,
  signer: JsonRpcSigner | null
) {
  const [myRequests, setMyRequests] = useState<DoctorRequest[]>([]);
  const [sharedRecords, setSharedRecords] = useState<SharedRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const checkContractExists = useCallback(async (): Promise<boolean> => {
    if (!provider) return false;
    const code = await provider.getCode(ACCESS_CONTROL_ADDRESS);
    return code !== "0x";
  }, [provider]);

  const loadMyRequests = useCallback(async () => {
    if (!account || !provider) return;
    setLoading(true);
    setError("");

    try {
      const exists = await checkContractExists();
      if (!exists) {
        setError("AccessControl contract not deployed. Run deploy:local first.");
        return;
      }

      const contract = getAccessControlContract(provider);
      const requests = await contract.getRequestsByDoctor(account);

      const parsed: DoctorRequest[] = requests.map((r: DoctorRequest) => ({
        requestId: r.requestId,
        doctor: r.doctor,
        patient: r.patient,
        recordIds: [...r.recordIds],
        reason: r.reason,
        status: Number(r.status),
        requestedAt: r.requestedAt,
        respondedAt: r.respondedAt,
      }));

      setMyRequests(parsed);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [account, provider, checkContractExists]);

  const loadSharedRecords = useCallback(async () => {
    if (!account || !provider) return;
    setLoading(true);
    setError("");

    try {
      const exists = await checkContractExists();
      if (!exists) {
        setError("AccessControl contract not deployed. Run deploy:local first.");
        return;
      }

      const accessContract = getAccessControlContract(provider);
      const recordContract = getRecordManagerContract(provider);

      const recordIds: bigint[] = await accessContract.getSharedRecords(account);

      const loaded: SharedRecord[] = [];
      for (const id of recordIds) {
        try {
          const record = await recordContract.getRecord(id);
          const [hasAccess, encryptedKey] = await accessContract.checkAccess(account, id);

          loaded.push({
            recordId: record.recordId,
            owner: record.owner,
            ipfsCID: record.ipfsCID,
            recordType: Number(record.recordType),
            status: Number(record.status),
            isEmergency: record.isEmergency,
            createdAt: record.createdAt,
            hasAccess,
            encryptedKey,
          });
        } catch {
          // Record may have been deleted or access expired
        }
      }

      setSharedRecords(loaded.filter((r) => r.hasAccess));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [account, provider, checkContractExists]);

  const requestAccess = useCallback(
    async (
      patientAddress: string,
      recordIds: bigint[],
      reason: string
    ): Promise<boolean> => {
      if (!signer) return false;
      setError("");

      try {
        const contract = getAccessControlContract(signer);
        const tx = await contract.requestAccess(patientAddress, recordIds, reason);
        await tx.wait();
        await loadMyRequests();
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        return false;
      }
    },
    [signer, loadMyRequests]
  );

  const logRecordAccess = useCallback(
    async (recordId: bigint): Promise<boolean> => {
      if (!signer) return false;

      try {
        const contract = getAccessControlContract(signer);
        const tx = await contract.logAccess(recordId, 0); // 0 = VIEW access type
        await tx.wait();
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        return false;
      }
    },
    [signer]
  );

  const isPatientRegistered = useCallback(
    async (patientAddress: string): Promise<boolean> => {
      if (!provider) return false;

      try {
        const contract = getUserRegistryContract(provider);
        const isRegistered = await contract.isRegistered(patientAddress);
        if (!isRegistered) return false;

        const role = await contract.getUserRole(patientAddress);
        return Number(role) === 1; // Role.Patient = 1
      } catch {
        return false;
      }
    },
    [provider]
  );

  const getPatientRecordIds = useCallback(
    async (patientAddress: string): Promise<bigint[]> => {
      if (!provider) return [];

      try {
        const contract = getRecordManagerContract(provider);
        return await contract.getRecordsByOwner(patientAddress);
      } catch {
        return [];
      }
    },
    [provider]
  );

  return {
    myRequests,
    sharedRecords,
    loading,
    error,
    loadMyRequests,
    loadSharedRecords,
    requestAccess,
    logRecordAccess,
    isPatientRegistered,
    getPatientRecordIds,
  };
}
