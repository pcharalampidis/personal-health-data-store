import { useState, useCallback, useEffect } from "react";
import type { BrowserProvider } from "ethers";
import { loadRecordAuditTrail } from "../utils/auditTrail.js";
import { useDoctorProfiles } from "./useDoctorProfiles.js";
import type { AuditEntry } from "../types/audit.js";

export function useRecordAuditTrail(
  provider: BrowserProvider | null,
  recordId: bigint | null,
  patientAddress: string | null
) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const { resolveDoctor } = useDoctorProfiles(provider);

  const refresh = useCallback(async () => {
    if (!provider || recordId == null || !patientAddress) {
      return;
    }

    setLoading(true);
    setError("");
    try {
      const data = await loadRecordAuditTrail(
        provider,
        recordId,
        patientAddress,
        resolveDoctor
      );
      setEntries(data);
    } catch (err) {
      console.error("Error fetching audit trail:", err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [provider, recordId, patientAddress, resolveDoctor]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { entries, loading, error, refresh };
}
