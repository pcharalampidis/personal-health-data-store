import { expect } from "chai";
import hre from "hardhat";
import path from "path";
import { webcrypto } from "crypto";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

// Import backend service functions
import { validateProviderWallet } from "../backend/src/services/custodian.js";
import {
  setContractInstances,
  processSession,
  startEventListener,
  stopEventListener,
  isListenerActive
} from "../backend/src/services/emergency.js";
import {
  getCustodianPublicKey,
  unwrapWithCustodianKey,
  wrapForDoctor,
  getCustodianPublicKeyHex
} from "../backend/src/utils/keyWrapping.js";

const subtle = webcrypto.subtle;

describe("Custodian Backend Services", function () {
  let userRegistry: any;
  let recordManager: any;
  let emergencyAccess: any;
  let signers: HardhatEthersSigner[];
  let owner: HardhatEthersSigner; // Contract owner (deployer)
  let doctor1: HardhatEthersSigner; // Hardhat Account #1: Active Doctor (Alice Smith in providers.json)
  let doctor2: HardhatEthersSigner; // Hardhat Account #2: Active Doctor (Nikolaos Papadopoulos in providers.json)
  let suspendedDoc: HardhatEthersSigner; // Hardhat Account #3: Suspended Doctor (Dr. Suspended Demo in providers.json)
  let patient: HardhatEthersSigner; // Hardhat Account #4: Patient
  let unregistered: HardhatEthersSigner; // Hardhat Account #5: Unregistered address

  const SAMPLE_CID = "QmTestCustodianBackend12345";
  const SAMPLE_HASH = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
  const SAMPLE_ENCRYPTED_KEY = "0xaabbccddeeff00112233445566778899aabbccddeeff00112233445566778899";

  let custodianWallet: any;
  let doctorPubKeyHex: string;

  before(async function () {
    // Set registry path environment variable to the root custodian/providers.json
    process.env.CUSTODIAN_REGISTRY_PATH = path.resolve(process.cwd(), "custodian", "providers.json");

    const connection = await hre.network.connect();
    signers = await connection.ethers.getSigners();
    [owner, doctor1, doctor2, suspendedDoc, patient, unregistered] = signers;

    // Create a local wallet instance representing the Custodian with a known private key
    // We can use a random wallet funded with local ETH
    custodianWallet = connection.ethers.Wallet.createRandom().connect(owner.provider);
    await owner.sendTransaction({
      to: custodianWallet.address,
      value: connection.ethers.parseEther("5.0"),
    });

    // Deploy contracts using the custodianWallet so it is the owner
    const UserRegistry = await connection.ethers.getContractFactory("UserRegistry", custodianWallet);
    userRegistry = await UserRegistry.deploy();

    const RecordManager = await connection.ethers.getContractFactory("RecordManager", custodianWallet);
    recordManager = await RecordManager.deploy(await userRegistry.getAddress());

    const EmergencyAccess = await connection.ethers.getContractFactory("EmergencyAccess", custodianWallet);
    emergencyAccess = await EmergencyAccess.deploy(
      await userRegistry.getAddress(),
      await recordManager.getAddress()
    );

    await recordManager.setEmergencyAccessAddress(await emergencyAccess.getAddress());

    // Register Patient
    await userRegistry.connect(patient).registerAsPatient(SAMPLE_ENCRYPTED_KEY);

    // Register Doctor 1
    // Build a mock doctor public key (JWK hex)
    const doctorKeyPair = await subtle.generateKey(
      { name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
      true,
      ["wrapKey", "unwrapKey"]
    );
    const docPubKeyJwk = await subtle.exportKey("jwk", doctorKeyPair.publicKey);
    doctorPubKeyHex = "0x" + Buffer.from(new TextEncoder().encode(JSON.stringify(docPubKeyJwk))).toString("hex");

    await userRegistry.connect(doctor1).registerAsDoctor(
      "Dr. Alice Smith",
      "ESY-EM-001",
      "Athens General Hospital",
      "Emergency Medicine",
      doctorPubKeyHex
    );

    // Register Suspended Doctor
    await userRegistry.connect(suspendedDoc).registerAsDoctor(
      "Dr. Suspended Demo",
      "ESY-SUSP-003",
      "Demo Clinic",
      "General Practice",
      doctorPubKeyHex
    );

    // Configure Backend service environment variables
    process.env.RPC_URL = "http://127.0.0.1:8545";
    process.env.EMERGENCY_ACCESS_ADDRESS = await emergencyAccess.getAddress();
    process.env.RECORD_MANAGER_ADDRESS = await recordManager.getAddress();
    process.env.USER_REGISTRY_ADDRESS = await userRegistry.getAddress();
    process.env.CUSTODIAN_PRIVATE_KEY = custodianWallet.privateKey;

    // Initialize the emergency service by injecting contract instances directly
    setContractInstances(
      emergencyAccess,
      recordManager,
      userRegistry,
      custodianWallet
    );
  });

  after(function () {
    stopEventListener();
  });

  describe("Provider Validation", function () {
    it("should successfully validate an active emergency provider", async function () {
      const result = await validateProviderWallet(doctor1.address);
      expect(result.isRecognized).to.be.true;
      expect(result.isActive).to.be.true;
      expect(result.provider?.name).to.equal("Dr. Alice Smith");
    });

    it("should safely reject a suspended provider wallet", async function () {
      const result = await validateProviderWallet(suspendedDoc.address);
      expect(result.isRecognized).to.be.true;
      expect(result.isActive).to.be.false;
      expect(result.reason).to.equal("Provider status is suspended");
    });

    it("should reject an unrecognised wallet address", async function () {
      const result = await validateProviderWallet(unregistered.address);
      expect(result.isRecognized).to.be.false;
      expect(result.isActive).to.be.false;
      expect(result.reason).to.equal("Provider wallet not found in Custodian registry");
    });
  });

  describe("Key Escrow & Re-Wrapping", function () {
    let aesKey: webcrypto.CryptoKey;
    let custodianWrappedHex: string;

    before(async function () {
      // Generate a mock symmetric AES key
      aesKey = await subtle.generateKey(
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt"]
      );

      // Wrap it using the Custodian's RSA-OAEP public key
      const custodianPubKey = await getCustodianPublicKey();
      const wrappedBytes = await subtle.wrapKey(
        "raw",
        aesKey,
        custodianPubKey,
        { name: "RSA-OAEP" }
      );
      custodianWrappedHex = "0x" + Buffer.from(wrappedBytes).toString("hex");
    });

    it("should unwrap AES key using Custodian RSA private key", async function () {
      const unwrappedKey = await unwrapWithCustodianKey(custodianWrappedHex);
      expect(unwrappedKey).to.exist;
      expect(unwrappedKey.algorithm.name).to.equal("AES-GCM");
    });

    it("should re-wrap AES key using Doctor RSA public key", async function () {
      const wrappedForDoctor = await wrapForDoctor(aesKey, doctorPubKeyHex);
      expect(wrappedForDoctor).to.exist;
      expect(wrappedForDoctor.startsWith("0x")).to.be.true;
      expect(wrappedForDoctor.length).to.be.greaterThan(100);
    });
  });

  describe("Event Listener & Automation", function () {
    let recordId: bigint;

    before(async function () {
      // Set up an emergency record for patient
      await recordManager.connect(patient).addRecord(
        SAMPLE_CID,
        SAMPLE_HASH,
        0,
        SAMPLE_ENCRYPTED_KEY
      );
      recordId = 1n;
      await recordManager.connect(patient).setEmergencyFlag(recordId, true);

      // Wrap a mock AES key for the custodian and store it on-chain
      const aesKey = await subtle.generateKey(
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt"]
      );
      const custodianPubKey = await getCustodianPublicKey();
      const wrappedBytes = await subtle.wrapKey(
        "raw",
        aesKey,
        custodianPubKey,
        { name: "RSA-OAEP" }
      );
      const custodianWrappedHex = "0x" + Buffer.from(wrappedBytes).toString("hex");

      await emergencyAccess.connect(patient).storeCustodianEmergencyKeys(
        [recordId],
        [custodianWrappedHex]
      );
    });

    it("should correctly package the Encrypted Emergency Payload", async function () {
      // 1. Doctor triggers request on-chain
      const tx = await emergencyAccess.connect(doctor1).triggerEmergencyAccess(patient.address);
      await tx.wait();

      const sessionBefore = await emergencyAccess.getSession(1n);
      expect(sessionBefore.status).to.equal(0n); // Pending

      // 2. Call processSession directly to verify the packaging and approval execution
      const result = await processSession(1n);
      expect(result.action).to.equal("approved");
      expect(result.txHash).to.exist;

      // 3. Verify on-chain session status has updated to Active
      const sessionAfter = await emergencyAccess.getSession(1n);
      expect(sessionAfter.status).to.equal(1n); // Active
      expect(sessionAfter.encryptedOTP).to.not.equal("0x");
    });

    it("should auto-process pending sessions upon blockchain event emission", async function () {
      // Start event listener
      await startEventListener();
      expect(isListenerActive()).to.be.true;

      // Trigger access for doctor1 and patient (creating session #2)
      const tx = await emergencyAccess.connect(doctor1).triggerEmergencyAccess(patient.address);
      await tx.wait();

      // Check session #2 is initially Pending
      const sessionBefore = await emergencyAccess.getSession(2n);
      expect(sessionBefore.status).to.equal(0n); // Pending

      // Wait 3.0 seconds to allow event listener to catch and process the request
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Check session #2 has been automatically approved and is now Active
      const sessionAfter = await emergencyAccess.getSession(2n);
      expect(sessionAfter.status).to.equal(1n); // Active

      // Stop event listener
      stopEventListener();
      expect(isListenerActive()).to.be.false;
    });
  });
});
