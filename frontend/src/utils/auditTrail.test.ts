import { describe, it, expect, vi } from "vitest";
import { loadRecordAuditTrail } from "./auditTrail.js";
import type { DoctorIdentity } from "../types/profiles.js";

// Mock the smart contract services to intercept queryFilter calls
vi.mock("../services/contracts.js", () => {
  return {
    getRecordManagerContract: () => ({
      getRecord: vi.fn().mockResolvedValue({
        owner: "0xPatientAddress",
      }),
      filters: {
        RecordAdded: vi.fn().mockReturnValue({ event: "RecordAdded" }),
        RecordArchived: vi.fn().mockReturnValue({ event: "RecordArchived" }),
        RecordDeleted: vi.fn().mockReturnValue({ event: "RecordDeleted" }),
        RecordRestored: vi.fn().mockReturnValue({ event: "RecordRestored" }),
        EmergencyFlagUpdated: vi.fn().mockReturnValue({ event: "EmergencyFlagUpdated" }),
      },
      queryFilter: vi.fn().mockImplementation(async (filter) => {
        // Return dummy events depending on what filter we are querying
        if (filter && filter.event === "RecordAdded") {
          return [
            {
              transactionHash: "0x1111",
              blockNumber: 100,
              index: 0,
              args: {
                owner: "0xPatientAddress",
                timestamp: 1700000000n,
              },
            },
          ];
        }
        return [];
      }),
    }),
    getAccessControlContract: () => ({
      filters: {
        AccessGranted: vi.fn().mockReturnValue({ event: "AccessGranted" }),
        AccessRevoked: vi.fn().mockReturnValue({ event: "AccessRevoked" }),
        RecordAccessed: vi.fn().mockReturnValue({ event: "RecordAccessed" }),
        AccessRequested: vi.fn().mockReturnValue({ event: "AccessRequested" }),
        AccessRequestRejected: vi.fn().mockReturnValue({ event: "AccessRequestRejected" }),
      },
      queryFilter: vi.fn().mockImplementation(async (filter) => {
        if (filter && filter.event === "AccessGranted") {
          return [
            {
              transactionHash: "0x2222",
              blockNumber: 102,
              index: 1,
              args: {
                patient: "0xPatientAddress",
                doctor: "0xDoctorAddress",
                expiresAt: 1800000000n,
                timestamp: 1700000500n,
              },
            },
          ];
        }
        return [];
      }),
    }),
    getEmergencyAccessContract: () => ({
      filters: {
        EmergencyRecordAccessed: vi.fn().mockReturnValue({ event: "EmergencyRecordAccessed" }),
      },
      queryFilter: vi.fn().mockResolvedValue([]),
    }),
  };
});

describe("loadRecordAuditTrail", () => {
  it("queries contract logs and formats entries with correct actor labels", async () => {
    const mockProvider = {} as any;
    const recordId = 1n;
    const patientAddress = "0xPatientAddress";

    const mockResolveDoctor = vi.fn().mockResolvedValue({
      address: "0xDoctorAddress",
      name: "John Smith",
      licenseNumber: "LIC123",
      specialty: "Cardiology",
      institution: "General Hospital",
      registeredAt: 1600000000n,
      isVerified: true,
      displayName: "Dr. John Smith",
      displaySubtitle: "Cardiology — General Hospital",
      formattedAddress: "0xDoct...dres",
    } as DoctorIdentity);

    const entries = await loadRecordAuditTrail(
      mockProvider,
      recordId,
      patientAddress,
      mockResolveDoctor
    );

    expect(entries.length).toBe(2);

    // Verify ordering (newest first - AccessGranted was at 1700000500, RecordAdded at 1700000000)
    expect(entries[0].eventType).toBe("access_granted");
    expect(entries[0].actorLabel).toBe("You");
    expect(entries[0].counterpartyLabel).toBe("Dr. John Smith");

    expect(entries[1].eventType).toBe("record_created");
    expect(entries[1].actorLabel).toBe("You");
  });
});
