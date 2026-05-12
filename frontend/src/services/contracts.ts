import { Contract, JsonRpcSigner, BrowserProvider } from "ethers";

const USER_REGISTRY_ABI = [
  "function registerAsPatient(bytes calldata _encryptionPublicKey) external",
  "function registerAsDoctor(string calldata _name, string calldata _licenseNumber, string calldata _specialty, string calldata _institution, bytes calldata _encryptionPublicKey) external",
  "function getUserRole(address _user) external view returns (uint8)",
  "function isRegistered(address _user) external view returns (bool)",
  "function getUserProfile(address _user) external view returns (tuple(uint8 role, bool isRegistered, bytes encryptionPublicKey, uint256 registeredAt))",
  "function isDoctorVerified(address _doctor) external view returns (bool)",
  "function getPublicKey(address _user) external view returns (bytes)",
];

const RECORD_MANAGER_ABI = [
  "function addRecord(string calldata _ipfsCID, bytes32 _contentHash, uint8 _recordType, bytes calldata _encryptedKey) external returns (uint256)",
  "function getRecord(uint256 _recordId) external view returns (tuple(uint256 recordId, address owner, string ipfsCID, bytes32 contentHash, uint8 recordType, uint8 status, bool isEmergency, uint256 createdAt, uint256 updatedAt))",
  "function getRecordsByOwner(address _owner) external view returns (uint256[])",
  "function getRecordCID(uint256 _recordId) external view returns (string)",
  "function getEncryptedKey(uint256 _recordId, address _user) external view returns (bytes)",
  "function archiveRecord(uint256 _recordId) external",
  "function deleteRecord(uint256 _recordId) external",
  "function setEmergencyFlag(uint256 _recordId, bool _isEmergency) external",
  "function isRecordActive(uint256 _recordId) external view returns (bool)",
  "event RecordAdded(uint256 indexed recordId, address indexed owner, string ipfsCID, uint8 recordType, uint256 timestamp)",
];

const ACCESS_CONTROL_ABI = [
  "function requestAccess(address _patient, uint256[] calldata _recordIds, string calldata _reason) external returns (uint256)",
  "function approveAccess(uint256 _requestId, uint256 _expiresAt, bytes[] calldata _encryptedKeys) external",
  "function grantAccess(uint256 _recordId, address _doctor, uint256 _expiresAt, bytes calldata _encryptedKey) external",
  "function rejectAccess(uint256 _requestId) external",
  "function revokeAccess(uint256 _recordId, address _doctor) external",
  "function revokeAllAccess(uint256 _recordId) external",
  "function batchRevoke(uint256[] calldata _recordIds, address[] calldata _doctors) external",
  "function checkAccess(address _doctor, uint256 _recordId) external view returns (bool hasAccess, bytes encryptedKey)",
  "function logAccess(uint256 _recordId, uint8 _accessType) external",
  "function getSharedRecords(address _doctor) external view returns (uint256[])",
  "function getPermissionsForRecord(uint256 _recordId) external view returns (tuple(bool isActive, address grantedBy, address grantedTo, uint256 recordId, uint256 grantedAt, uint256 expiresAt, uint256 revokedAt)[])",
  "function getPermissionsByOwner(address _patient) external view returns (tuple(bool isActive, address grantedBy, address grantedTo, uint256 recordId, uint256 grantedAt, uint256 expiresAt, uint256 revokedAt)[])",
  "function getPendingRequests(address _patient) external view returns (tuple(uint256 requestId, address doctor, address patient, uint256[] recordIds, string reason, uint8 status, uint256 requestedAt, uint256 respondedAt)[])",
  "function getRequestsByDoctor(address _doctor) external view returns (tuple(uint256 requestId, address doctor, address patient, uint256[] recordIds, string reason, uint8 status, uint256 requestedAt, uint256 respondedAt)[])",
  "function getRequestCount() external view returns (uint256)",
  "event AccessRequested(uint256 indexed requestId, address indexed doctor, address indexed patient, uint256[] recordIds, string reason, uint256 timestamp)",
  "event AccessGranted(uint256 indexed recordId, address indexed patient, address indexed doctor, uint256 expiresAt, uint256 timestamp)",
  "event AccessRevoked(uint256 indexed recordId, address indexed patient, address indexed doctor, uint256 timestamp)",
  "event AccessRequestRejected(uint256 indexed requestId, address indexed patient, address indexed doctor, uint256 timestamp)",
];

const EMERGENCY_ACCESS_ABI = [
  "function configureEmergencyAccess(address[] calldata _trustedContacts, uint256 _sessionDuration) external",
  "function updateEmergencyContacts(address[] calldata _newContacts) external",
  "function storeEmergencyKeys(uint256[] calldata _recordIds, address[] calldata _contacts, bytes[] calldata _encryptedKeys) external",
  "function triggerEmergencyAccess(address _patient) external returns (uint256 sessionId)",
  "function consumeEmergencyAccess(uint256 _sessionId) external returns (bytes encryptedData, uint256[] recordIds)",
  "function getEmergencyKey(address _patient, uint256 _recordId) external view returns (bytes encryptedKey)",
  "function logEmergencyRecordAccess(uint256 _sessionId, uint256 _recordId) external",
  "function revokeEmergencySession(uint256 _sessionId) external",
  "function getEmergencyConfig(address _patient) external view returns (tuple(address patient, address[] trustedContacts, uint256 sessionDuration, bool isConfigured))",
  "function isEmergencyContact(address _contact, address _patient) external view returns (bool)",
  "function getSession(uint256 _sessionId) external view returns (tuple(uint256 sessionId, address patient, address doctor, uint8 status, uint8 triggerType, uint256 triggeredAt, uint256 activatedAt, uint256 expiresAt, bytes encryptedOTP, uint256 recordsAccessed))",
  "function getSessionsByPatient(address _patient) external view returns (tuple(uint256 sessionId, address patient, address doctor, uint8 status, uint8 triggerType, uint256 triggeredAt, uint256 activatedAt, uint256 expiresAt, bytes encryptedOTP, uint256 recordsAccessed)[])",
  "function getSessionsByDoctor(address _doctor) external view returns (tuple(uint256 sessionId, address patient, address doctor, uint8 status, uint8 triggerType, uint256 triggeredAt, uint256 activatedAt, uint256 expiresAt, bytes encryptedOTP, uint256 recordsAccessed)[])",
  "function hasActiveSession(address _patient, address _doctor) external view returns (bool)",
  "function hasPendingSession(address _patient, address _doctor) external view returns (bool)",
  "function MIN_SESSION_DURATION() external view returns (uint256)",
  "function MAX_SESSION_DURATION() external view returns (uint256)",
  "event EmergencyAccessTriggered(uint256 indexed sessionId, address indexed patient, address indexed doctor, uint8 triggerType, uint256 timestamp)",
  "event EmergencyOTPIssued(uint256 indexed sessionId, address indexed patient, address indexed doctor, uint256 expiresAt, uint256 timestamp)",
  "event EmergencySessionRevoked(uint256 indexed sessionId, address indexed patient, uint256 timestamp)",
];

const RECORD_TYPES = [
  "Lab Result",
  "Prescription",
  "Imaging Report",
  "Discharge Summary",
  "Allergy Record",
  "Vaccination Record",
  "Clinical Note",
  "Other",
];

// These addresses are set after deployment; update via .env or config
export let USER_REGISTRY_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
export let RECORD_MANAGER_ADDRESS = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
export let ACCESS_CONTROL_ADDRESS = "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0";
export let EMERGENCY_ACCESS_ADDRESS = "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9";

export function setContractAddresses(
  userRegistry: string,
  recordManager: string,
  accessControl?: string,
  emergencyAccess?: string
) {
  USER_REGISTRY_ADDRESS = userRegistry;
  RECORD_MANAGER_ADDRESS = recordManager;
  if (accessControl) ACCESS_CONTROL_ADDRESS = accessControl;
  if (emergencyAccess) EMERGENCY_ACCESS_ADDRESS = emergencyAccess;
}

export function getUserRegistryContract(signerOrProvider: JsonRpcSigner | BrowserProvider) {
  if (!USER_REGISTRY_ADDRESS) throw new Error("UserRegistry address not set");
  return new Contract(USER_REGISTRY_ADDRESS, USER_REGISTRY_ABI, signerOrProvider);
}

export function getRecordManagerContract(signerOrProvider: JsonRpcSigner | BrowserProvider) {
  if (!RECORD_MANAGER_ADDRESS) throw new Error("RecordManager address not set");
  return new Contract(RECORD_MANAGER_ADDRESS, RECORD_MANAGER_ABI, signerOrProvider);
}

export function getAccessControlContract(signerOrProvider: JsonRpcSigner | BrowserProvider) {
  if (!ACCESS_CONTROL_ADDRESS) throw new Error("AccessControl address not set");
  return new Contract(ACCESS_CONTROL_ADDRESS, ACCESS_CONTROL_ABI, signerOrProvider);
}

export function getEmergencyAccessContract(signerOrProvider: JsonRpcSigner | BrowserProvider) {
  if (!EMERGENCY_ACCESS_ADDRESS) throw new Error("EmergencyAccess address not set");
  return new Contract(EMERGENCY_ACCESS_ADDRESS, EMERGENCY_ACCESS_ABI, signerOrProvider);
}

export { RECORD_TYPES };
