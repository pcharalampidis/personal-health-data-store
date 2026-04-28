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

      expect(await userRegistry.isRegistered(doctor1.address)).to.be.true;
      expect(await userRegistry.getUserRole(doctor1.address)).to.equal(2n);

      const doctorProfile = await userRegistry.getDoctorProfile(doctor1.address);
      expect(doctorProfile.name).to.equal("Dr. Smith");
      expect(doctorProfile.licenseNumber).to.equal("LIC-001");
      expect(doctorProfile.specialty).to.equal("Cardiology");
      expect(doctorProfile.institution).to.equal("City Hospital");
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

    it("should consider registered doctor as verified (on-chain)", async function () {
      // Note: Detailed verification for emergency access checks Custodian registry off-chain
      await userRegistry.connect(doctor1).registerAsDoctor(
        "Dr. Smith", "LIC-001", "Cardiology", "Hospital", SAMPLE_PUB_KEY
      );
      expect(await userRegistry.isDoctorVerified(doctor1.address)).to.be.true;
    });
  });

  // ── UR-T06 - UR-T08: Public key management ───────
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

  // ── UR-T09 - UR-T12: View functions ──────────────
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

  // ── UR Edge Cases: pause semantics ────────────────
  describe("Pause Edge Cases", function () {
    it("should reject doctor registration while paused", async function () {
      await userRegistry.connect(owner).pause();

      await expect(
        userRegistry.connect(doctor1).registerAsDoctor(
          "Dr. Smith",
          "LIC-001",
          "Cardiology",
          "Hospital",
          SAMPLE_PUB_KEY
        )
      ).to.be.revertedWith("UserRegistry: contract is paused");
    });

    it("should reject unpausing when not paused", async function () {
      await expect(
        userRegistry.connect(owner).unpause()
      ).to.be.revertedWith("UserRegistry: contract is not paused");
    });
  });
});
