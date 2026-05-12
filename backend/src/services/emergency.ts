import { Contract, JsonRpcProvider, Wallet, randomBytes, hexlify } from "ethers";
import { validateProviderWallet } from "./custodian.js";

const EMERGENCY_ACCESS_ABI = [
  "function owner() view returns (address)",
  "function getPendingSessions() view returns (tuple(uint256 sessionId, address patient, address doctor, uint8 status, uint8 triggerType, uint256 triggeredAt, uint256 activatedAt, uint256 expiresAt, bytes encryptedOTP, uint256 recordsAccessed)[])",
  "function getSession(uint256 _sessionId) view returns (tuple(uint256 sessionId, address patient, address doctor, uint8 status, uint8 triggerType, uint256 triggeredAt, uint256 activatedAt, uint256 expiresAt, bytes encryptedOTP, uint256 recordsAccessed))",
  "function issueEmergencyOTP(uint256 _sessionId, bytes calldata _encryptedOTP, uint256 _sessionDuration) external",
  "function rejectEmergencyRequest(uint256 _sessionId) external",
  "event EmergencyAccessTriggered(uint256 indexed sessionId, address indexed patient, address indexed doctor, uint8 triggerType, uint256 timestamp)",
  "event EmergencyOTPIssued(uint256 indexed sessionId, address indexed patient, address indexed doctor, uint256 expiresAt, uint256 timestamp)",
  "event EmergencySessionExpired(uint256 indexed sessionId, uint256 timestamp)",
];

export interface EmergencySession {
  sessionId: bigint;
  patient: string;
  doctor: string;
  status: number;
  triggerType: number;
  triggeredAt: bigint;
  activatedAt: bigint;
  expiresAt: bigint;
  encryptedOTP: string;
  recordsAccessed: bigint;
}

export interface ProcessResult {
  sessionId: string;
  action: "approved" | "rejected";
  doctorWallet: string;
  reason: string;
  txHash?: string;
}

const SESSION_STATUS = {
  PENDING: 0,
  ACTIVE: 1,
  CONSUMED: 2,
  EXPIRED: 3,
  REVOKED: 4,
} as const;

const TRIGGER_TYPE = {
  TRUSTED_CONTACT: 0,
  CUSTODIAN_REGISTRY: 1,
} as const;

const DEFAULT_SESSION_DURATION = 24 * 60 * 60; // 24 hours in seconds

let provider: JsonRpcProvider | null = null;
let custodianWallet: Wallet | null = null;
let emergencyContract: Contract | null = null;

export function getEmergencyConfig() {
  const rpcUrl = process.env.RPC_URL || "http://127.0.0.1:8545";
  const emergencyAccessAddress = process.env.EMERGENCY_ACCESS_ADDRESS;
  const custodianPrivateKey = process.env.CUSTODIAN_PRIVATE_KEY;

  return { rpcUrl, emergencyAccessAddress, custodianPrivateKey };
}

export async function initializeEmergencyService(): Promise<boolean> {
  const { rpcUrl, emergencyAccessAddress, custodianPrivateKey } = getEmergencyConfig();

  if (!emergencyAccessAddress) {
    console.warn("EMERGENCY_ACCESS_ADDRESS not set - emergency service disabled");
    return false;
  }

  if (!custodianPrivateKey) {
    console.warn("CUSTODIAN_PRIVATE_KEY not set - emergency service will be read-only");
  }

  try {
    provider = new JsonRpcProvider(rpcUrl);
    await provider.getNetwork();

    if (custodianPrivateKey) {
      custodianWallet = new Wallet(custodianPrivateKey, provider);
      emergencyContract = new Contract(emergencyAccessAddress, EMERGENCY_ACCESS_ABI, custodianWallet);

      const contractOwner = await emergencyContract.owner();
      const walletAddress = await custodianWallet.getAddress();

      if (contractOwner.toLowerCase() !== walletAddress.toLowerCase()) {
        console.warn(
          `Warning: Wallet ${walletAddress} is not the Custodian owner (${contractOwner}). ` +
            "OTP issuance will fail."
        );
      }
    } else {
      emergencyContract = new Contract(emergencyAccessAddress, EMERGENCY_ACCESS_ABI, provider);
    }

    console.log("Emergency service initialized");
    return true;
  } catch (err) {
    console.error("Failed to initialize emergency service:", err);
    return false;
  }
}

export async function getPendingSessions(): Promise<EmergencySession[]> {
  if (!emergencyContract) {
    throw new Error("Emergency service not initialized");
  }

  const sessions = await emergencyContract.getPendingSessions();

  return sessions.map(
    (s: EmergencySession): EmergencySession => ({
      sessionId: s.sessionId,
      patient: s.patient,
      doctor: s.doctor,
      status: Number(s.status),
      triggerType: Number(s.triggerType),
      triggeredAt: s.triggeredAt,
      activatedAt: s.activatedAt,
      expiresAt: s.expiresAt,
      encryptedOTP: s.encryptedOTP,
      recordsAccessed: s.recordsAccessed,
    })
  );
}

export async function getSession(sessionId: bigint): Promise<EmergencySession | null> {
  if (!emergencyContract) {
    throw new Error("Emergency service not initialized");
  }

  try {
    const s = await emergencyContract.getSession(sessionId);
    return {
      sessionId: s.sessionId,
      patient: s.patient,
      doctor: s.doctor,
      status: Number(s.status),
      triggerType: Number(s.triggerType),
      triggeredAt: s.triggeredAt,
      activatedAt: s.activatedAt,
      expiresAt: s.expiresAt,
      encryptedOTP: s.encryptedOTP,
      recordsAccessed: s.recordsAccessed,
    };
  } catch {
    return null;
  }
}

export async function processSession(sessionId: bigint): Promise<ProcessResult> {
  if (!emergencyContract || !custodianWallet) {
    throw new Error("Emergency service not initialized or read-only mode");
  }

  const session = await getSession(sessionId);

  if (!session) {
    throw new Error(`Session ${sessionId} not found`);
  }

  if (session.status !== SESSION_STATUS.PENDING) {
    throw new Error(`Session ${sessionId} is not pending (status: ${session.status})`);
  }

  if (session.triggerType !== TRIGGER_TYPE.CUSTODIAN_REGISTRY) {
    throw new Error(`Session ${sessionId} is not a Custodian Registry path session`);
  }

  const validation = await validateProviderWallet(session.doctor);

  if (validation.isRecognized && validation.isActive) {
    const otp = generateOTP();
    const encryptedOTP = hexlify(otp);

    const tx = await emergencyContract.issueEmergencyOTP(
      sessionId,
      encryptedOTP,
      DEFAULT_SESSION_DURATION
    );
    const receipt = await tx.wait();

    return {
      sessionId: String(sessionId),
      action: "approved",
      doctorWallet: session.doctor,
      reason: `Doctor verified: ${validation.provider?.name} (${validation.provider?.institution})`,
      txHash: receipt.hash,
    };
  } else {
    const tx = await emergencyContract.rejectEmergencyRequest(sessionId);
    const receipt = await tx.wait();

    return {
      sessionId: String(sessionId),
      action: "rejected",
      doctorWallet: session.doctor,
      reason: validation.reason || "Doctor not in Custodian registry",
      txHash: receipt.hash,
    };
  }
}

export async function processPendingSessions(): Promise<ProcessResult[]> {
  const pending = await getPendingSessions();
  const results: ProcessResult[] = [];

  for (const session of pending) {
    try {
      const result = await processSession(session.sessionId);
      results.push(result);
      console.log(
        `[Emergency] Session #${session.sessionId}: ${result.action} - ${result.reason}`
      );
    } catch (err) {
      console.error(`[Emergency] Failed to process session #${session.sessionId}:`, err);
    }
  }

  return results;
}

function generateOTP(): Uint8Array {
  return randomBytes(32);
}

let listenerActive = false;
let listenerCleanup: (() => void) | null = null;

export async function startEventListener(): Promise<boolean> {
  if (listenerActive) {
    console.log("[Emergency] Event listener already active");
    return true;
  }

  if (!emergencyContract) {
    throw new Error("Emergency service not initialized");
  }

  const filter = emergencyContract.filters.EmergencyAccessTriggered();

  const handler = async (
    sessionId: bigint,
    _patient: string,
    doctor: string,
    triggerType: number
  ) => {
    if (triggerType === TRIGGER_TYPE.CUSTODIAN_REGISTRY) {
      console.log(
        `[Emergency] New pending session #${sessionId} from doctor ${doctor}`
      );

      setTimeout(async () => {
        try {
          const result = await processSession(sessionId);
          console.log(
            `[Emergency] Auto-processed session #${sessionId}: ${result.action}`
          );
        } catch (err) {
          console.error(`[Emergency] Failed to auto-process session #${sessionId}:`, err);
        }
      }, 2000);
    }
  };

  await emergencyContract.on(filter, handler);
  listenerActive = true;

  listenerCleanup = () => {
    emergencyContract?.off(filter, handler);
    listenerActive = false;
  };

  console.log("[Emergency] Event listener started");
  return true;
}

export function stopEventListener(): boolean {
  if (listenerCleanup) {
    listenerCleanup();
    listenerCleanup = null;
    console.log("[Emergency] Event listener stopped");
    return true;
  }
  return false;
}

export function isListenerActive(): boolean {
  return listenerActive;
}

export function isServiceInitialized(): boolean {
  return emergencyContract !== null;
}

export function isWriteEnabled(): boolean {
  return custodianWallet !== null;
}
