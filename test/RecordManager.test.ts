import { expect } from "chai";
import hre from "hardhat";
import { keccak256, toUtf8Bytes } from "ethers";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("RecordManager", function () {
  let userRegistry: any;
  let recordManager: any;
  let owner: HardhatEthersSigner;
  let patient1: HardhatEthersSigner;
  let patient2: HardhatEthersSigner;
  let doctor1: HardhatEthersSigner;
  let stranger: HardhatEthersSigner;

  const PUB_KEY = "0xabcdef1234567890";
  const SAMPLE_CID = "QmTest1234567890abcdefghijklmnopqrstuvwxyz";
  const SAMPLE_HASH = keccak256(toUtf8Bytes("encrypted-health-record-content"));
  const SAMPLE_ENCRYPTED_KEY = "0xdeadbeefcafebabe";
  const SAMPLE_ENCRYPTED_KEY_2 = "0x1111222233334444";

  async function deployFixture() {
    const connection = await hre.network.connect();
    const signers = await connection.ethers.getSigners();
    const [_owner, _patient1, _patient2, _doctor1, _stranger] = signers;

    const UserRegistry = await connection.ethers.getContractFactory("UserRegistry");
    const userReg = await UserRegistry.deploy();

    const RecordManager = await connection.ethers.getContractFactory("RecordManager");
    const recMgr = await RecordManager.deploy(await userReg.getAddress());

    // Register users
    await userReg.connect(_patient1).registerAsPatient(PUB_KEY);
    await userReg.connect(_patient2).registerAsPatient(PUB_KEY);
    await userReg.connect(_doctor1).registerAsDoctor(
      "Dr. Smith", "LIC-001", "Cardiology", "Hospital", PUB_KEY
    );
    await userReg.connect(_owner).verifyDoctor(_doctor1.address);

    return {
      userRegistry: userReg,
      recordManager: recMgr,
      owner: _owner,
      patient1: _patient1,
      patient2: _patient2,
      doctor1: _doctor1,
      stranger: _stranger,
      connection,
    };
  }

  beforeEach(async function () {
    const f = await deployFixture();
    userRegistry = f.userRegistry;
    recordManager = f.recordManager;
    owner = f.owner;
    patient1 = f.patient1;
    patient2 = f.patient2;
    doctor1 = f.doctor1;
    stranger = f.stranger;
  });

  // ── RM-T01: Add record ────────────────────────────
  describe("addRecord", function () {
    it("should allow a patient to add a record", async function () {
      const tx = recordManager.connect(patient1).addRecord(
        SAMPLE_CID, SAMPLE_HASH, 0, SAMPLE_ENCRYPTED_KEY // RecordType.LabResult = 0
      );

      await expect(tx)
        .to.emit(recordManager, "RecordAdded")
        .withArgs(1n, patient1.address, SAMPLE_CID, 0n, () => true);

      const record = await recordManager.getRecord(1);
      expect(record.owner).to.equal(patient1.address);
      expect(record.ipfsCID).to.equal(SAMPLE_CID);
      expect(record.contentHash).to.equal(SAMPLE_HASH);
      expect(record.recordType).to.equal(0n);
      expect(record.status).to.equal(0n); // Active
      expect(record.isEmergency).to.be.false;
    });

    it("should store encrypted key for owner on add", async function () {
      await recordManager.connect(patient1).addRecord(
        SAMPLE_CID, SAMPLE_HASH, 0, SAMPLE_ENCRYPTED_KEY
      );
      const key = await recordManager.getEncryptedKey(1, patient1.address);
      expect(key).to.equal(SAMPLE_ENCRYPTED_KEY);
    });

    it("should assign sequential record IDs", async function () {
      await recordManager.connect(patient1).addRecord(SAMPLE_CID, SAMPLE_HASH, 0, SAMPLE_ENCRYPTED_KEY);
      await recordManager.connect(patient1).addRecord("QmSecond", SAMPLE_HASH, 1, SAMPLE_ENCRYPTED_KEY);
      expect(await recordManager.getRecordCount()).to.equal(2n);

      const rec1 = await recordManager.getRecord(1);
      const rec2 = await recordManager.getRecord(2);
      expect(rec1.recordId).to.equal(1n);
      expect(rec2.recordId).to.equal(2n);
    });

    it("should reject add from non-patient", async function () {
      await expect(
        recordManager.connect(doctor1).addRecord(SAMPLE_CID, SAMPLE_HASH, 0, SAMPLE_ENCRYPTED_KEY)
      ).to.be.revertedWith("RecordManager: caller is not a patient");
    });

    it("should reject add from unregistered address", async function () {
      await expect(
        recordManager.connect(stranger).addRecord(SAMPLE_CID, SAMPLE_HASH, 0, SAMPLE_ENCRYPTED_KEY)
      ).to.be.revertedWith("RecordManager: caller is not a patient");
    });

    it("should reject add with empty CID", async function () {
      await expect(
        recordManager.connect(patient1).addRecord("", SAMPLE_HASH, 0, SAMPLE_ENCRYPTED_KEY)
      ).to.be.revertedWith("RecordManager: empty CID");
    });

    it("should reject add with zero content hash", async function () {
      await expect(
        recordManager.connect(patient1).addRecord(
          SAMPLE_CID,
          "0x0000000000000000000000000000000000000000000000000000000000000000",
          0,
          SAMPLE_ENCRYPTED_KEY
        )
      ).to.be.revertedWith("RecordManager: zero content hash");
    });

    it("should reject add with empty encrypted key", async function () {
      await expect(
        recordManager.connect(patient1).addRecord(SAMPLE_CID, SAMPLE_HASH, 0, "0x")
      ).to.be.revertedWith("RecordManager: empty encrypted key");
    });
  });

  // ── RM-T05: getRecordsByOwner ─────────────────────
  describe("getRecordsByOwner", function () {
    it("should return all records for an owner", async function () {
      await recordManager.connect(patient1).addRecord(SAMPLE_CID, SAMPLE_HASH, 0, SAMPLE_ENCRYPTED_KEY);
      await recordManager.connect(patient1).addRecord("QmSecond", SAMPLE_HASH, 1, SAMPLE_ENCRYPTED_KEY);
      await recordManager.connect(patient2).addRecord("QmThird", SAMPLE_HASH, 2, SAMPLE_ENCRYPTED_KEY);

      const p1Records = await recordManager.getRecordsByOwner(patient1.address);
      expect(p1Records.length).to.equal(2);
      expect(p1Records[0]).to.equal(1n);
      expect(p1Records[1]).to.equal(2n);

      const p2Records = await recordManager.getRecordsByOwner(patient2.address);
      expect(p2Records.length).to.equal(1);
    });
  });

  // ── RM-T06 - RM-T07: Archive/restore/delete ──────
  describe("Record Lifecycle", function () {
    beforeEach(async function () {
      await recordManager.connect(patient1).addRecord(SAMPLE_CID, SAMPLE_HASH, 0, SAMPLE_ENCRYPTED_KEY);
    });

    it("should archive an active record", async function () {
      await expect(recordManager.connect(patient1).archiveRecord(1))
        .to.emit(recordManager, "RecordArchived")
        .withArgs(1n, patient1.address, () => true);

      const record = await recordManager.getRecord(1);
      expect(record.status).to.equal(1n); // Archived
      expect(await recordManager.isRecordActive(1)).to.be.false;
    });

    it("should restore an archived record", async function () {
      await recordManager.connect(patient1).archiveRecord(1);

      await expect(recordManager.connect(patient1).restoreRecord(1))
        .to.emit(recordManager, "RecordRestored")
        .withArgs(1n, patient1.address, () => true);

      const record = await recordManager.getRecord(1);
      expect(record.status).to.equal(0n); // Active
    });

    it("should delete a record", async function () {
      await expect(recordManager.connect(patient1).deleteRecord(1))
        .to.emit(recordManager, "RecordDeleted")
        .withArgs(1n, patient1.address, () => true);

      const record = await recordManager.getRecord(1);
      expect(record.status).to.equal(2n); // Deleted
      expect(record.ipfsCID).to.equal("");
    });

    it("should reject archive by non-owner", async function () {
      await expect(
        recordManager.connect(patient2).archiveRecord(1)
      ).to.be.revertedWith("RecordManager: caller is not record owner");
    });

    it("should reject archive of already archived record", async function () {
      await recordManager.connect(patient1).archiveRecord(1);
      await expect(
        recordManager.connect(patient1).archiveRecord(1)
      ).to.be.revertedWith("RecordManager: record is not active");
    });

    it("should reject restore of active record", async function () {
      await expect(
        recordManager.connect(patient1).restoreRecord(1)
      ).to.be.revertedWith("RecordManager: not archived");
    });

    it("should reject double delete", async function () {
      await recordManager.connect(patient1).deleteRecord(1);
      await expect(
        recordManager.connect(patient1).deleteRecord(1)
      ).to.be.revertedWith("RecordManager: already deleted");
    });

    it("should reject operations on non-existent record", async function () {
      await expect(
        recordManager.connect(patient1).archiveRecord(999)
      ).to.be.revertedWith("RecordManager: record does not exist");
    });
  });

  // ── RM-T15 - RM-T18: Emergency flag ──────────────
  describe("Emergency Flag", function () {
    beforeEach(async function () {
      await recordManager.connect(patient1).addRecord(SAMPLE_CID, SAMPLE_HASH, 0, SAMPLE_ENCRYPTED_KEY);
    });

    it("should set emergency flag to true", async function () {
      await expect(recordManager.connect(patient1).setEmergencyFlag(1, true))
        .to.emit(recordManager, "EmergencyFlagUpdated")
        .withArgs(1n, patient1.address, true, () => true);

      const record = await recordManager.getRecord(1);
      expect(record.isEmergency).to.be.true;
    });

    it("should set emergency flag back to false", async function () {
      await recordManager.connect(patient1).setEmergencyFlag(1, true);
      await recordManager.connect(patient1).setEmergencyFlag(1, false);

      const record = await recordManager.getRecord(1);
      expect(record.isEmergency).to.be.false;
    });

    it("should return emergency records correctly", async function () {
      await recordManager.connect(patient1).addRecord("QmSecond", SAMPLE_HASH, 1, SAMPLE_ENCRYPTED_KEY);
      await recordManager.connect(patient1).setEmergencyFlag(1, true);

      const emergency = await recordManager.getEmergencyRecords(patient1.address);
      expect(emergency.length).to.equal(1);
      expect(emergency[0]).to.equal(1n);
    });

    it("should reject emergency flag from non-owner", async function () {
      await expect(
        recordManager.connect(patient2).setEmergencyFlag(1, true)
      ).to.be.revertedWith("RecordManager: caller is not record owner");
    });
  });

  // ── Encrypted key storage ─────────────────────────
  describe("Encrypted Key Storage", function () {
    beforeEach(async function () {
      await recordManager.connect(patient1).addRecord(SAMPLE_CID, SAMPLE_HASH, 0, SAMPLE_ENCRYPTED_KEY);
    });

    it("should allow record owner to store key for another user", async function () {
      await recordManager.connect(patient1).storeEncryptedKey(1, doctor1.address, SAMPLE_ENCRYPTED_KEY_2);
      const key = await recordManager.getEncryptedKey(1, doctor1.address);
      expect(key).to.equal(SAMPLE_ENCRYPTED_KEY_2);
    });

    it("should allow record owner to remove key", async function () {
      await recordManager.connect(patient1).storeEncryptedKey(1, doctor1.address, SAMPLE_ENCRYPTED_KEY_2);
      await recordManager.connect(patient1).removeEncryptedKey(1, doctor1.address);
      const key = await recordManager.getEncryptedKey(1, doctor1.address);
      expect(key).to.equal("0x");
    });

    it("should reject key storage from unauthorised caller", async function () {
      await expect(
        recordManager.connect(stranger).storeEncryptedKey(1, stranger.address, SAMPLE_ENCRYPTED_KEY)
      ).to.be.revertedWith("RecordManager: unauthorised key storage");
    });

    it("should reject key removal from unauthorised caller", async function () {
      await expect(
        recordManager.connect(stranger).removeEncryptedKey(1, patient1.address)
      ).to.be.revertedWith("RecordManager: unauthorised key removal");
    });
  });

  // ── Pausable ──────────────────────────────────────
  describe("Pausable", function () {
    it("should block addRecord when paused", async function () {
      await recordManager.connect(owner).pause();
      await expect(
        recordManager.connect(patient1).addRecord(SAMPLE_CID, SAMPLE_HASH, 0, SAMPLE_ENCRYPTED_KEY)
      ).to.be.revertedWith("RecordManager: contract is paused");
    });
  });

  // ── View Functions ────────────────────────────────
  describe("View Functions", function () {
    it("should revert getRecord for non-existent ID", async function () {
      await expect(recordManager.getRecord(999)).to.be.revertedWith("RecordManager: record does not exist");
    });

    it("should return true for active record in isRecordActive", async function () {
      await recordManager.connect(patient1).addRecord(SAMPLE_CID, SAMPLE_HASH, 0, SAMPLE_ENCRYPTED_KEY);
      expect(await recordManager.isRecordActive(1)).to.be.true;
    });

    it("should return false for non-existent record in isRecordActive", async function () {
      expect(await recordManager.isRecordActive(999)).to.be.false;
    });
  });
});
