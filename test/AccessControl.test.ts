import { expect } from "chai";
import hre from "hardhat";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("AccessControl", function () {
  let userRegistry: any;
  let recordManager: any;
  let accessControl: any;
  let owner: HardhatEthersSigner;
  let patient1: HardhatEthersSigner;
  let patient2: HardhatEthersSigner;
  let doctor1: HardhatEthersSigner;
  let doctor2: HardhatEthersSigner;
  let stranger: HardhatEthersSigner;

  const SAMPLE_PUB_KEY = "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";
  const SAMPLE_PUB_KEY_2 = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
  const SAMPLE_CID = "QmTest1234567890abcdef";
  const SAMPLE_HASH = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
  const SAMPLE_ENCRYPTED_KEY = "0xaabbccddeeff00112233445566778899aabbccddeeff00112233445566778899";
  const SAMPLE_ENCRYPTED_KEY_2 = "0x112233445566778899aabbccddeeff00112233445566778899aabbccddeeff00";

  async function latestTimestamp(): Promise<number> {
    const provider = (accessControl.runner as any)?.provider;
    const block = await provider.send("eth_getBlockByNumber", ["latest", false]);
    return parseInt(block.timestamp, 16);
  }

  async function increaseTime(seconds: number): Promise<void> {
    const provider = (accessControl.runner as any)?.provider;
    await provider.send("evm_increaseTime", [seconds]);
    await provider.send("evm_mine");
  }

  async function deployFixture() {
    const connection = await hre.network.connect();
    const signers = await connection.ethers.getSigners();
    [owner, patient1, patient2, doctor1, doctor2, stranger] = signers;

    const UserRegistry = await connection.ethers.getContractFactory("UserRegistry");
    const registry = await UserRegistry.deploy();

    const RecordManager = await connection.ethers.getContractFactory("RecordManager");
    const records = await RecordManager.deploy(await registry.getAddress());

    const AccessControl = await connection.ethers.getContractFactory("AccessControl");
    const access = await AccessControl.deploy(
      await registry.getAddress(),
      await records.getAddress()
    );

    await records.setAccessControlAddress(await access.getAddress());

    return { registry, records, access, owner, patient1, patient2, doctor1, doctor2, stranger, connection };
  }

  async function setupUsersFixture() {
    const base = await deployFixture();
    
    await base.registry.connect(base.patient1).registerAsPatient(SAMPLE_PUB_KEY);
    await base.registry.connect(base.patient2).registerAsPatient(SAMPLE_PUB_KEY_2);
    await base.registry.connect(base.doctor1).registerAsDoctor(
      "Dr. Smith", "LIC-001", "Cardiology", "City Hospital", SAMPLE_PUB_KEY
    );
    await base.registry.connect(base.doctor2).registerAsDoctor(
      "Dr. Jones", "LIC-002", "Neurology", "Regional Hospital", SAMPLE_PUB_KEY_2
    );
    
    return base;
  }

  async function setupWithRecordFixture() {
    const base = await setupUsersFixture();
    
    await base.records.connect(base.patient1).addRecord(
      SAMPLE_CID,
      SAMPLE_HASH,
      0, // LabResult
      SAMPLE_ENCRYPTED_KEY
    );
    
    return { ...base, recordId: 1n };
  }

  beforeEach(async function () {
    const fixture = await deployFixture();
    userRegistry = fixture.registry;
    recordManager = fixture.records;
    accessControl = fixture.access;
    owner = fixture.owner;
    patient1 = fixture.patient1;
    patient2 = fixture.patient2;
    doctor1 = fixture.doctor1;
    doctor2 = fixture.doctor2;
    stranger = fixture.stranger;
  });

  // ── AC-T01: Access Request ────────────────────────
  describe("Access Request", function () {
    beforeEach(async function () {
      const fixture = await setupWithRecordFixture();
      userRegistry = fixture.registry;
      recordManager = fixture.records;
      accessControl = fixture.access;
    });

    it("should allow verified doctor to request access", async function () {
      const tx = accessControl.connect(doctor1).requestAccess(
        patient1.address,
        [1n],
        "Routine checkup review"
      );

      await expect(tx)
        .to.emit(accessControl, "AccessRequested")
        .withArgs(1n, doctor1.address, patient1.address, [1n], "Routine checkup review", () => true);

      const request = await accessControl.getRequest(1n);
      expect(request.doctor).to.equal(doctor1.address);
      expect(request.patient).to.equal(patient1.address);
      expect(request.recordIds).to.deep.equal([1n]);
      expect(request.reason).to.equal("Routine checkup review");
      expect(request.status).to.equal(0n); // Pending
    });

    it("should reject request from unverified doctor", async function () {
      await expect(
        accessControl.connect(stranger).requestAccess(patient1.address, [1n], "Review")
      ).to.be.revertedWith("AccessControl: caller is not a verified doctor");
    });

    it("should reject request for non-patient target", async function () {
      await expect(
        accessControl.connect(doctor1).requestAccess(doctor2.address, [1n], "Review")
      ).to.be.revertedWith("AccessControl: target is not a patient");
    });

    it("should reject request with empty records array", async function () {
      await expect(
        accessControl.connect(doctor1).requestAccess(patient1.address, [], "Review")
      ).to.be.revertedWith("AccessControl: no records requested");
    });

    it("should reject request with empty reason", async function () {
      await expect(
        accessControl.connect(doctor1).requestAccess(patient1.address, [1n], "")
      ).to.be.revertedWith("AccessControl: empty reason");
    });

    it("should reject request for records not owned by patient", async function () {
      await recordManager.connect(patient2).addRecord(
        "QmOther", SAMPLE_HASH, 1, SAMPLE_ENCRYPTED_KEY_2
      );
      
      await expect(
        accessControl.connect(doctor1).requestAccess(patient1.address, [2n], "Review")
      ).to.be.revertedWith("AccessControl: record not owned by patient");
    });

    it("should track requests by doctor", async function () {
      await accessControl.connect(doctor1).requestAccess(patient1.address, [1n], "Review 1");
      await accessControl.connect(doctor1).requestAccess(patient1.address, [1n], "Review 2");

      const requests = await accessControl.getRequestsByDoctor(doctor1.address);
      expect(requests.length).to.equal(2);
    });

    it("should track requests for patient", async function () {
      await accessControl.connect(doctor1).requestAccess(patient1.address, [1n], "Review");
      
      const pending = await accessControl.getPendingRequests(patient1.address);
      expect(pending.length).to.equal(1);
      expect(pending[0].doctor).to.equal(doctor1.address);
    });
  });

  // ── AC-T02: Access Approval ───────────────────────
  describe("Access Approval", function () {
    let recordId: bigint;

    beforeEach(async function () {
      const fixture = await setupWithRecordFixture();
      userRegistry = fixture.registry;
      recordManager = fixture.records;
      accessControl = fixture.access;
      recordId = fixture.recordId;

      await accessControl.connect(doctor1).requestAccess(
        patient1.address, [recordId], "Checkup"
      );
    });

    it("should allow patient to approve access request", async function () {
      const expiresAt = BigInt(Math.floor(Date.now() / 1000) + 86400);
      
      const tx = accessControl.connect(patient1).approveAccess(
        1n,
        expiresAt,
        [SAMPLE_ENCRYPTED_KEY_2]
      );

      await expect(tx)
        .to.emit(accessControl, "AccessGranted")
        .withArgs(recordId, patient1.address, doctor1.address, expiresAt, () => true);

      const request = await accessControl.getRequest(1n);
      expect(request.status).to.equal(1n); // Approved
    });

    it("should store encrypted key for doctor", async function () {
      const expiresAt = BigInt(Math.floor(Date.now() / 1000) + 86400);
      await accessControl.connect(patient1).approveAccess(1n, expiresAt, [SAMPLE_ENCRYPTED_KEY_2]);

      const encKey = await recordManager.getEncryptedKey(recordId, doctor1.address);
      expect(encKey).to.equal(SAMPLE_ENCRYPTED_KEY_2);
    });

    it("should reject approval from non-patient", async function () {
      const expiresAt = BigInt(Math.floor(Date.now() / 1000) + 86400);
      await expect(
        accessControl.connect(patient2).approveAccess(1n, expiresAt, [SAMPLE_ENCRYPTED_KEY_2])
      ).to.be.revertedWith("AccessControl: caller is not the request patient");
    });

    it("should reject approval with expired timestamp", async function () {
      const expiresAt = BigInt(Math.floor(Date.now() / 1000) - 100);
      await expect(
        accessControl.connect(patient1).approveAccess(1n, expiresAt, [SAMPLE_ENCRYPTED_KEY_2])
      ).to.be.revertedWith("AccessControl: expiry must be in the future");
    });

    it("should reject approval with mismatched key count", async function () {
      const expiresAt = BigInt(Math.floor(Date.now() / 1000) + 86400);
      await expect(
        accessControl.connect(patient1).approveAccess(1n, expiresAt, [])
      ).to.be.revertedWith("AccessControl: encrypted keys count mismatch");
    });

    it("should reject approval for non-pending request", async function () {
      const expiresAt = BigInt(Math.floor(Date.now() / 1000) + 86400);
      await accessControl.connect(patient1).approveAccess(1n, expiresAt, [SAMPLE_ENCRYPTED_KEY_2]);
      
      await expect(
        accessControl.connect(patient1).approveAccess(1n, expiresAt, [SAMPLE_ENCRYPTED_KEY_2])
      ).to.be.revertedWith("AccessControl: request is not pending");
    });
  });

  // ── AC-T03: Direct Grant ──────────────────────────
  describe("Direct Grant", function () {
    let recordId: bigint;

    beforeEach(async function () {
      const fixture = await setupWithRecordFixture();
      userRegistry = fixture.registry;
      recordManager = fixture.records;
      accessControl = fixture.access;
      recordId = fixture.recordId;
    });

    it("should allow patient to directly grant access", async function () {
      const expiresAt = BigInt(Math.floor(Date.now() / 1000) + 86400);
      
      const tx = accessControl.connect(patient1).grantAccess(
        recordId,
        doctor1.address,
        expiresAt,
        SAMPLE_ENCRYPTED_KEY_2
      );

      await expect(tx)
        .to.emit(accessControl, "AccessGranted")
        .withArgs(recordId, patient1.address, doctor1.address, expiresAt, () => true);
    });

    it("should reject grant from non-owner", async function () {
      const expiresAt = BigInt(Math.floor(Date.now() / 1000) + 86400);
      await expect(
        accessControl.connect(patient2).grantAccess(recordId, doctor1.address, expiresAt, SAMPLE_ENCRYPTED_KEY_2)
      ).to.be.revertedWith("AccessControl: caller is not record owner");
    });

    it("should reject grant to non-verified doctor", async function () {
      const expiresAt = BigInt(Math.floor(Date.now() / 1000) + 86400);
      await expect(
        accessControl.connect(patient1).grantAccess(recordId, stranger.address, expiresAt, SAMPLE_ENCRYPTED_KEY_2)
      ).to.be.revertedWith("AccessControl: doctor not verified");
    });

    it("should reject grant with past expiry", async function () {
      const expiresAt = BigInt(Math.floor(Date.now() / 1000) - 100);
      await expect(
        accessControl.connect(patient1).grantAccess(recordId, doctor1.address, expiresAt, SAMPLE_ENCRYPTED_KEY_2)
      ).to.be.revertedWith("AccessControl: expiry must be in the future");
    });
  });

  // ── AC-T04: Access Rejection ──────────────────────
  describe("Access Rejection", function () {
    beforeEach(async function () {
      const fixture = await setupWithRecordFixture();
      userRegistry = fixture.registry;
      recordManager = fixture.records;
      accessControl = fixture.access;

      await accessControl.connect(doctor1).requestAccess(
        patient1.address, [1n], "Checkup"
      );
    });

    it("should allow patient to reject request", async function () {
      const tx = accessControl.connect(patient1).rejectAccess(1n);

      await expect(tx)
        .to.emit(accessControl, "AccessRequestRejected")
        .withArgs(1n, patient1.address, doctor1.address, () => true);

      const request = await accessControl.getRequest(1n);
      expect(request.status).to.equal(2n); // Rejected
    });

    it("should reject rejection from non-patient", async function () {
      await expect(
        accessControl.connect(patient2).rejectAccess(1n)
      ).to.be.revertedWith("AccessControl: caller is not the request patient");
    });
  });

  // ── AC-T05: Access Revocation ─────────────────────
  describe("Access Revocation", function () {
    let recordId: bigint;

    beforeEach(async function () {
      const fixture = await setupWithRecordFixture();
      userRegistry = fixture.registry;
      recordManager = fixture.records;
      accessControl = fixture.access;
      recordId = fixture.recordId;

      const expiresAt = BigInt(Math.floor(Date.now() / 1000) + 86400);
      await accessControl.connect(patient1).grantAccess(
        recordId, doctor1.address, expiresAt, SAMPLE_ENCRYPTED_KEY_2
      );
    });

    it("should allow patient to revoke access", async function () {
      const tx = accessControl.connect(patient1).revokeAccess(recordId, doctor1.address);

      await expect(tx)
        .to.emit(accessControl, "AccessRevoked")
        .withArgs(recordId, patient1.address, doctor1.address, () => true);

      const perm = await accessControl.getPermission(recordId, doctor1.address);
      expect(perm.isActive).to.be.false;
      expect(perm.revokedAt).to.be.gt(0n);
    });

    it("should remove encrypted key on revocation", async function () {
      await accessControl.connect(patient1).revokeAccess(recordId, doctor1.address);
      
      const encKey = await recordManager.getEncryptedKey(recordId, doctor1.address);
      expect(encKey).to.equal("0x");
    });

    it("should reject revocation from non-owner", async function () {
      await expect(
        accessControl.connect(patient2).revokeAccess(recordId, doctor1.address)
      ).to.be.revertedWith("AccessControl: caller is not record owner");
    });

    it("should reject revocation for non-existent permission", async function () {
      await expect(
        accessControl.connect(patient1).revokeAccess(recordId, doctor2.address)
      ).to.be.revertedWith("AccessControl: no active permission");
    });
  });

  // ── AC-T06: Revoke All Access ─────────────────────
  describe("Revoke All Access", function () {
    let recordId: bigint;

    beforeEach(async function () {
      const fixture = await setupWithRecordFixture();
      userRegistry = fixture.registry;
      recordManager = fixture.records;
      accessControl = fixture.access;
      recordId = fixture.recordId;

      const expiresAt = BigInt(Math.floor(Date.now() / 1000) + 86400);
      await accessControl.connect(patient1).grantAccess(
        recordId, doctor1.address, expiresAt, SAMPLE_ENCRYPTED_KEY
      );
      await accessControl.connect(patient1).grantAccess(
        recordId, doctor2.address, expiresAt, SAMPLE_ENCRYPTED_KEY_2
      );
    });

    it("should revoke all access to a record", async function () {
      await accessControl.connect(patient1).revokeAllAccess(recordId);

      const perm1 = await accessControl.getPermission(recordId, doctor1.address);
      const perm2 = await accessControl.getPermission(recordId, doctor2.address);
      
      expect(perm1.isActive).to.be.false;
      expect(perm2.isActive).to.be.false;
    });
  });

  // ── AC-T07: Batch Revoke ──────────────────────────
  describe("Batch Revoke", function () {
    beforeEach(async function () {
      const fixture = await setupWithRecordFixture();
      userRegistry = fixture.registry;
      recordManager = fixture.records;
      accessControl = fixture.access;

      await recordManager.connect(patient1).addRecord(
        "QmTest2", SAMPLE_HASH, 1, SAMPLE_ENCRYPTED_KEY
      );

      const expiresAt = BigInt(Math.floor(Date.now() / 1000) + 86400);
      await accessControl.connect(patient1).grantAccess(1n, doctor1.address, expiresAt, SAMPLE_ENCRYPTED_KEY);
      await accessControl.connect(patient1).grantAccess(2n, doctor2.address, expiresAt, SAMPLE_ENCRYPTED_KEY_2);
    });

    it("should batch revoke multiple permissions", async function () {
      await accessControl.connect(patient1).batchRevoke(
        [1n, 2n],
        [doctor1.address, doctor2.address]
      );

      const perm1 = await accessControl.getPermission(1n, doctor1.address);
      const perm2 = await accessControl.getPermission(2n, doctor2.address);
      
      expect(perm1.isActive).to.be.false;
      expect(perm2.isActive).to.be.false;
    });

    it("should reject batch revoke with array length mismatch", async function () {
      await expect(
        accessControl.connect(patient1).batchRevoke([1n], [doctor1.address, doctor2.address])
      ).to.be.revertedWith("AccessControl: array length mismatch");
    });
  });

  // ── AC-T08: Check Access ──────────────────────────
  describe("Check Access", function () {
    let recordId: bigint;
    let expiresAt: bigint;

    beforeEach(async function () {
      const fixture = await setupWithRecordFixture();
      userRegistry = fixture.registry;
      recordManager = fixture.records;
      accessControl = fixture.access;
      recordId = fixture.recordId;

      expiresAt = BigInt(Math.floor(Date.now() / 1000) + 86400);
      await accessControl.connect(patient1).grantAccess(
        recordId, doctor1.address, expiresAt, SAMPLE_ENCRYPTED_KEY_2
      );
    });

    it("should return true and key for active permission", async function () {
      const [hasAccess, encKey] = await accessControl.checkAccess(doctor1.address, recordId);
      
      expect(hasAccess).to.be.true;
      expect(encKey).to.equal(SAMPLE_ENCRYPTED_KEY_2);
    });

    it("should return false for non-granted access", async function () {
      const [hasAccess, encKey] = await accessControl.checkAccess(doctor2.address, recordId);
      
      expect(hasAccess).to.be.false;
      expect(encKey).to.equal("0x");
    });

    it("should return false for revoked access", async function () {
      await accessControl.connect(patient1).revokeAccess(recordId, doctor1.address);
      
      const [hasAccess, encKey] = await accessControl.checkAccess(doctor1.address, recordId);
      
      expect(hasAccess).to.be.false;
      expect(encKey).to.equal("0x");
    });
  });

  // ── AC-T09: Log Access (Audit Trail) ──────────────
  describe("Log Access", function () {
    let recordId: bigint;

    beforeEach(async function () {
      const fixture = await setupWithRecordFixture();
      userRegistry = fixture.registry;
      recordManager = fixture.records;
      accessControl = fixture.access;
      recordId = fixture.recordId;
    });

    it("should allow record owner to log access", async function () {
      const tx = accessControl.connect(patient1).logAccess(recordId, 0); // VIEW

      await expect(tx)
        .to.emit(accessControl, "RecordAccessed")
        .withArgs(recordId, patient1.address, patient1.address, 0n, () => true);
    });

    it("should allow granted doctor to log access", async function () {
      const expiresAt = BigInt(Math.floor(Date.now() / 1000) + 86400);
      await accessControl.connect(patient1).grantAccess(
        recordId, doctor1.address, expiresAt, SAMPLE_ENCRYPTED_KEY_2
      );

      const tx = accessControl.connect(doctor1).logAccess(recordId, 0);

      await expect(tx)
        .to.emit(accessControl, "RecordAccessed")
        .withArgs(recordId, doctor1.address, patient1.address, 0n, () => true);
    });

    it("should reject log from unauthorized user", async function () {
      await expect(
        accessControl.connect(doctor1).logAccess(recordId, 0)
      ).to.be.revertedWith("AccessControl: no access to record");
    });
  });

  // ── AC-T10: View Functions ────────────────────────
  describe("View Functions", function () {
    let recordId: bigint;

    beforeEach(async function () {
      const fixture = await setupWithRecordFixture();
      userRegistry = fixture.registry;
      recordManager = fixture.records;
      accessControl = fixture.access;
      recordId = fixture.recordId;

      const expiresAt = BigInt(Math.floor(Date.now() / 1000) + 86400);
      await accessControl.connect(patient1).grantAccess(
        recordId, doctor1.address, expiresAt, SAMPLE_ENCRYPTED_KEY_2
      );
    });

    it("should return shared records for doctor", async function () {
      const shared = await accessControl.getSharedRecords(doctor1.address);
      expect(shared).to.deep.equal([recordId]);
    });

    it("should return permissions for record", async function () {
      const perms = await accessControl.getPermissionsForRecord(recordId);
      expect(perms.length).to.equal(1);
      expect(perms[0].grantedTo).to.equal(doctor1.address);
    });

    it("should return permissions by owner", async function () {
      const perms = await accessControl.getPermissionsByOwner(patient1.address);
      expect(perms.length).to.equal(1);
      expect(perms[0].recordId).to.equal(recordId);
    });

    it("should return request count", async function () {
      await accessControl.connect(doctor1).requestAccess(patient1.address, [recordId], "Review");
      expect(await accessControl.getRequestCount()).to.equal(1n);
    });
  });

  // ── AC Edge Cases: expiry/revalidation/dedup ─────
  describe("Expiry, Revocation, and Edge Cases", function () {
    let recordId: bigint;

    beforeEach(async function () {
      const fixture = await setupWithRecordFixture();
      userRegistry = fixture.registry;
      recordManager = fixture.records;
      accessControl = fixture.access;
      owner = fixture.owner;
      patient1 = fixture.patient1;
      patient2 = fixture.patient2;
      doctor1 = fixture.doctor1;
      doctor2 = fixture.doctor2;
      stranger = fixture.stranger;
      recordId = fixture.recordId;
    });

    it("should allow access before expiry and reject access after expiry", async function () {
      const expiresAt = BigInt((await latestTimestamp()) + 3600);

      await accessControl.connect(patient1).grantAccess(
        recordId,
        doctor1.address,
        expiresAt,
        SAMPLE_ENCRYPTED_KEY_2
      );

      let [hasAccess, key] = await accessControl.checkAccess(doctor1.address, recordId);
      expect(hasAccess).to.equal(true);
      expect(key).to.equal(SAMPLE_ENCRYPTED_KEY_2);

      await increaseTime(3601);

      [hasAccess, key] = await accessControl.checkAccess(doctor1.address, recordId);
      expect(hasAccess).to.equal(false);
      expect(key).to.equal("0x");
    });

    it("should not allow approval of an expired access request", async function () {
      await accessControl.connect(doctor1).requestAccess(
        patient1.address,
        [recordId],
        "Emergency review"
      );

      await increaseTime(7 * 24 * 60 * 60 + 1);

      await expect(
        accessControl.connect(patient1).approveAccess(
          1n,
          BigInt((await latestTimestamp()) + 3600),
          [SAMPLE_ENCRYPTED_KEY_2]
        )
      ).to.be.revertedWith("AccessControl: request expired");
    });

    it("should revalidate record status during approval", async function () {
      await accessControl.connect(doctor1).requestAccess(
        patient1.address,
        [recordId],
        "Review"
      );

      await recordManager.connect(patient1).archiveRecord(recordId);

      await expect(
        accessControl.connect(patient1).approveAccess(
          1n,
          BigInt((await latestTimestamp()) + 3600),
          [SAMPLE_ENCRYPTED_KEY_2]
        )
      ).to.be.revertedWith("AccessControl: record not active");
    });

    it("should not duplicate permissions when access is granted twice to same doctor", async function () {
      const expiresAt1 = BigInt((await latestTimestamp()) + 3600);
      const expiresAt2 = BigInt((await latestTimestamp()) + 7200);

      await accessControl.connect(patient1).grantAccess(
        recordId,
        doctor1.address,
        expiresAt1,
        SAMPLE_ENCRYPTED_KEY
      );

      await accessControl.connect(patient1).grantAccess(
        recordId,
        doctor1.address,
        expiresAt2,
        SAMPLE_ENCRYPTED_KEY_2
      );

      const permissions = await accessControl.getPermissionsForRecord(recordId);
      const doctorPerms = permissions.filter(
        (p: any) => p.grantedTo.toLowerCase() === doctor1.address.toLowerCase()
      );

      expect(doctorPerms.length).to.equal(1);
      expect(doctorPerms[0].expiresAt).to.equal(expiresAt2);
    });

    it("should deny access after record is archived", async function () {
      const expiresAt = BigInt((await latestTimestamp()) + 3600);

      await accessControl.connect(patient1).grantAccess(
        recordId,
        doctor1.address,
        expiresAt,
        SAMPLE_ENCRYPTED_KEY_2
      );

      await recordManager.connect(patient1).archiveRecord(recordId);

      const [hasAccess] = await accessControl.checkAccess(doctor1.address, recordId);
      expect(hasAccess).to.equal(false);
    });
  });
});
