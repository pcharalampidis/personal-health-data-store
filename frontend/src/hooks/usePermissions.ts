import { useState, useCallback } from "react";
import type { JsonRpcSigner, BrowserProvider } from "ethers";
import {
  getAccessControlContract,
  getUserRegistryContract,
  ACCESS_CONTROL_ADDRESS,
} from "../services/contracts.js";

export interface AccessRequest {
  requestId: bigint;
  doctor: string;
  patient: string;
  recordIds: bigint[];
  reason: string;
  status: number;
  requestedAt: bigint;
  respondedAt: bigint;
}

export interface Permission {
  isActive: boolean;
  grantedBy: string;
  grantedTo: string;
  recordId: bigint;
  grantedAt: bigint;
  expiresAt: bigint;
  revokedAt: bigint;
}

export const REQUEST_STATUS = ["Pending", "Approved", "Rejected", "Expired"] as const;

export function usePermissions(
  account: string | null,
  provider: BrowserProvider | null,
  signer: JsonRpcSigner | null
) {
  const [pendingRequests, setPendingRequests] = useState<AccessRequest[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const checkContractExists = useCallback(async (): Promise<boolean> => {
    if (!provider) return false;
    const code = await provider.getCode(ACCESS_CONTROL_ADDRESS);
    return code !== "0x";
  }, [provider]);

  const loadPendingRequests = useCallback(async () => {
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
      const requests = await contract.getPendingRequests(account);

      const parsed: AccessRequest[] = requests.map((r: AccessRequest) => ({
        requestId: r.requestId,
        doctor: r.doctor,
        patient: r.patient,
        recordIds: [...r.recordIds],
        reason: r.reason,
        status: Number(r.status),
        requestedAt: r.requestedAt,
        respondedAt: r.respondedAt,
      }));

      setPendingRequests(parsed.filter((r) => r.status === 0));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [account, provider, checkContractExists]);

  const loadPermissions = useCallback(async () => {
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
      const perms = await contract.getPermissionsByOwner(account);

      const parsed: Permission[] = perms.map((p: Permission) => ({
        isActive: p.isActive,
        grantedBy: p.grantedBy,
        grantedTo: p.grantedTo,
        recordId: p.recordId,
        grantedAt: p.grantedAt,
        expiresAt: p.expiresAt,
        revokedAt: p.revokedAt,
      }));

      setPermissions(parsed);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [account, provider, checkContractExists]);

  const approveRequest = useCallback(
    async (
      requestId: bigint,
      expiresAt: bigint,
      encryptedKeys: string[]
    ): Promise<boolean> => {
      if (!signer) return false;
      setError("");

      try {
        const contract = getAccessControlContract(signer);
        const tx = await contract.approveAccess(requestId, expiresAt, encryptedKeys);
        await tx.wait();
        await loadPendingRequests();
        await loadPermissions();
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        return false;
      }
    },
    [signer, loadPendingRequests, loadPermissions]
  );

  const rejectRequest = useCallback(
    async (requestId: bigint): Promise<boolean> => {
      if (!signer) return false;
      setError("");

      try {
        const contract = getAccessControlContract(signer);
        const tx = await contract.rejectAccess(requestId);
        await tx.wait();
        await loadPendingRequests();
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        return false;
      }
    },
    [signer, loadPendingRequests]
  );

  const grantAccess = useCallback(
    async (
      recordId: bigint,
      doctorAddress: string,
      expiresAt: bigint,
      encryptedKey: string
    ): Promise<boolean> => {
      if (!signer) return false;
      setError("");

      try {
        const contract = getAccessControlContract(signer);
        const tx = await contract.grantAccess(recordId, doctorAddress, expiresAt, encryptedKey);
        await tx.wait();
        await loadPermissions();
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        return false;
      }
    },
    [signer, loadPermissions]
  );

  const revokeAccess = useCallback(
    async (recordId: bigint, doctorAddress: string): Promise<boolean> => {
      if (!signer) return false;
      setError("");

      try {
        const contract = getAccessControlContract(signer);
        const tx = await contract.revokeAccess(recordId, doctorAddress);
        await tx.wait();
        await loadPermissions();
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        return false;
      }
    },
    [signer, loadPermissions]
  );

  const revokeAllAccess = useCallback(
    async (recordId: bigint): Promise<boolean> => {
      if (!signer) return false;
      setError("");

      try {
        const contract = getAccessControlContract(signer);
        const tx = await contract.revokeAllAccess(recordId);
        await tx.wait();
        await loadPermissions();
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        return false;
      }
    },
    [signer, loadPermissions]
  );

  const isDoctorVerified = useCallback(
    async (doctorAddress: string): Promise<boolean> => {
      if (!provider) return false;

      try {
        const contract = getUserRegistryContract(provider);
        return await contract.isDoctorVerified(doctorAddress);
      } catch {
        return false;
      }
    },
    [provider]
  );

  const getDoctorPublicKey = useCallback(
    async (doctorAddress: string): Promise<string | null> => {
      if (!provider) return null;

      try {
        const contract = getUserRegistryContract(provider);
        const key = await contract.getPublicKey(doctorAddress);
        return key;
      } catch {
        return null;
      }
    },
    [provider]
  );

  return {
    pendingRequests,
    permissions,
    loading,
    error,
    loadPendingRequests,
    loadPermissions,
    approveRequest,
    rejectRequest,
    grantAccess,
    revokeAccess,
    revokeAllAccess,
    isDoctorVerified,
    getDoctorPublicKey,
  };
}
