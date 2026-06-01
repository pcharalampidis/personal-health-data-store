export type AuditCategory = "record" | "request" | "permission" | "access" | "emergency";

export type AuditEventType =
  | "record_created"
  | "record_archived"
  | "record_restored"
  | "record_deleted"
  | "emergency_flag_enabled"
  | "emergency_flag_disabled"
  | "access_requested"
  | "access_granted"
  | "access_rejected"
  | "access_revoked"
  | "record_viewed"
  | "emergency_record_accessed";

export interface AuditEntry {
  id: string; // Unique UI key, e.g. txHash-logIndex
  recordId: bigint;
  eventType: AuditEventType;
  category: AuditCategory;
  title: string;
  description: string;
  actor: string; // Address of who performed the action
  actorLabel: string; // e.g. "You", "Dr. John Smith", or short wallet
  counterparty: string; // Address of receiver/sender if applicable
  counterpartyLabel: string; // e.g. "Dr. John Smith", "You", or empty
  timestamp: bigint; // Unix timestamp
  blockNumber: number;
  transactionHash: string;
  severity: "info" | "success" | "warning" | "error";
}
