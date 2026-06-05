import { expect } from "chai";
import hre from "hardhat";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("AccessControl simplified appendix test suite", function () {
  const PATIENT_KEY =
    "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";
  const DOCTOR_KEY =
    "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";

  const CID = "QmTest1234567890abcdef";
  const HASH =
    "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";

  const PATIENT_WRAPPED_KEY =
    "0xaabbccddeeff00112233445566778899aabbccddeeff00112233445566778899";
  const DOCTOR_WRAPPED_KEY =
    "0x112233445566778899aabbccddeeff00112233445566778899aabbccddeeff00";

  async function latestTimestamp(contract: any): Promise<number> {
    const provider = (contract.runner as any)?.provider;
    const block = await provider.send("eth_getBlockByNumber", ["latest", false]);
    return parseInt(block.timestamp, 16);
  }

  async function futureTimestamp(contract: any, seconds: number): Promise<bigint> {
    return BigInt((await latestTimestamp(contract)) + seconds);
  }

  async function increaseTime(contract: any, seconds: number): Promise<void> {
    const provider = (contract.runner as any)?.provider;
    await provider.send("evm_increaseTime", [seconds]);
    await provider.send("evm_mine");
  }

  async function setup() {
    const connection = await hre.network.connect();
    const signers = await connection.ethers.getSigners();

    const [
      owner,
      patient,
      otherPatient,
      doctor,
      otherDoctor,
      stranger,
    ] = signers as HardhatEthersSigner[];

    const UserRegistry = await connection.ethers.getContractFactory("UserRegistry");
    const userRegistry = await UserRegistry.deploy();

    const RecordManager = await connection.ethers.getContractFactory("RecordManager");
    const recordManager = await RecordManager.deploy(await userRegistry.getAddress());

    const AccessControl = await connection.ethers.getContractFactory("AccessControl");
    const accessControl = await AccessControl.deploy(
      await userRegistry.getAddress(),
      await recordManager.getAddress()
    );

    await recordManager.setAccessControlAddress(await accessControl.getAddress());

    await userRegistry.connect(patient).registerAsPatient(PATIENT_KEY);
    await userRegistry.connect(otherPatient).registerAsPatient(DOCTOR_KEY);

    await userRegistry.connect(doctor).registerAsDoctor(
      "Dr. Smith",
      "LIC-001",
      "Cardiology",
      "City Hospital",
      DOCTOR_KEY
    );

    await userRegistry.connect(otherDoctor).registerAsDoctor(
      "Dr. Jones",
      "LIC-002",
      "Neurology",
      "Regional Hospital",
      DOCTOR_KEY
    );

    await recordManager.connect(patient).addRecord(
      CID,
      HASH,
      0,
      PATIENT_WRAPPED_KEY
    );

    return {
      owner,
      patient,
      otherPatient,
      doctor,
      otherDoctor,
      stranger,
      userRegistry,
      recordManager,
      accessControl,
      recordId: 1n,
    };
  }

  it("AC-S01 allows a registered doctor to create a pending access request", async function () {
    const { accessControl, patient, doctor, recordId } = await setup();

    const tx = accessControl.connect(doctor).requestAccess(
      patient.address,
      [recordId],
      "Routine review"
    );

    await expect(tx)
      .to.emit(accessControl, "AccessRequested")
      .withArgs(
        1n,
        doctor.address,
        patient.address,
        [recordId],
        "Routine review",
        () => true
      );

    const request = await accessControl.getRequest(1n);

    expect(request.doctor).to.equal(doctor.address);
    expect(request.patient).to.equal(patient.address);
    expect(request.recordIds).to.deep.equal([recordId]);
    expect(request.reason).to.equal("Routine review");
    expect(request.status).to.equal(0n);

    const pending = await accessControl.getPendingRequests(patient.address);
    expect(pending.length).to.equal(1);
  });

  it("AC-S02 rejects invalid access requests", async function () {
    const { accessControl, patient, doctor, otherDoctor, stranger, recordId } =
      await setup();

    await expect(
      accessControl.connect(stranger).requestAccess(
        patient.address,
        [recordId],
        "Review"
      )
    ).to.be.revertedWith("AccessControl: caller is not a verified doctor");

    await expect(
      accessControl.connect(doctor).requestAccess(
        otherDoctor.address,
        [recordId],
        "Review"
      )
    ).to.be.revertedWith("AccessControl: target is not a patient");

    await expect(
      accessControl.connect(doctor).requestAccess(
        patient.address,
        [],
        "Review"
      )
    ).to.be.revertedWith("AccessControl: no records requested");

    await expect(
      accessControl.connect(doctor).requestAccess(
        patient.address,
        [recordId],
        ""
      )
    ).to.be.revertedWith("AccessControl: empty reason");
  });

  it("AC-S03 allows the patient to approve a request and stores the doctor's wrapped key", async function () {
    const { accessControl, recordManager, patient, doctor, recordId } =
      await setup();

    await accessControl.connect(doctor).requestAccess(
      patient.address,
      [recordId],
      "Checkup"
    );

    const expiresAt = await futureTimestamp(accessControl, 86400);

    const tx = accessControl.connect(patient).approveAccess(
      1n,
      expiresAt,
      [DOCTOR_WRAPPED_KEY]
    );

    await expect(tx)
      .to.emit(accessControl, "AccessGranted")
      .withArgs(recordId, patient.address, doctor.address, expiresAt, () => true);

    const request = await accessControl.getRequest(1n);
    expect(request.status).to.equal(1n);

    const storedKey = await recordManager.getEncryptedKey(recordId, doctor.address);
    expect(storedKey).to.equal(DOCTOR_WRAPPED_KEY);

    const [hasAccess, returnedKey] = await accessControl.checkAccess(
      doctor.address,
      recordId
    );

    expect(hasAccess).to.equal(true);
    expect(returnedKey).to.equal(DOCTOR_WRAPPED_KEY);

    const sharedRecords = await accessControl.getSharedRecords(doctor.address);
    expect(sharedRecords).to.deep.equal([recordId]);
  });

  it("AC-S04 rejects approval from the wrong patient or with invalid approval data", async function () {
    const { accessControl, patient, otherPatient, doctor, recordId } =
      await setup();

    await accessControl.connect(doctor).requestAccess(
      patient.address,
      [recordId],
      "Checkup"
    );

    const expiresAt = await futureTimestamp(accessControl, 86400);

    await expect(
      accessControl.connect(otherPatient).approveAccess(
        1n,
        expiresAt,
        [DOCTOR_WRAPPED_KEY]
      )
    ).to.be.revertedWith("AccessControl: caller is not the request patient");

    await expect(
      accessControl.connect(patient).approveAccess(
        1n,
        expiresAt,
        []
      )
    ).to.be.revertedWith("AccessControl: encrypted keys count mismatch");

    const pastExpiry = BigInt((await latestTimestamp(accessControl)) - 1);

    await expect(
      accessControl.connect(patient).approveAccess(
        1n,
        pastExpiry,
        [DOCTOR_WRAPPED_KEY]
      )
    ).to.be.revertedWith("AccessControl: expiry must be in the future");
  });

  it("AC-S05 allows the patient to reject an access request", async function () {
    const { accessControl, patient, doctor, recordId } = await setup();

    await accessControl.connect(doctor).requestAccess(
      patient.address,
      [recordId],
      "Checkup"
    );

    const tx = accessControl.connect(patient).rejectAccess(1n);

    await expect(tx)
      .to.emit(accessControl, "AccessRequestRejected")
      .withArgs(1n, patient.address, doctor.address, () => true);

    const request = await accessControl.getRequest(1n);
    expect(request.status).to.equal(2n);

    const [hasAccess] = await accessControl.checkAccess(doctor.address, recordId);
    expect(hasAccess).to.equal(false);
  });

  it("AC-S06 allows direct patient grant without a prior doctor request", async function () {
    const { accessControl, patient, doctor, recordId } = await setup();

    const expiresAt = await futureTimestamp(accessControl, 86400);

    await expect(
      accessControl.connect(patient).grantAccess(
        recordId,
        doctor.address,
        expiresAt,
        DOCTOR_WRAPPED_KEY
      )
    )
      .to.emit(accessControl, "AccessGranted")
      .withArgs(recordId, patient.address, doctor.address, expiresAt, () => true);

    const [hasAccess, key] = await accessControl.checkAccess(
      doctor.address,
      recordId
    );

    expect(hasAccess).to.equal(true);
    expect(key).to.equal(DOCTOR_WRAPPED_KEY);
  });

  it("AC-S07 revokes access and removes the doctor's encrypted key", async function () {
    const { accessControl, recordManager, patient, doctor, recordId } =
      await setup();

    const expiresAt = await futureTimestamp(accessControl, 86400);

    await accessControl.connect(patient).grantAccess(
      recordId,
      doctor.address,
      expiresAt,
      DOCTOR_WRAPPED_KEY
    );

    const tx = accessControl.connect(patient).revokeAccess(
      recordId,
      doctor.address
    );

    await expect(tx)
      .to.emit(accessControl, "AccessRevoked")
      .withArgs(recordId, patient.address, doctor.address, () => true);

    const permission = await accessControl.getPermission(recordId, doctor.address);
    expect(permission.isActive).to.equal(false);
    expect(permission.revokedAt).to.be.gt(0n);

    const removedKey = await recordManager.getEncryptedKey(recordId, doctor.address);
    expect(removedKey).to.equal("0x");

    const [hasAccess] = await accessControl.checkAccess(doctor.address, recordId);
    expect(hasAccess).to.equal(false);
  });

  it("AC-S08 blocks access after permission expiry", async function () {
    const { accessControl, patient, doctor, recordId } = await setup();

    const expiresAt = await futureTimestamp(accessControl, 3600);

    await accessControl.connect(patient).grantAccess(
      recordId,
      doctor.address,
      expiresAt,
      DOCTOR_WRAPPED_KEY
    );

    let [hasAccess, key] = await accessControl.checkAccess(doctor.address, recordId);
    expect(hasAccess).to.equal(true);
    expect(key).to.equal(DOCTOR_WRAPPED_KEY);

    await increaseTime(accessControl, 3601);

    [hasAccess, key] = await accessControl.checkAccess(doctor.address, recordId);
    expect(hasAccess).to.equal(false);
    expect(key).to.equal("0x");
  });

  it("AC-S09 logs access only for authorised users", async function () {
    const { accessControl, patient, doctor, stranger, recordId } = await setup();

    await expect(accessControl.connect(patient).logAccess(recordId, 0))
      .to.emit(accessControl, "RecordAccessed")
      .withArgs(recordId, patient.address, patient.address, 0n, () => true);

    const expiresAt = await futureTimestamp(accessControl, 86400);

    await accessControl.connect(patient).grantAccess(
      recordId,
      doctor.address,
      expiresAt,
      DOCTOR_WRAPPED_KEY
    );

    await expect(accessControl.connect(doctor).logAccess(recordId, 0))
      .to.emit(accessControl, "RecordAccessed")
      .withArgs(recordId, doctor.address, patient.address, 0n, () => true);

    await expect(
      accessControl.connect(stranger).logAccess(recordId, 0)
    ).to.be.revertedWith("AccessControl: no access to record");
  });

  it("AC-S10 denies access and logging when the record is archived", async function () {
    const { accessControl, recordManager, patient, doctor, recordId } =
      await setup();

    const expiresAt = await futureTimestamp(accessControl, 86400);

    await accessControl.connect(patient).grantAccess(
      recordId,
      doctor.address,
      expiresAt,
      DOCTOR_WRAPPED_KEY
    );

    await recordManager.connect(patient).archiveRecord(recordId);

    const [hasAccess] = await accessControl.checkAccess(doctor.address, recordId);
    expect(hasAccess).to.equal(false);

    await expect(
      accessControl.connect(doctor).logAccess(recordId, 0)
    ).to.be.revertedWith("AccessControl: record not active");
  });

  it("AC-S11 prevents approval after the request expiry window", async function () {
    const { accessControl, patient, doctor, recordId } = await setup();

    await accessControl.connect(doctor).requestAccess(
      patient.address,
      [recordId],
      "Delayed review"
    );

    await increaseTime(accessControl, 7 * 24 * 60 * 60 + 1);

    const expiresAt = await futureTimestamp(accessControl, 3600);

    await expect(
      accessControl.connect(patient).approveAccess(
        1n,
        expiresAt,
        [DOCTOR_WRAPPED_KEY]
      )
    ).to.be.revertedWith("AccessControl: request expired");
  });
});
