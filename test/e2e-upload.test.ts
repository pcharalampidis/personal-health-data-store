/**
 * E2E Upload Proof Test (M1.4)
 *
 * Validates the full vertical slice: encrypt → IPFS → chain
 *
 * Traceability:
 * - FR-006: Health Record Upload
 * - FR-007: Health Record Metadata
 * - FR-008: Health Record Retrieval
 * - RM-T01, RM-T03, RM-T19
 * - API-T04, API-T05
 *
 * This test simulates the complete upload flow that the frontend performs:
 * 1. Generate AES key and encrypt content (simulated with deterministic hash)
 * 2. Pin encrypted content to IPFS (simulated with mock CID)
 * 3. Store record reference on-chain via RecordManager
 * 4. Verify retrieval matches original metadata
 */

import { expect } from "chai";
import hre from "hardhat";
import { keccak256, toUtf8Bytes, randomBytes, hexlify } from "ethers";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("E2E Upload Flow (M1.4)", function () {
  let userRegistry: any;
  let recordManager: any;
  let patient: HardhatEthersSigner;

  const PUB_KEY = "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";

  async function deployFixture() {
    const connection = await hre.network.connect();
    const signers = await connection.ethers.getSigners();
    const [_owner, _patient] = signers;

    const UserRegistry = await connection.ethers.getContractFactory("UserRegistry");
    const userReg = await UserRegistry.deploy();

    const RecordManager = await connection.ethers.getContractFactory("RecordManager");
    const recMgr = await RecordManager.deploy(await userReg.getAddress());

    await userReg.connect(_patient).registerAsPatient(PUB_KEY);

    return { userRegistry: userReg, recordManager: recMgr, patient: _patient };
  }

  beforeEach(async function () {
    const f = await deployFixture();
    userRegistry = f.userRegistry;
    recordManager = f.recordManager;
    patient = f.patient;
  });

  /**
   * Simulates the client-side encryption step.
   * In production, the frontend uses Web Crypto AES-256-GCM.
   * Here we simulate the output: encrypted blob and wrapped key.
   */
  function simulateEncryption(plaintext: string) {
    const encryptedContent = Buffer.from(`encrypted:${plaintext}`);
    const contentHash = keccak256(encryptedContent);
    const aesKey = hexlify(randomBytes(32));
    const wrappedKey = hexlify(randomBytes(48));

    return { encryptedContent, contentHash, aesKey, wrappedKey };
  }

  /**
   * Simulates IPFS pinning via Pinata.
   * In production, backend calls Pinata and returns the CID.
   * Here we generate a deterministic mock CID from content hash.
   */
  function simulateIPFSPin(contentHash: string): string {
    const hashFragment = contentHash.slice(2, 48);
    return `Qm${hashFragment}`;
  }

  describe("Complete Upload Flow", function () {
    it("should complete full encrypt → IPFS → chain flow for a single record", async function () {
      const originalContent = "Patient lab results: Blood glucose 95 mg/dL";

      const { encryptedContent, contentHash, wrappedKey } = simulateEncryption(originalContent);
      const ipfsCID = simulateIPFSPin(contentHash);

      const tx = await recordManager.connect(patient).addRecord(
        ipfsCID,
        contentHash,
        0,
        wrappedKey
      );

      await expect(tx)
        .to.emit(recordManager, "RecordAdded")
        .withArgs(1n, patient.address, ipfsCID, 0n, () => true);

      const record = await recordManager.getRecord(1);
      expect(record.owner).to.equal(patient.address);
      expect(record.ipfsCID).to.equal(ipfsCID);
      expect(record.contentHash).to.equal(contentHash);
      expect(record.status).to.equal(0n);

      const storedCID = await recordManager.getRecordCID(1);
      expect(storedCID).to.equal(ipfsCID);

      const storedKey = await recordManager.getEncryptedKey(1, patient.address);
      expect(storedKey).to.equal(wrappedKey);
    });

    it("should maintain content integrity across multiple records", async function () {
      const records = [
        { content: "Lab result 1", type: 0 },
        { content: "Prescription for medication X", type: 1 },
        { content: "Imaging report - chest X-ray", type: 2 },
      ];

      const storedData: { cid: string; hash: string; key: string }[] = [];

      for (let i = 0; i < records.length; i++) {
        const { contentHash, wrappedKey } = simulateEncryption(records[i].content);
        const ipfsCID = simulateIPFSPin(contentHash);

        await recordManager.connect(patient).addRecord(
          ipfsCID,
          contentHash,
          records[i].type,
          wrappedKey
        );

        storedData.push({ cid: ipfsCID, hash: contentHash, key: wrappedKey });
      }

      const patientRecords = await recordManager.getRecordsByOwner(patient.address);
      expect(patientRecords.length).to.equal(3);

      for (let i = 0; i < records.length; i++) {
        const recordId = patientRecords[i];
        const record = await recordManager.getRecord(recordId);

        expect(record.ipfsCID).to.equal(storedData[i].cid);
        expect(record.contentHash).to.equal(storedData[i].hash);
        expect(record.recordType).to.equal(BigInt(records[i].type));

        const storedKey = await recordManager.getEncryptedKey(recordId, patient.address);
        expect(storedKey).to.equal(storedData[i].key);
      }
    });

    it("should preserve record metadata through lifecycle operations", async function () {
      const { contentHash, wrappedKey } = simulateEncryption("Important health record");
      const ipfsCID = simulateIPFSPin(contentHash);

      await recordManager.connect(patient).addRecord(ipfsCID, contentHash, 0, wrappedKey);
      const recordId = 1n;

      let record = await recordManager.getRecord(recordId);
      expect(record.status).to.equal(0n);
      expect(record.ipfsCID).to.equal(ipfsCID);
      expect(record.contentHash).to.equal(contentHash);

      await recordManager.connect(patient).archiveRecord(recordId);
      record = await recordManager.getRecord(recordId);
      expect(record.status).to.equal(1n);
      expect(record.ipfsCID).to.equal(ipfsCID);
      expect(record.contentHash).to.equal(contentHash);

      await recordManager.connect(patient).restoreRecord(recordId);
      record = await recordManager.getRecord(recordId);
      expect(record.status).to.equal(0n);
      expect(record.ipfsCID).to.equal(ipfsCID);
      expect(record.contentHash).to.equal(contentHash);

      const storedKey = await recordManager.getEncryptedKey(recordId, patient.address);
      expect(storedKey).to.equal(wrappedKey);
    });

    it("should support emergency flag toggle without affecting stored data", async function () {
      const { contentHash, wrappedKey } = simulateEncryption("Emergency-eligible record");
      const ipfsCID = simulateIPFSPin(contentHash);

      await recordManager.connect(patient).addRecord(ipfsCID, contentHash, 0, wrappedKey);
      const recordId = 1n;

      let record = await recordManager.getRecord(recordId);
      expect(record.isEmergency).to.be.false;

      await recordManager.connect(patient).setEmergencyFlag(recordId, true);
      record = await recordManager.getRecord(recordId);
      expect(record.isEmergency).to.be.true;
      expect(record.ipfsCID).to.equal(ipfsCID);
      expect(record.contentHash).to.equal(contentHash);

      const emergencyRecords = await recordManager.getEmergencyRecords(patient.address);
      expect(emergencyRecords.length).to.equal(1);
      expect(emergencyRecords[0]).to.equal(recordId);

      await recordManager.connect(patient).setEmergencyFlag(recordId, false);
      record = await recordManager.getRecord(recordId);
      expect(record.isEmergency).to.be.false;
    });
  });

  describe("Data Integrity Verification", function () {
    it("should produce different content hashes for different content", async function () {
      const content1 = "Patient record A";
      const content2 = "Patient record B";

      const { contentHash: hash1 } = simulateEncryption(content1);
      const { contentHash: hash2 } = simulateEncryption(content2);

      expect(hash1).to.not.equal(hash2);

      const cid1 = simulateIPFSPin(hash1);
      const cid2 = simulateIPFSPin(hash2);

      expect(cid1).to.not.equal(cid2);
    });

    it("should produce identical hash for identical content (deterministic)", async function () {
      const content = "Identical content for hashing";

      const encryptedContent1 = Buffer.from(`encrypted:${content}`);
      const encryptedContent2 = Buffer.from(`encrypted:${content}`);

      const hash1 = keccak256(encryptedContent1);
      const hash2 = keccak256(encryptedContent2);

      expect(hash1).to.equal(hash2);
    });

    it("should allow verification of stored content hash against retrieved CID", async function () {
      const originalContent = "Verifiable health record content";
      const { encryptedContent, contentHash, wrappedKey } = simulateEncryption(originalContent);
      const ipfsCID = simulateIPFSPin(contentHash);

      await recordManager.connect(patient).addRecord(ipfsCID, contentHash, 0, wrappedKey);

      const storedCID = await recordManager.getRecordCID(1);
      const record = await recordManager.getRecord(1);

      expect(storedCID).to.equal(ipfsCID);

      const recomputedHash = keccak256(encryptedContent);
      expect(record.contentHash).to.equal(recomputedHash);
    });
  });
});
