import { expect } from "chai";
import hre from "hardhat";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("EmergencyAccess (Hybrid Model)", function () {
  let userRegistry: any;
  let recordManager: any;
  let emergencyAccess: any;
  let owner: HardhatEthersSigner; // Custodian
  let patient1: HardhatEthersSigner;
  let patient2: HardhatEthersSigner;
  let doctor1: HardhatEthersSigner;
  let doctor2: HardhatEthersSigner;
  let trustedFriend: HardhatEthersSigner; // Registered user, not a doctor
  let stranger: HardhatEthersSigner;

  const SAMPLE_PUB_KEY = "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";
  const SAMPLE_PUB_KEY_2 = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
  const SAMPLE_CID = "QmTest1234567890abcdef";
  const SAMPLE_HASH = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
  const SAMPLE_ENCRYPTED_KEY = "0xaabbccddeeff00112233445566778899aabbccddeeff00112233445566778899";
  const SAMPLE_EMERGENCY_KEY = "0x112233445566778899aabbccddeeff00112233445566778899aabbccddeeff00";
  const SAMPLE_ENCRYPTED_OTP = "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef";
  
  const ONE_HOUR = 3600;
  const TWENTY_FOUR_HOURS = 86400;

  async function increaseTime(seconds: number): Promise<void> {
    const provider = (emergencyAccess.runner as any)?.provider;
    await provider.send("evm_increaseTime", [seconds]);
    await provider.send("evm_mine");
  }

  async function deployFixture() {
    const connection = await hre.network.connect();
    const signers = await connection.ethers.getSigners();
    [owner, patient1, patient2, doctor1, doctor2, trustedFriend, stranger] = signers;

    const UserRegistry = await connection.ethers.getContractFactory("UserRegistry");
    const registry = await UserRegistry.deploy();

    const RecordManager = await connection.ethers.getContractFactory("RecordManager");
    const records = await RecordManager.deploy(await registry.getAddress());

    const EmergencyAccess = await connection.ethers.getContractFactory("EmergencyAccess");
    const emergency = await EmergencyAccess.deploy(
      await registry.getAddress(),
      await records.getAddress()
    );

    await records.setEmergencyAccessAddress(await emergency.getAddress());

    return { registry, records, emergency, owner, patient1, patient2, doctor1, doctor2, trustedFriend, stranger, connection };
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
    await base.registry.connect(base.trustedFriend).registerAsPatient(SAMPLE_PUB_KEY);
    
    return base;
  }

  async function setupWithEmergencyRecordFixture() {
    const base = await setupUsersFixture();
    
    await base.records.connect(base.patient1).addRecord(
      SAMPLE_CID,
      SAMPLE_HASH,
      0, // LabResult
      SAMPLE_ENCRYPTED_KEY
    );
    await base.records.connect(base.patient1).setEmergencyFlag(1n, true);
    
    return { ...base, recordId: 1n };
  }

  async function setupConfiguredPatientFixture() {
    const base = await setupWithEmergencyRecordFixture();
    
    await base.emergency.connect(base.patient1).configureEmergencyAccess(
      [base.doctor1.address, base.trustedFriend.address],
      TWENTY_FOUR_HOURS
    );
    
    await base.emergency.connect(base.patient1).storeEmergencyKeys(
      [1n],
      [base.doctor1.address, base.trustedFriend.address],
      [SAMPLE_EMERGENCY_KEY, SAMPLE_EMERGENCY_KEY]
    );
    
    return base;
  }

  beforeEach(async function () {
    const fixture = await deployFixture();
    userRegistry = fixture.registry;
    recordManager = fixture.records;
    emergencyAccess = fixture.emergency;
    owner = fixture.owner;
    patient1 = fixture.patient1;
    patient2 = fixture.patient2;
    doctor1 = fixture.doctor1;
    doctor2 = fixture.doctor2;
    trustedFriend = fixture.trustedFriend;
    stranger = fixture.stranger;
  });

  // ══════════════════════════════════════════════════
  // TRUSTED CONTACTS CONFIGURATION
  // ══════════════════════════════════════════════════
  describe("Trusted Contacts Configuration", function () {
    beforeEach(async function () {
      const fixture = await setupWithEmergencyRecordFixture();
      userRegistry = fixture.registry;
      recordManager = fixture.records;
      emergencyAccess = fixture.emergency;
    });

    it("should allow patient to configure emergency access with any registered users", async function () {
      const tx = emergencyAccess.connect(patient1).configureEmergencyAccess(
        [doctor1.address, trustedFriend.address],
        TWENTY_FOUR_HOURS
      );

      await expect(tx)
        .to.emit(emergencyAccess, "EmergencyConfigured")
        .withArgs(patient1.address, [doctor1.address, trustedFriend.address], TWENTY_FOUR_HOURS, () => true);

      const config = await emergencyAccess.getEmergencyConfig(patient1.address);
      expect(config.isConfigured).to.be.true;
      expect(config.trustedContacts).to.deep.equal([doctor1.address, trustedFriend.address]);
    });

    it("should correctly track trusted contacts", async function () {
      await emergencyAccess.connect(patient1).configureEmergencyAccess(
        [doctor1.address, trustedFriend.address],
        TWENTY_FOUR_HOURS
      );

      expect(await emergencyAccess.isEmergencyContact(doctor1.address, patient1.address)).to.be.true;
      expect(await emergencyAccess.isEmergencyContact(trustedFriend.address, patient1.address)).to.be.true;
      expect(await emergencyAccess.isEmergencyContact(doctor2.address, patient1.address)).to.be.false;
    });
  });

  // ══════════════════════════════════════════════════
  // PATH 1: TRUSTED CONTACT - IMMEDIATE ACCESS
  // ══════════════════════════════════════════════════
  describe("Path 1: Trusted Contact - Immediate Access", function () {
    beforeEach(async function () {
      const fixture = await setupConfiguredPatientFixture();
      userRegistry = fixture.registry;
      recordManager = fixture.records;
      emergencyAccess = fixture.emergency;
    });

    it("should give trusted contact immediate Active session", async function () {
      const tx = emergencyAccess.connect(doctor1).triggerEmergencyAccess(patient1.address);

      await expect(tx)
        .to.emit(emergencyAccess, "EmergencyAccessTriggered")
        .withArgs(1n, patient1.address, doctor1.address, 0n, () => true); // TriggerType.TrustedContact = 0

      const session = await emergencyAccess.getSession(1n);
      expect(session.status).to.equal(1n); // Active
      expect(session.triggerType).to.equal(0n); // TrustedContact
      expect(session.expiresAt).to.be.gt(0n);
    });

    it("should allow trusted contact to consume and get record IDs", async function () {
      await emergencyAccess.connect(doctor1).triggerEmergencyAccess(patient1.address);
      
      const result = await emergencyAccess.connect(doctor1).consumeEmergencyAccess.staticCall(1n);
      expect(result.recordIds).to.deep.equal([1n]);
      expect(result.encryptedData).to.equal("0x");
    });
  });

  // ══════════════════════════════════════════════════
  // PATH 2: CUSTODIAN REGISTRY - VALIDATED ACCESS
  // ══════════════════════════════════════════════════
  describe("Path 2: Custodian Registry - Validated Access", function () {
    beforeEach(async function () {
      const fixture = await setupWithEmergencyRecordFixture();
      userRegistry = fixture.registry;
      recordManager = fixture.records;
      emergencyAccess = fixture.emergency;
    });

    it("should create Pending session for verified doctor (non-trusted)", async function () {
      const tx = emergencyAccess.connect(doctor1).triggerEmergencyAccess(patient1.address);

      await expect(tx)
        .to.emit(emergencyAccess, "EmergencyAccessTriggered")
        .withArgs(1n, patient1.address, doctor1.address, 1n, () => true); // TriggerType.CustodianRegistry = 1

      const session = await emergencyAccess.getSession(1n);
      expect(session.status).to.equal(0n); // Pending
      expect(session.triggerType).to.equal(1n); // CustodianRegistry
      expect(session.expiresAt).to.equal(0n);
    });

    it("should allow Custodian to issue OTP", async function () {
      await emergencyAccess.connect(doctor1).triggerEmergencyAccess(patient1.address);
      
      const tx = emergencyAccess.connect(owner).issueEmergencyOTP(
        1n,
        SAMPLE_ENCRYPTED_OTP,
        TWENTY_FOUR_HOURS
      );

      await expect(tx).to.emit(emergencyAccess, "EmergencyOTPIssued");

      const session = await emergencyAccess.getSession(1n);
      expect(session.status).to.equal(1n); // Active
      expect(session.encryptedOTP).to.equal(SAMPLE_ENCRYPTED_OTP);
    });
  });

  // ══════════════════════════════════════════════════
  // SESSION MANAGEMENT
  // ══════════════════════════════════════════════════
  describe("Session Management", function () {
    beforeEach(async function () {
      const fixture = await setupConfiguredPatientFixture();
      userRegistry = fixture.registry;
      recordManager = fixture.records;
      emergencyAccess = fixture.emergency;
    });

    it("should allow patient to revoke trusted contact session", async function () {
      await emergencyAccess.connect(doctor1).triggerEmergencyAccess(patient1.address);
      
      const tx = emergencyAccess.connect(patient1).revokeEmergencySession(1n);
      await expect(tx).to.emit(emergencyAccess, "EmergencySessionRevoked");

      const session = await emergencyAccess.getSession(1n);
      expect(session.status).to.equal(4n); // Revoked
    });

    it("should allow logging emergency record access", async function () {
      await emergencyAccess.connect(doctor1).triggerEmergencyAccess(patient1.address);
      await emergencyAccess.connect(doctor1).consumeEmergencyAccess(1n);
      
      const tx = emergencyAccess.connect(doctor1).logEmergencyRecordAccess(1n, 1n);
      await expect(tx).to.emit(emergencyAccess, "EmergencyRecordAccessed");

      const session = await emergencyAccess.getSession(1n);
      expect(session.recordsAccessed).to.equal(1n);
    });
  });

  // ══════════════════════════════════════════════════
  // EMERGENCY ACCESS EDGE CASES
  // ══════════════════════════════════════════════════
  describe("Emergency Access Edge Cases", function () {
    beforeEach(async function () {
      const fixture = await setupConfiguredPatientFixture();
      userRegistry = fixture.registry;
      recordManager = fixture.records;
      emergencyAccess = fixture.emergency;
      owner = fixture.owner;
      patient1 = fixture.patient1;
      doctor1 = fixture.doctor1;
      doctor2 = fixture.doctor2;
    });

    it("should allow only custodian to issue emergency OTP", async function () {
      await emergencyAccess.connect(doctor2).triggerEmergencyAccess(patient1.address);

      await expect(
        emergencyAccess.connect(doctor2).issueEmergencyOTP(
          1n,
          SAMPLE_ENCRYPTED_OTP,
          TWENTY_FOUR_HOURS
        )
      ).to.be.revertedWith("EmergencyAccess: caller is not the Custodian");

      await expect(
        emergencyAccess.connect(owner).issueEmergencyOTP(
          1n,
          SAMPLE_ENCRYPTED_OTP,
          TWENTY_FOUR_HOURS
        )
      )
        .to.emit(emergencyAccess, "EmergencyOTPIssued")
        .withArgs(
          1n,
          patient1.address,
          doctor2.address,
          () => true,
          () => true
        );
    });

    it("should reject emergency access consumption after expiry", async function () {
      await emergencyAccess.connect(doctor2).triggerEmergencyAccess(patient1.address);

      await emergencyAccess.connect(owner).issueEmergencyOTP(
        1n,
        SAMPLE_ENCRYPTED_OTP,
        ONE_HOUR
      );

      await increaseTime(ONE_HOUR + 1);

      await expect(
        emergencyAccess.connect(doctor2).consumeEmergencyAccess(1n)
      ).to.be.revertedWith("EmergencyAccess: session expired");
    });
  });
});
