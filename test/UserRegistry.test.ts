import { expect } from "chai";
import hre from "hardhat";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("UserRegistry", function () {
  let userRegistry: any;
  let owner: HardhatEthersSigner;
  let patient1: HardhatEthersSigner;
  let patient2: HardhatEthersSigner;
  let doctor1: HardhatEthersSigner;
  let doctor2: HardhatEthersSigner;
  let stranger: HardhatEthersSigner;

  const SAMPLE_PUB_KEY = "0xabcdef1234567890";
  const SAMPLE_PUB_KEY_2 = "0x1234567890abcdef";

  async function deployFixture() {
    const connection = await hre.network.connect();
    const signers = await connection.ethers.getSigners();
    [owner, patient1, patient2, doctor1, doctor2, stranger] = signers;

    const UserRegistry = await connection.ethers.getContractFactory("UserRegistry");
    const registry = await UserRegistry.deploy();
    return { registry, owner, patient1, patient2, doctor1, doctor2, stranger, connection };
  }

  beforeEach(async function () {
    const fixture = await deployFixture();
    userRegistry = fixture.registry;
    owner = fixture.owner;
    patient1 = fixture.patient1;
    patient2 = fixture.patient2;
    doctor1 = fixture.doctor1;
    doctor2 = fixture.doctor2;
    stranger = fixture.stranger;
  });

  // ── UR-T01: Patient registration ─────────────────
  describe("Patient Registration", function () {
    it("should register a patient with valid public key", async function () {
      await expect(userRegistry.connect(patient1).registerAsPatient(SAMPLE_PUB_KEY))
        .to.emit(userRegistry, "UserRegistered")
        .withArgs(patient1.address, 1n, () => true); // Role.Patient = 1

      expect(await userRegistry.isRegistered(patient1.address)).to.be.true;
      expect(await userRegistry.getUserRole(patient1.address)).to.equal(1n); // Patient

      const profile = await userRegistry.getUserProfile(patient1.address);
      expect(profile.role).to.equal(1n);
      expect(profile.isRegistered).to.be.true;
      expect(profile.encryptionPublicKey).to.equal(SAMPLE_PUB_KEY);
    });

    it("should reject registration with empty public key", async function () {
      await expect(
        userRegistry.connect(patient1).registerAsPatient("0x")
      ).to.be.revertedWith("UserRegistry: empty public key");
    });

    it("should reject duplicate registration", async function () {
      await userRegistry.connect(patient1).registerAsPatient(SAMPLE_PUB_KEY);
      await expect(
        userRegistry.connect(patient1).registerAsPatient(SAMPLE_PUB_KEY)
      ).to.be.revertedWith("UserRegistry: already registered");
    });

    it("should increment totalUsers counter", async function () {
      expect(await userRegistry.totalUsers()).to.equal(0n);
      await userRegistry.connect(patient1).registerAsPatient(SAMPLE_PUB_KEY);
      expect(await userRegistry.totalUsers()).to.equal(1n);
      await userRegistry.connect(patient2).registerAsPatient(SAMPLE_PUB_KEY_2);
      expect(await userRegistry.totalUsers()).to.equal(2n);
    });
  });

  // ── UR-T02 - UR-T05: Doctor registration ─────────
  describe("Doctor Registration", function () {
    it("should register a doctor with valid credentials", async function () {
      const tx = userRegistry.connect(doctor1).registerAsDoctor(
        "Dr. Smith", "LIC-001", "Cardiology", "City Hospital", SAMPLE_PUB_KEY
      );

      await expect(tx)
        .to.emit(userRegistry, "UserRegistered")
        .withArgs(doctor1.address, 2n, () => true); // Role.Doctor = 2
      await expect(tx)
        .to.emit(userRegistry, "DoctorRegistrationRequested");

      expect(await userRegistry.isRegistered(doctor1.address)).to.be.true;
      expect(await userRegistry.getUserRole(doctor1.address)).to.equal(2n);

      const doctorProfile = await userRegistry.getDoctorProfile(doctor1.address);
      expect(doctorProfile.name).to.equal("Dr. Smith");
      expect(doctorProfile.licenseNumber).to.equal("LIC-001");
      expect(doctorProfile.specialty).to.equal("Cardiology");
      expect(doctorProfile.institution).to.equal("City Hospital");
      expect(doctorProfile.status).to.equal(0n); // Pending
    });

    it("should reject doctor with empty name", async function () {
      await expect(
        userRegistry.connect(doctor1).registerAsDoctor("", "LIC-001", "Cardiology", "Hospital", SAMPLE_PUB_KEY)
      ).to.be.revertedWith("UserRegistry: empty name");
    });

    it("should reject doctor with empty license", async function () {
      await expect(
        userRegistry.connect(doctor1).registerAsDoctor("Dr. Smith", "", "Cardiology", "Hospital", SAMPLE_PUB_KEY)
      ).to.be.revertedWith("UserRegistry: empty license");
    });

    it("should reject doctor with empty specialty", async function () {
      await expect(
        userRegistry.connect(doctor1).registerAsDoctor("Dr. Smith", "LIC-001", "", "Hospital", SAMPLE_PUB_KEY)
      ).to.be.revertedWith("UserRegistry: empty specialty");
    });

    it("should reject doctor with empty institution", async function () {
      await expect(
        userRegistry.connect(doctor1).registerAsDoctor("Dr. Smith", "LIC-001", "Cardiology", "", SAMPLE_PUB_KEY)
      ).to.be.revertedWith("UserRegistry: empty institution");
    });

    it("should reject doctor with empty public key", async function () {
      await expect(
        userRegistry.connect(doctor1).registerAsDoctor("Dr. Smith", "LIC-001", "Cardiology", "Hospital", "0x")
      ).to.be.revertedWith("UserRegistry: empty public key");
    });

    it("should add doctor to pending list", async function () {
      await userRegistry.connect(doctor1).registerAsDoctor(
        "Dr. Smith", "LIC-001", "Cardiology", "Hospital", SAMPLE_PUB_KEY
      );

      const pending = await userRegistry.getPendingDoctors();
      expect(pending.length).to.equal(1);
      expect(pending[0]).to.equal(doctor1.address);
    });

    it("should not be verified by default", async function () {
      await userRegistry.connect(doctor1).registerAsDoctor(
        "Dr. Smith", "LIC-001", "Cardiology", "Hospital", SAMPLE_PUB_KEY
      );
      expect(await userRegistry.isDoctorVerified(doctor1.address)).to.be.false;
    });
  });

  // ── UR-T06 - UR-T08: Doctor verification/rejection
  describe("Doctor Verification", function () {
    beforeEach(async function () {
      await userRegistry.connect(doctor1).registerAsDoctor(
        "Dr. Smith", "LIC-001", "Cardiology", "Hospital", SAMPLE_PUB_KEY
      );
    });

    it("should allow owner to verify a pending doctor", async function () {
      await expect(userRegistry.connect(owner).verifyDoctor(doctor1.address))
        .to.emit(userRegistry, "DoctorVerified")
        .withArgs(doctor1.address, owner.address, () => true);

      expect(await userRegistry.isDoctorVerified(doctor1.address)).to.be.true;

      const profile = await userRegistry.getDoctorProfile(doctor1.address);
      expect(profile.status).to.equal(1n); // Verified
      expect(profile.verifiedAt).to.be.greaterThan(0n);

      const pending = await userRegistry.getPendingDoctors();
      expect(pending.length).to.equal(0);
    });

    it("should allow owner to reject a pending doctor", async function () {
      await expect(
        userRegistry.connect(owner).rejectDoctor(doctor1.address, "Invalid license")
      )
        .to.emit(userRegistry, "DoctorRejected")
        .withArgs(doctor1.address, owner.address, "Invalid license", () => true);

      expect(await userRegistry.isDoctorVerified(doctor1.address)).to.be.false;

      const profile = await userRegistry.getDoctorProfile(doctor1.address);
      expect(profile.status).to.equal(2n); // Rejected

      const pending = await userRegistry.getPendingDoctors();
      expect(pending.length).to.equal(0);
    });

    it("should revert if non-owner tries to verify", async function () {
      await expect(
        userRegistry.connect(stranger).verifyDoctor(doctor1.address)
      ).to.be.revertedWith("UserRegistry: caller is not the owner");
    });

    it("should revert if non-owner tries to reject", async function () {
      await expect(
        userRegistry.connect(stranger).rejectDoctor(doctor1.address, "reason")
      ).to.be.revertedWith("UserRegistry: caller is not the owner");
    });

    it("should revert verifying an already verified doctor", async function () {
      await userRegistry.connect(owner).verifyDoctor(doctor1.address);
      await expect(
        userRegistry.connect(owner).verifyDoctor(doctor1.address)
      ).to.be.revertedWith("UserRegistry: not pending");
    });

    it("should revert verifying an unregistered address", async function () {
      await expect(
        userRegistry.connect(owner).verifyDoctor(stranger.address)
      ).to.be.revertedWith("UserRegistry: doctor not registered");
    });

    it("should revert verifying a patient as doctor", async function () {
      await userRegistry.connect(patient1).registerAsPatient(SAMPLE_PUB_KEY);
      await expect(
        userRegistry.connect(owner).verifyDoctor(patient1.address)
      ).to.be.revertedWith("UserRegistry: not a doctor");
    });
  });

  // ── UR-T09 - UR-T10: Public key management ───────
  describe("Public Key Management", function () {
    beforeEach(async function () {
      await userRegistry.connect(patient1).registerAsPatient(SAMPLE_PUB_KEY);
    });

    it("should allow registered user to update public key", async function () {
      const newKey = "0xdeadbeef";
      await expect(userRegistry.connect(patient1).updatePublicKey(newKey))
        .to.emit(userRegistry, "PublicKeyUpdated")
        .withArgs(patient1.address, () => true);

      expect(await userRegistry.getPublicKey(patient1.address)).to.equal(newKey);
    });

    it("should reject empty public key update", async function () {
      await expect(
        userRegistry.connect(patient1).updatePublicKey("0x")
      ).to.be.revertedWith("UserRegistry: empty public key");
    });

    it("should reject update from unregistered user", async function () {
      await expect(
        userRegistry.connect(stranger).updatePublicKey(SAMPLE_PUB_KEY_2)
      ).to.be.revertedWith("UserRegistry: not registered");
    });
  });

  // ── UR-T11 - UR-T12: View functions ──────────────
  describe("View Functions", function () {
    it("should return Unregistered role for unknown address", async function () {
      expect(await userRegistry.getUserRole(stranger.address)).to.equal(0n);
    });

    it("should return false for unregistered address", async function () {
      expect(await userRegistry.isRegistered(stranger.address)).to.be.false;
    });

    it("should revert getPublicKey for unregistered user", async function () {
      await expect(
        userRegistry.getPublicKey(stranger.address)
      ).to.be.revertedWith("UserRegistry: user not registered");
    });

    it("should revert getUserProfile for unregistered user", async function () {
      await expect(
        userRegistry.getUserProfile(stranger.address)
      ).to.be.revertedWith("UserRegistry: user not registered");
    });

    it("should revert getDoctorProfile for non-doctor", async function () {
      await userRegistry.connect(patient1).registerAsPatient(SAMPLE_PUB_KEY);
      await expect(
        userRegistry.getDoctorProfile(patient1.address)
      ).to.be.revertedWith("UserRegistry: not a doctor");
    });
  });

  // ── Pausable ──────────────────────────────────────
  describe("Pausable", function () {
    it("should allow owner to pause and unpause", async function () {
      await userRegistry.connect(owner).pause();
      expect(await userRegistry.paused()).to.be.true;

      await userRegistry.connect(owner).unpause();
      expect(await userRegistry.paused()).to.be.false;
    });

    it("should block registration when paused", async function () {
      await userRegistry.connect(owner).pause();
      await expect(
        userRegistry.connect(patient1).registerAsPatient(SAMPLE_PUB_KEY)
      ).to.be.revertedWith("UserRegistry: contract is paused");
    });

    it("should block public key update when paused", async function () {
      await userRegistry.connect(patient1).registerAsPatient(SAMPLE_PUB_KEY);
      await userRegistry.connect(owner).pause();
      await expect(
        userRegistry.connect(patient1).updatePublicKey(SAMPLE_PUB_KEY_2)
      ).to.be.revertedWith("UserRegistry: contract is paused");
    });

    it("should reject pause from non-owner", async function () {
      await expect(
        userRegistry.connect(stranger).pause()
      ).to.be.revertedWith("UserRegistry: caller is not the owner");
    });
  });

  // ── Pending doctors array management ──────────────
  describe("Pending Doctors Management", function () {
    it("should handle multiple pending doctors correctly", async function () {
      await userRegistry.connect(doctor1).registerAsDoctor(
        "Dr. Smith", "LIC-001", "Cardiology", "Hospital A", SAMPLE_PUB_KEY
      );
      await userRegistry.connect(doctor2).registerAsDoctor(
        "Dr. Jones", "LIC-002", "Neurology", "Hospital B", SAMPLE_PUB_KEY_2
      );

      let pending = await userRegistry.getPendingDoctors();
      expect(pending.length).to.equal(2);

      await userRegistry.connect(owner).verifyDoctor(doctor1.address);

      pending = await userRegistry.getPendingDoctors();
      expect(pending.length).to.equal(1);
      expect(pending[0]).to.equal(doctor2.address);
    });
  });
});
