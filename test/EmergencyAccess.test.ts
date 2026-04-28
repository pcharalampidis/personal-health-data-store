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
    // trustedFriend is a registered patient (not a doctor) - represents family member
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
    
    // Patient configures trusted contacts: doctor1 (verified) and trustedFriend (not a doctor)
    await base.emergency.connect(base.patient1).configureEmergencyAccess(
      [base.doctor1.address, base.trustedFriend.address],
      TWENTY_FOUR_HOURS
    );
    
    // Store emergency keys for trusted contacts
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
      // trustedFriend is a patient, not a doctor - patient autonomy allows this
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

    it("should reject configuration from non-patient", async function () {
      await expect(
        emergencyAccess.connect(doctor1).configureEmergencyAccess([doctor1.address], TWENTY_FOUR_HOURS)
      ).to.be.revertedWith("EmergencyAccess: caller is not a patient");
    });

    it("should reject configuration with unregistered contact", async function () {
      await expect(
        emergencyAccess.connect(patient1).configureEmergencyAccess([stranger.address], TWENTY_FOUR_HOURS)
      ).to.be.revertedWith("EmergencyAccess: contact not registered");
    });

    it("should reject configuration with empty contacts", async function () {
      await expect(
        emergencyAccess.connect(patient1).configureEmergencyAccess([], TWENTY_FOUR_HOURS)
      ).to.be.revertedWith("EmergencyAccess: no trusted contacts");
    });

    it("should reject invalid session duration", async function () {
      await expect(
        emergencyAccess.connect(patient1).configureEmergencyAccess([doctor1.address], ONE_HOUR - 1)
      ).to.be.revertedWith("EmergencyAccess: invalid session duration");
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

  describe("Store Emergency Keys", function () {
    beforeEach(async function () {
      const fixture = await setupWithEmergencyRecordFixture();
      userRegistry = fixture.registry;
      recordManager = fixture.records;
      emergencyAccess = fixture.emergency;

      await emergencyAccess.connect(patient1).configureEmergencyAccess(
        [doctor1.address, trustedFriend.address],
        TWENTY_FOUR_HOURS
      );
    });

    it("should allow patient to store emergency keys", async function () {
      const tx = emergencyAccess.connect(patient1).storeEmergencyKeys(
        [1n],
        [doctor1.address, trustedFriend.address],
        [SAMPLE_EMERGENCY_KEY, SAMPLE_EMERGENCY_KEY]
      );

      await expect(tx)
        .to.emit(emergencyAccess, "EmergencyKeysStored")
        .withArgs(patient1.address, 1, 2, () => true);
    });

    it("should reject storing keys for non-trusted contact", async function () {
      await expect(
        emergencyAccess.connect(patient1).storeEmergencyKeys(
          [1n],
          [doctor2.address],
          [SAMPLE_EMERGENCY_KEY]
        )
      ).to.be.revertedWith("EmergencyAccess: not a trusted contact");
    });

    it("should reject storing keys for non-emergency record", async function () {
      await recordManager.connect(patient1).addRecord(SAMPLE_CID, SAMPLE_HASH, 1, SAMPLE_ENCRYPTED_KEY);
      
      await expect(
        emergencyAccess.connect(patient1).storeEmergencyKeys(
          [2n],
          [doctor1.address],
          [SAMPLE_EMERGENCY_KEY]
        )
      ).to.be.revertedWith("EmergencyAccess: record not flagged for emergency");
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
      expect(session.status).to.equal(1n); // Active (not Pending!)
      expect(session.triggerType).to.equal(0n); // TrustedContact
      expect(session.expiresAt).to.be.gt(0n);
    });

    it("should allow non-doctor trusted contact (family member) to trigger", async function () {
      const tx = emergencyAccess.connect(trustedFriend).triggerEmergencyAccess(patient1.address);

      await expect(tx).to.emit(emergencyAccess, "EmergencyAccessTriggered");

      const session = await emergencyAccess.getSession(1n);
      expect(session.status).to.equal(1n); // Active
      expect(session.doctor).to.equal(trustedFriend.address);
    });

    it("should NOT add trusted contact session to pending list", async function () {
      await emergencyAccess.connect(doctor1).triggerEmergencyAccess(patient1.address);

      const pending = await emergencyAccess.getPendingSessions();
      expect(pending.length).to.equal(0);
    });

    it("should allow trusted contact to consume and get record IDs", async function () {
      await emergencyAccess.connect(doctor1).triggerEmergencyAccess(patient1.address);
      
      const result = await emergencyAccess.connect(doctor1).consumeEmergencyAccess.staticCall(1n);
      expect(result.recordIds).to.deep.equal([1n]);
      expect(result.encryptedData).to.equal("0x"); // Empty for trusted contact path
    });

    it("should allow trusted contact to get pre-stored emergency key", async function () {
      await emergencyAccess.connect(doctor1).triggerEmergencyAccess(patient1.address);
      await emergencyAccess.connect(doctor1).consumeEmergencyAccess(1n);

      const key = await emergencyAccess.connect(doctor1).getEmergencyKey(patient1.address, 1n);
      expect(key).to.equal(SAMPLE_EMERGENCY_KEY);
    });

    it("should reject duplicate active session for same trusted contact", async function () {
      await emergencyAccess.connect(doctor1).triggerEmergencyAccess(patient1.address);
      
      await expect(
        emergencyAccess.connect(doctor1).triggerEmergencyAccess(patient1.address)
      ).to.be.revertedWith("EmergencyAccess: active session already exists");
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
      // Note: patient1 has NOT configured trusted contacts
    });

    it("should create Pending session for verified doctor (non-trusted)", async function () {
      const tx = emergencyAccess.connect(doctor1).triggerEmergencyAccess(patient1.address);

      await expect(tx)
        .to.emit(emergencyAccess, "EmergencyAccessTriggered")
        .withArgs(1n, patient1.address, doctor1.address, 1n, () => true); // TriggerType.CustodianRegistry = 1

      const session = await emergencyAccess.getSession(1n);
      expect(session.status).to.equal(0n); // Pending
      expect(session.triggerType).to.equal(1n); // CustodianRegistry
      expect(session.expiresAt).to.equal(0n); // Not set yet
    });

    it("should add Custodian session to pending list", async function () {
      await emergencyAccess.connect(doctor1).triggerEmergencyAccess(patient1.address);

      const pending = await emergencyAccess.getPendingSessions();
      expect(pending.length).to.equal(1);
      expect(pending[0].doctor).to.equal(doctor1.address);
    });

    it("should reject non-trusted, non-doctor trigger", async function () {
      await expect(
        emergencyAccess.connect(stranger).triggerEmergencyAccess(patient1.address)
      ).to.be.revertedWith("EmergencyAccess: caller must be trusted contact or verified doctor");
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

    it("should reject OTP issuance from non-Custodian", async function () {
      await emergencyAccess.connect(doctor1).triggerEmergencyAccess(patient1.address);
      
      await expect(
        emergencyAccess.connect(doctor1).issueEmergencyOTP(1n, SAMPLE_ENCRYPTED_OTP, TWENTY_FOUR_HOURS)
      ).to.be.revertedWith("EmergencyAccess: caller is not the Custodian");
    });

    it("should allow Custodian to reject request", async function () {
      await emergencyAccess.connect(doctor1).triggerEmergencyAccess(patient1.address);
      
      const tx = emergencyAccess.connect(owner).rejectEmergencyRequest(1n);
      await expect(tx).to.emit(emergencyAccess, "EmergencySessionExpired");

      const session = await emergencyAccess.getSession(1n);
      expect(session.status).to.equal(3n); // Expired
    });

    it("should return OTP when doctor consumes Custodian session", async function () {
      await emergencyAccess.connect(doctor1).triggerEmergencyAccess(patient1.address);
      await emergencyAccess.connect(owner).issueEmergencyOTP(1n, SAMPLE_ENCRYPTED_OTP, TWENTY_FOUR_HOURS);
      
      const result = await emergencyAccess.connect(doctor1).consumeEmergencyAccess.staticCall(1n);
      expect(result.encryptedData).to.equal(SAMPLE_ENCRYPTED_OTP);
      expect(result.recordIds).to.deep.equal([1n]);
    });
  });

  // ══════════════════════════════════════════════════
  // HYBRID SCENARIO: CONFIGURED PATIENT, UNKNOWN DOCTOR
  // ══════════════════════════════════════════════════

  describe("Hybrid: Configured Patient + Unknown Doctor", function () {
    beforeEach(async function () {
      const fixture = await setupConfiguredPatientFixture();
      userRegistry = fixture.registry;
      recordManager = fixture.records;
      emergencyAccess = fixture.emergency;
    });

    it("should give trusted contact (doctor1) immediate access", async function () {
      await emergencyAccess.connect(doctor1).triggerEmergencyAccess(patient1.address);
      
      const session = await emergencyAccess.getSession(1n);
      expect(session.triggerType).to.equal(0n); // TrustedContact
      expect(session.status).to.equal(1n); // Active
    });

    it("should require Custodian validation for unknown doctor (doctor2)", async function () {
      await emergencyAccess.connect(doctor2).triggerEmergencyAccess(patient1.address);
      
      const session = await emergencyAccess.getSession(1n);
      expect(session.triggerType).to.equal(1n); // CustodianRegistry
      expect(session.status).to.equal(0n); // Pending
    });

    it("should allow both paths simultaneously for different doctors", async function () {
      // Trusted contact gets immediate access
      await emergencyAccess.connect(doctor1).triggerEmergencyAccess(patient1.address);
      
      // Unknown doctor gets Pending session
      await emergencyAccess.connect(doctor2).triggerEmergencyAccess(patient1.address);

      const session1 = await emergencyAccess.getSession(1n);
      const session2 = await emergencyAccess.getSession(2n);

      expect(session1.triggerType).to.equal(0n); // TrustedContact
      expect(session1.status).to.equal(1n); // Active
      
      expect(session2.triggerType).to.equal(1n); // CustodianRegistry
      expect(session2.status).to.equal(0n); // Pending

      // Only session2 is in pending list
      const pending = await emergencyAccess.getPendingSessions();
      expect(pending.length).to.equal(1);
      expect(pending[0].sessionId).to.equal(2n);
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

    it("should allow patient to revoke pending Custodian session", async function () {
      await emergencyAccess.connect(doctor2).triggerEmergencyAccess(patient1.address);
      
      await emergencyAccess.connect(patient1).revokeEmergencySession(1n);

      const session = await emergencyAccess.getSession(1n);
      expect(session.status).to.equal(4n); // Revoked
      
      const pending = await emergencyAccess.getPendingSessions();
      expect(pending.length).to.equal(0);
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
  // COMPLETE FLOW INTEGRATION
  // ══════════════════════════════════════════════════

  describe("Complete Flow Integration", function () {
    beforeEach(async function () {
      const fixture = await setupConfiguredPatientFixture();
      userRegistry = fixture.registry;
      recordManager = fixture.records;
      emergencyAccess = fixture.emergency;
    });

    it("should complete trusted contact flow", async function () {
      // 1. Trusted contact triggers - immediate active
      await emergencyAccess.connect(trustedFriend).triggerEmergencyAccess(patient1.address);
      let session = await emergencyAccess.getSession(1n);
      expect(session.status).to.equal(1n); // Active

      // 2. Consume to get record IDs
      await emergencyAccess.connect(trustedFriend).consumeEmergencyAccess(1n);
      session = await emergencyAccess.getSession(1n);
      expect(session.status).to.equal(2n); // Consumed

      // 3. Get pre-stored key
      const key = await emergencyAccess.connect(trustedFriend).getEmergencyKey(patient1.address, 1n);
      expect(key).to.equal(SAMPLE_EMERGENCY_KEY);

      // 4. Log access
      await emergencyAccess.connect(trustedFriend).logEmergencyRecordAccess(1n, 1n);
      session = await emergencyAccess.getSession(1n);
      expect(session.recordsAccessed).to.equal(1n);
    });

    it("should complete Custodian flow for unknown doctor", async function () {
      // 1. Unknown doctor triggers - pending
      await emergencyAccess.connect(doctor2).triggerEmergencyAccess(patient1.address);
      let session = await emergencyAccess.getSession(1n);
      expect(session.status).to.equal(0n); // Pending

      // 2. Custodian validates and issues OTP
      await emergencyAccess.connect(owner).issueEmergencyOTP(1n, SAMPLE_ENCRYPTED_OTP, TWENTY_FOUR_HOURS);
      session = await emergencyAccess.getSession(1n);
      expect(session.status).to.equal(1n); // Active

      // 3. Doctor consumes OTP
      const result = await emergencyAccess.connect(doctor2).consumeEmergencyAccess.staticCall(1n);
      await emergencyAccess.connect(doctor2).consumeEmergencyAccess(1n);
      expect(result.encryptedData).to.equal(SAMPLE_ENCRYPTED_OTP);

      // 4. Log access
      await emergencyAccess.connect(doctor2).logEmergencyRecordAccess(1n, 1n);
      session = await emergencyAccess.getSession(1n);
      expect(session.recordsAccessed).to.equal(1n);

      // 5. Patient revokes
      await emergencyAccess.connect(patient1).revokeEmergencySession(1n);
      session = await emergencyAccess.getSession(1n);
      expect(session.status).to.equal(4n); // Revoked
    });
  });

  // ══════════════════════════════════════════════════
  // VIEW FUNCTIONS
  // ══════════════════════════════════════════════════

  describe("View Functions", function () {
    beforeEach(async function () {
      const fixture = await setupConfiguredPatientFixture();
      userRegistry = fixture.registry;
      recordManager = fixture.records;
      emergencyAccess = fixture.emergency;
    });

    it("should return correct session count", async function () {
      expect(await emergencyAccess.getSessionCount()).to.equal(0n);
      
      await emergencyAccess.connect(doctor1).triggerEmergencyAccess(patient1.address);
      expect(await emergencyAccess.getSessionCount()).to.equal(1n);
    });

    it("should return sessions by patient", async function () {
      await emergencyAccess.connect(doctor1).triggerEmergencyAccess(patient1.address);
      
      const sessions = await emergencyAccess.getSessionsByPatient(patient1.address);
      expect(sessions.length).to.equal(1);
    });

    it("should return sessions by doctor", async function () {
      await emergencyAccess.connect(doctor1).triggerEmergencyAccess(patient1.address);
      
      const sessions = await emergencyAccess.getSessionsByDoctor(doctor1.address);
      expect(sessions.length).to.equal(1);
    });

    it("should correctly report hasActiveSession", async function () {
      expect(await emergencyAccess.hasActiveSession(patient1.address, doctor1.address)).to.be.false;
      
      await emergencyAccess.connect(doctor1).triggerEmergencyAccess(patient1.address);
      
      expect(await emergencyAccess.hasActiveSession(patient1.address, doctor1.address)).to.be.true;
    });

    it("should correctly report hasPendingSession", async function () {
      await emergencyAccess.connect(doctor2).triggerEmergencyAccess(patient1.address);
      
      expect(await emergencyAccess.hasPendingSession(patient1.address, doctor2.address)).to.be.true;
      expect(await emergencyAccess.hasPendingSession(patient1.address, doctor1.address)).to.be.false;
    });
  });

  // ── EA Edge Cases: updates/custodian/expiry ──────
  describe("Emergency Access Edge Cases", function () {
    let recordId: bigint;

    beforeEach(async function () {
      const fixture = await setupConfiguredPatientFixture();
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
      recordId = fixture.recordId;
    });

    it("should remove old trusted contact permissions after contact update", async function () {
      expect(
        await emergencyAccess.isEmergencyContact(trustedFriend.address, patient1.address)
      ).to.equal(true);

      await emergencyAccess.connect(patient1).updateEmergencyContacts([doctor1.address]);

      expect(
        await emergencyAccess.isEmergencyContact(trustedFriend.address, patient1.address)
      ).to.equal(false);

      await expect(
        emergencyAccess.connect(trustedFriend).triggerEmergencyAccess(patient1.address)
      ).to.be.revertedWith("EmergencyAccess: caller must be trusted contact or verified doctor");

      await expect(
        emergencyAccess.connect(trustedFriend).getEmergencyKey(patient1.address, recordId)
      ).to.be.revertedWith("EmergencyAccess: no valid trusted contact session");
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

    it("should not allow non-session doctor to consume another doctor's emergency session", async function () {
      await emergencyAccess.connect(doctor2).triggerEmergencyAccess(patient1.address);

      await emergencyAccess.connect(owner).issueEmergencyOTP(
        1n,
        SAMPLE_ENCRYPTED_OTP,
        TWENTY_FOUR_HOURS
      );

      await expect(
        emergencyAccess.connect(doctor1).consumeEmergencyAccess(1n)
      ).to.be.revertedWith("EmergencyAccess: not session doctor");
    });
  });
});
