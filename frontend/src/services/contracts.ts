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

export function setContractAddresses(userRegistry: string, recordManager: string) {
  USER_REGISTRY_ADDRESS = userRegistry;
  RECORD_MANAGER_ADDRESS = recordManager;
}

export function getUserRegistryContract(signerOrProvider: JsonRpcSigner | BrowserProvider) {
  if (!USER_REGISTRY_ADDRESS) throw new Error("UserRegistry address not set");
  return new Contract(USER_REGISTRY_ADDRESS, USER_REGISTRY_ABI, signerOrProvider);
}

export function getRecordManagerContract(signerOrProvider: JsonRpcSigner | BrowserProvider) {
  if (!RECORD_MANAGER_ADDRESS) throw new Error("RecordManager address not set");
  return new Contract(RECORD_MANAGER_ADDRESS, RECORD_MANAGER_ABI, signerOrProvider);
}

export { RECORD_TYPES };
