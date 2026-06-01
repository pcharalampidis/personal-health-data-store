import type { BrowserProvider } from "ethers";
import {
  getRecordManagerContract,
  getAccessControlContract,
  getEmergencyAccessContract,
} from "../services/contracts.js";
import type { AuditEntry, AuditEventType, AuditCategory } from "../types/audit.js";
import type { DoctorIdentity } from "../types/profiles.js";

// Helper to format timestamps
function formatTimestampDate(ts: bigint): string {
  return new Date(Number(ts) * 1000).toLocaleString();
}

export async function loadRecordAuditTrail(
  provider: BrowserProvider,
  recordId: bigint,
  patientAddress: string,
  resolveDoctor: (address: string) => Promise<DoctorIdentity>
): Promise<AuditEntry[]> {
  const entries: AuditEntry[] = [];

  const recordManager = getRecordManagerContract(provider);
  const accessControl = getAccessControlContract(provider);
  const emergencyAccess = getEmergencyAccessContract(provider);

  const cleanPatientAddr = patientAddress.toLowerCase();
  const targetIdStr = String(recordId);

  // 1. Helper to fetch actor/counterparty labels
  const resolveLabels = async (actor: string, counterparty: string) => {
    let actorLabel = actor;
    let counterpartyLabel = counterparty;

    if (actor) {
      if (actor.toLowerCase() === cleanPatientAddr) {
        actorLabel = "You";
      } else {
        const doc = await resolveDoctor(actor);
        actorLabel = doc.isVerified ? doc.displayName : actor;
      }
    }

    if (counterparty) {
      if (counterparty.toLowerCase() === cleanPatientAddr) {
        counterpartyLabel = "You";
      } else {
        const doc = await resolveDoctor(counterparty);
        counterpartyLabel = doc.isVerified ? doc.displayName : counterparty;
      }
    }

    return { actorLabel, counterpartyLabel };
  };

  // --- RECORD LIFECYCLE EVENTS ---
  try {
    const filterAdded = recordManager.filters.RecordAdded(recordId);
    const logsAdded = await recordManager.queryFilter(filterAdded);
    for (const log of logsAdded) {
      if ("args" in log && log.args) {
        const args = log.args;
        const { actorLabel, counterpartyLabel } = await resolveLabels(args.owner, "");
        entries.push({
          id: `${log.transactionHash}-${log.index}`,
          recordId,
          eventType: "record_created",
          category: "record",
          title: "Record uploaded",
          description: "Health record uploaded and encrypted in browser.",
          actor: args.owner,
          actorLabel,
          counterparty: "",
          counterpartyLabel,
          timestamp: args.timestamp,
          blockNumber: log.blockNumber,
          transactionHash: log.transactionHash,
          severity: "success",
        });
      }
    }
  } catch (err) {
    console.error("Error loading RecordAdded logs:", err);
  }

  try {
    const filterArchived = recordManager.filters.RecordArchived(recordId);
    const logsArchived = await recordManager.queryFilter(filterArchived);
    for (const log of logsArchived) {
      if ("args" in log && log.args) {
        const args = log.args;
        const { actorLabel, counterpartyLabel } = await resolveLabels(args.owner, "");
        entries.push({
          id: `${log.transactionHash}-${log.index}`,
          recordId,
          eventType: "record_archived",
          category: "record",
          title: "Record archived",
          description: "Record archived and marked inactive.",
          actor: args.owner,
          actorLabel,
          counterparty: "",
          counterpartyLabel,
          timestamp: args.timestamp,
          blockNumber: log.blockNumber,
          transactionHash: log.transactionHash,
          severity: "warning",
        });
      }
    }
  } catch (err) {
    console.error("Error loading RecordArchived logs:", err);
  }

  try {
    const filterRestored = recordManager.filters.RecordRestored(recordId);
    const logsRestored = await recordManager.queryFilter(filterRestored);
    for (const log of logsRestored) {
      if ("args" in log && log.args) {
        const args = log.args;
        const { actorLabel, counterpartyLabel } = await resolveLabels(args.owner, "");
        entries.push({
          id: `${log.transactionHash}-${log.index}`,
          recordId,
          eventType: "record_restored",
          category: "record",
          title: "Record restored",
          description: "Record restored to active vault.",
          actor: args.owner,
          actorLabel,
          counterparty: "",
          counterpartyLabel,
          timestamp: args.timestamp,
          blockNumber: log.blockNumber,
          transactionHash: log.transactionHash,
          severity: "success",
        });
      }
    }
  } catch (err) {
    console.error("Error loading RecordRestored logs:", err);
  }

  try {
    const filterDeleted = recordManager.filters.RecordDeleted(recordId);
    const logsDeleted = await recordManager.queryFilter(filterDeleted);
    for (const log of logsDeleted) {
      if ("args" in log && log.args) {
        const args = log.args;
        const { actorLabel, counterpartyLabel } = await resolveLabels(args.owner, "");
        entries.push({
          id: `${log.transactionHash}-${log.index}`,
          recordId,
          eventType: "record_deleted",
          category: "record",
          title: "Record removed",
          description: "Record removed from vault and storage reference deleted.",
          actor: args.owner,
          actorLabel,
          counterparty: "",
          counterpartyLabel,
          timestamp: args.timestamp,
          blockNumber: log.blockNumber,
          transactionHash: log.transactionHash,
          severity: "error",
        });
      }
    }
  } catch (err) {
    console.error("Error loading RecordDeleted logs:", err);
  }

  try {
    const filterEmergencyFlag = recordManager.filters.EmergencyFlagUpdated(recordId);
    const logsEmergencyFlag = await recordManager.queryFilter(filterEmergencyFlag);
    for (const log of logsEmergencyFlag) {
      if ("args" in log && log.args) {
        const args = log.args;
        const isEmergency = args.isEmergency;
        const { actorLabel, counterpartyLabel } = await resolveLabels(args.owner, "");
        entries.push({
          id: `${log.transactionHash}-${log.index}`,
          recordId,
          eventType: isEmergency ? "emergency_flag_enabled" : "emergency_flag_disabled",
          category: "emergency",
          title: isEmergency ? "Emergency access enabled" : "Emergency access disabled",
          description: isEmergency
            ? "Record marked to be accessible in emergency situations."
            : "Emergency access flag removed from this record.",
          actor: args.owner,
          actorLabel,
          counterparty: "",
          counterpartyLabel,
          timestamp: args.timestamp,
          blockNumber: log.blockNumber,
          transactionHash: log.transactionHash,
          severity: isEmergency ? "warning" : "info",
        });
      }
    }
  } catch (err) {
    console.error("Error loading EmergencyFlagUpdated logs:", err);
  }

  // --- ACCESS CONTROL PERMISSION EVENTS ---
  try {
    const filterAccessGranted = accessControl.filters.AccessGranted(recordId);
    const logsAccessGranted = await accessControl.queryFilter(filterAccessGranted);
    for (const log of logsAccessGranted) {
      if ("args" in log && log.args) {
        const args = log.args;
        const { actorLabel, counterpartyLabel } = await resolveLabels(args.patient, args.doctor);
        entries.push({
          id: `${log.transactionHash}-${log.index}`,
          recordId,
          eventType: "access_granted",
          category: "permission",
          title: "Access granted",
          description: `Access authorized until: ${formatTimestampDate(args.expiresAt)}`,
          actor: args.patient,
          actorLabel,
          counterparty: args.doctor,
          counterpartyLabel,
          timestamp: args.timestamp,
          blockNumber: log.blockNumber,
          transactionHash: log.transactionHash,
          severity: "success",
        });
      }
    }
  } catch (err) {
    console.error("Error loading AccessGranted logs:", err);
  }

  try {
    const filterAccessRevoked = accessControl.filters.AccessRevoked(recordId);
    const logsAccessRevoked = await accessControl.queryFilter(filterAccessRevoked);
    for (const log of logsAccessRevoked) {
      if ("args" in log && log.args) {
        const args = log.args;
        const { actorLabel, counterpartyLabel } = await resolveLabels(args.patient, args.doctor);
        entries.push({
          id: `${log.transactionHash}-${log.index}`,
          recordId,
          eventType: "access_revoked",
          category: "permission",
          title: "Access revoked",
          description: "Authorized access revoked.",
          actor: args.patient,
          actorLabel,
          counterparty: args.doctor,
          counterpartyLabel,
          timestamp: args.timestamp,
          blockNumber: log.blockNumber,
          transactionHash: log.transactionHash,
          severity: "warning",
        });
      }
    }
  } catch (err) {
    console.error("Error loading AccessRevoked logs:", err);
  }

  try {
    const filterRecordAccessed = accessControl.filters.RecordAccessed(recordId);
    const logsRecordAccessed = await accessControl.queryFilter(filterRecordAccessed);
    for (const log of logsRecordAccessed) {
      if ("args" in log && log.args) {
        const args = log.args;
        const { actorLabel, counterpartyLabel } = await resolveLabels(args.accessor, args.recordOwner);
        entries.push({
          id: `${log.transactionHash}-${log.index}`,
          recordId,
          eventType: "record_viewed",
          category: "access",
          title: "Record viewed",
          description: "Record was viewed/decrypted.",
          actor: args.accessor,
          actorLabel,
          counterparty: args.recordOwner,
          counterpartyLabel,
          timestamp: args.timestamp,
          blockNumber: log.blockNumber,
          transactionHash: log.transactionHash,
          severity: "info",
        });
      }
    }
  } catch (err) {
    console.error("Error loading RecordAccessed logs:", err);
  }

  // --- ACCESS REQUEST EVENTS (FILTERED AND MAPPED) ---
  const matchingRequestIds = new Set<string>();

  try {
    // Filter AccessRequested by patient Address
    const filterAccessRequested = accessControl.filters.AccessRequested(null, null, patientAddress);
    const logsAccessRequested = await accessControl.queryFilter(filterAccessRequested);
    for (const log of logsAccessRequested) {
      if ("args" in log && log.args) {
        const args = log.args;
        const recordIdsArray: bigint[] = args.recordIds || [];
        const matchesRecord = recordIdsArray.some(
          (id) => String(id) === targetIdStr
        );

        if (matchesRecord) {
          const reqIdStr = String(args.requestId);
          matchingRequestIds.add(reqIdStr);

          const { actorLabel, counterpartyLabel } = await resolveLabels(args.doctor, args.patient);
          entries.push({
            id: `${log.transactionHash}-${log.index}`,
            recordId,
            eventType: "access_requested",
            category: "request",
            title: "Access requested",
            description: `Access requested for reason: "${args.reason}"`,
            actor: args.doctor,
            actorLabel,
            counterparty: args.patient,
            counterpartyLabel,
            timestamp: args.timestamp,
            blockNumber: log.blockNumber,
            transactionHash: log.transactionHash,
            severity: "info",
          });
        }
      }
    }
  } catch (err) {
    console.error("Error loading AccessRequested logs:", err);
  }

  try {
    // Filter AccessRequestRejected by patient Address
    const filterAccessRejected = accessControl.filters.AccessRequestRejected(null, patientAddress);
    const logsAccessRejected = await accessControl.queryFilter(filterAccessRejected);
    for (const log of logsAccessRejected) {
      if ("args" in log && log.args) {
        const args = log.args;
        const reqIdStr = String(args.requestId);

        if (matchingRequestIds.has(reqIdStr)) {
          const { actorLabel, counterpartyLabel } = await resolveLabels(args.patient, args.doctor);
          entries.push({
            id: `${log.transactionHash}-${log.index}`,
            recordId,
            eventType: "access_rejected",
            category: "request",
            title: "Access request rejected",
            description: "Access request rejected by patient.",
            actor: args.patient,
            actorLabel,
            counterparty: args.doctor,
            counterpartyLabel,
            timestamp: args.timestamp,
            blockNumber: log.blockNumber,
            transactionHash: log.transactionHash,
            severity: "warning",
          });
        }
      }
    }
  } catch (err) {
    console.error("Error loading AccessRequestRejected logs:", err);
  }

  // --- EMERGENCY EVENTS ---
  try {
    const filterEmergencyAccess = emergencyAccess.filters.EmergencyRecordAccessed(null, recordId);
    const logsEmergencyAccess = await emergencyAccess.queryFilter(filterEmergencyAccess);
    for (const log of logsEmergencyAccess) {
      if ("args" in log && log.args) {
        const args = log.args;
        const { actorLabel, counterpartyLabel } = await resolveLabels(args.doctor, patientAddress);
        entries.push({
          id: `${log.transactionHash}-${log.index}`,
          recordId,
          eventType: "emergency_record_accessed",
          category: "emergency",
          title: "Emergency record accessed",
          description: `Emergency record opened (Session: #${String(args.sessionId)}).`,
          actor: args.doctor,
          actorLabel,
          counterparty: patientAddress,
          counterpartyLabel,
          timestamp: args.timestamp,
          blockNumber: log.blockNumber,
          transactionHash: log.transactionHash,
          severity: "error",
        });
      }
    }
  } catch (err) {
    console.error("Error loading EmergencyRecordAccessed logs:", err);
  }

  // Sort entries newest first (descending by timestamp, then block number, then transaction index if needed)
  return entries.sort((a, b) => {
    if (b.timestamp !== a.timestamp) {
      return Number(b.timestamp - a.timestamp);
    }
    return b.blockNumber - a.blockNumber;
  });
}
