import { useState, useCallback } from "react";
import type { BrowserProvider } from "ethers";
import { getRecordManagerContract, RECORD_MANAGER_ADDRESS } from "../services/contracts.js";

export interface RecordInfo {
  recordId: bigint;
  ipfsCID: string;
  recordType: number;
  status: number;
  isEmergency: boolean;
  createdAt: bigint;
}

export function useRecords(account: string | null, provider: BrowserProvider | null) {
  const [records, setRecords] = useState<RecordInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadRecords = useCallback(async () => {
    if (!account || !provider) return;
    setLoading(true);
    setError("");

    try {
      const code = await provider.getCode(RECORD_MANAGER_ADDRESS);
      if (code === "0x") {
        setError("Contract not found. Run deploy:local first.");
        return;
      }

      const contract = getRecordManagerContract(provider);
      const ids: bigint[] = await contract.getRecordsByOwner(account);

      const loaded: RecordInfo[] = [];
      for (const id of ids) {
        const rec = await contract.getRecord(id);
        loaded.push({
          recordId: rec.recordId,
          ipfsCID: rec.ipfsCID,
          recordType: Number(rec.recordType),
          status: Number(rec.status),
          isEmergency: rec.isEmergency,
          createdAt: rec.createdAt,
        });
      }

      setRecords(loaded);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("address not set")) {
        setError("Contract addresses not configured.");
      } else if (msg.includes("could not decode result")) {
        setError("Contract not deployed or wrong network.");
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }, [account, provider]);

  return { records, loading, error, loadRecords };
}
