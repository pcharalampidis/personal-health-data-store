// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./interfaces/IUserRegistry.sol";
import "./interfaces/IRecordManager.sol";

/**
 * @title RecordManager
 * @notice Manages on-chain references to encrypted off-chain health records.
 * @dev Custom Ownable + Pausable + ReentrancyGuard (no OpenZeppelin).
 *      Stores IPFS CIDs, content hashes, and per-user encrypted AES keys.
 *      Actual health data lives encrypted on IPFS; this contract never
 *      sees plaintext.
 *
 * Requirements Covered: FR-006, FR-007, FR-008, FR-009, FR-010, FR-015
 */
contract RecordManager is IRecordManager {
    // ── Custom Ownable ──────────────────────────────
    address public owner;

    modifier onlyOwner() {
        require(msg.sender == owner, "RecordManager: caller is not the owner");
        _;
    }

    // ── Custom Pausable ─────────────────────────────
    bool private _paused;

    modifier whenNotPaused() {
        require(!_paused, "RecordManager: contract is paused");
        _;
    }

    event Paused(address account);
    event Unpaused(address account);

    function pause() external onlyOwner {
        _paused = true;
        emit Paused(msg.sender);
    }

    function unpause() external onlyOwner {
        _paused = false;
        emit Unpaused(msg.sender);
    }

    // ── Custom ReentrancyGuard ──────────────────────
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;
    uint256 private _status;

    modifier nonReentrant() {
        require(_status != _ENTERED, "RecordManager: reentrant call");
        _status = _ENTERED;
        _;
        _status = _NOT_ENTERED;
    }

    // ── Dependencies ────────────────────────────────
    IUserRegistry public userRegistry;
    address public accessControlAddress;
    address public emergencyAccessAddress;

    // ── Storage ─────────────────────────────────────
    mapping(uint256 => HealthRecord) private records;
    mapping(address => uint256[]) private ownerRecords;
    mapping(uint256 => mapping(address => bytes)) private encryptedKeys;

    uint256 private nextRecordId;
    uint256 public totalRecords;

    // ── Access Modifiers ────────────────────────────
    modifier onlyPatient() {
        require(
            userRegistry.getUserRole(msg.sender) == IUserRegistry.Role.Patient,
            "RecordManager: caller is not a patient"
        );
        _;
    }

    modifier onlyRecordOwner(uint256 _recordId) {
        require(records[_recordId].owner == msg.sender, "RecordManager: caller is not record owner");
        _;
    }

    modifier recordIsActive(uint256 _recordId) {
        require(records[_recordId].status == RecordStatus.Active, "RecordManager: record is not active");
        _;
    }

    modifier recordExists(uint256 _recordId) {
        require(_recordId > 0 && _recordId < nextRecordId, "RecordManager: record does not exist");
        _;
    }

    modifier onlyAuthorised() {
        require(
            msg.sender == owner ||
            msg.sender == accessControlAddress ||
            msg.sender == emergencyAccessAddress ||
            records[0].owner == msg.sender, // dummy; real check is per-record
            "RecordManager: unauthorised caller"
        );
        _;
    }

    // ── Constructor ─────────────────────────────────
    constructor(address _userRegistryAddress) {
        require(_userRegistryAddress != address(0), "RecordManager: zero address");
        owner = msg.sender;
        userRegistry = IUserRegistry(_userRegistryAddress);
        nextRecordId = 1;
        _status = _NOT_ENTERED;
    }

    // ── Post-Deploy Configuration ───────────────────

    function setAccessControlAddress(address _addr) external onlyOwner {
        require(_addr != address(0), "RecordManager: zero address");
        accessControlAddress = _addr;
    }

    function setEmergencyAccessAddress(address _addr) external onlyOwner {
        require(_addr != address(0), "RecordManager: zero address");
        emergencyAccessAddress = _addr;
    }

    // ── Record Management ───────────────────────────

    function addRecord(
        string calldata _ipfsCID,
        bytes32 _contentHash,
        RecordType _recordType,
        bytes calldata _encryptedKey
    ) external override whenNotPaused onlyPatient nonReentrant returns (uint256 recordId) {
        require(bytes(_ipfsCID).length > 0, "RecordManager: empty CID");
        require(_contentHash != bytes32(0), "RecordManager: zero content hash");
        require(_encryptedKey.length > 0, "RecordManager: empty encrypted key");

        recordId = nextRecordId++;
        records[recordId] = HealthRecord({
            recordId: recordId,
            owner: msg.sender,
            ipfsCID: _ipfsCID,
            contentHash: _contentHash,
            recordType: _recordType,
            status: RecordStatus.Active,
            isEmergency: false,
            createdAt: block.timestamp,
            updatedAt: block.timestamp
        });

        ownerRecords[msg.sender].push(recordId);
        encryptedKeys[recordId][msg.sender] = _encryptedKey;
        totalRecords++;

        emit RecordAdded(recordId, msg.sender, _ipfsCID, _recordType, block.timestamp);
    }

    function archiveRecord(
        uint256 _recordId
    ) external override whenNotPaused recordExists(_recordId) onlyRecordOwner(_recordId) recordIsActive(_recordId) nonReentrant {
        records[_recordId].status = RecordStatus.Archived;
        records[_recordId].updatedAt = block.timestamp;
        emit RecordArchived(_recordId, msg.sender, block.timestamp);
    }

    function deleteRecord(
        uint256 _recordId
    ) external override whenNotPaused recordExists(_recordId) onlyRecordOwner(_recordId) nonReentrant {
        require(records[_recordId].status != RecordStatus.Deleted, "RecordManager: already deleted");

        records[_recordId].status = RecordStatus.Deleted;
        records[_recordId].ipfsCID = "";
        records[_recordId].updatedAt = block.timestamp;

        delete encryptedKeys[_recordId][msg.sender];

        emit RecordDeleted(_recordId, msg.sender, block.timestamp);
    }

    function restoreRecord(
        uint256 _recordId
    ) external override whenNotPaused recordExists(_recordId) onlyRecordOwner(_recordId) nonReentrant {
        require(records[_recordId].status == RecordStatus.Archived, "RecordManager: not archived");

        records[_recordId].status = RecordStatus.Active;
        records[_recordId].updatedAt = block.timestamp;
        emit RecordRestored(_recordId, msg.sender, block.timestamp);
    }

    function setEmergencyFlag(
        uint256 _recordId,
        bool _isEmergency
    ) external override whenNotPaused recordExists(_recordId) onlyRecordOwner(_recordId) recordIsActive(_recordId) {
        records[_recordId].isEmergency = _isEmergency;
        records[_recordId].updatedAt = block.timestamp;
        emit EmergencyFlagUpdated(_recordId, msg.sender, _isEmergency, block.timestamp);
    }

    // ── Encrypted Key Storage ───────────────────────

    function storeEncryptedKey(
        uint256 _recordId,
        address _grantee,
        bytes calldata _encryptedKey
    ) external override recordExists(_recordId) {
        require(
            msg.sender == records[_recordId].owner ||
            msg.sender == accessControlAddress ||
            msg.sender == emergencyAccessAddress,
            "RecordManager: unauthorised key storage"
        );
        require(_encryptedKey.length > 0, "RecordManager: empty encrypted key");

        encryptedKeys[_recordId][_grantee] = _encryptedKey;
    }

    function removeEncryptedKey(
        uint256 _recordId,
        address _grantee
    ) external override recordExists(_recordId) {
        require(
            msg.sender == records[_recordId].owner ||
            msg.sender == accessControlAddress ||
            msg.sender == emergencyAccessAddress,
            "RecordManager: unauthorised key removal"
        );

        delete encryptedKeys[_recordId][_grantee];
    }

    // ── View Functions ──────────────────────────────

    function getRecord(uint256 _recordId) external view override returns (HealthRecord memory) {
        require(_recordId > 0 && _recordId < nextRecordId, "RecordManager: record does not exist");
        return records[_recordId];
    }

    function getRecordsByOwner(address _owner) external view override returns (uint256[] memory) {
        return ownerRecords[_owner];
    }

    function getRecordCID(uint256 _recordId) external view override returns (string memory) {
        require(_recordId > 0 && _recordId < nextRecordId, "RecordManager: record does not exist");
        return records[_recordId].ipfsCID;
    }

    function getContentHash(uint256 _recordId) external view override returns (bytes32) {
        require(_recordId > 0 && _recordId < nextRecordId, "RecordManager: record does not exist");
        return records[_recordId].contentHash;
    }

    function getEncryptedKey(uint256 _recordId, address _user) external view override returns (bytes memory) {
        return encryptedKeys[_recordId][_user];
    }

    function getEmergencyRecords(address _owner) external view override returns (uint256[] memory) {
        uint256[] memory owned = ownerRecords[_owner];
        uint256 count = 0;

        for (uint256 i = 0; i < owned.length; i++) {
            if (records[owned[i]].isEmergency && records[owned[i]].status == RecordStatus.Active) {
                count++;
            }
        }

        uint256[] memory result = new uint256[](count);
        uint256 idx = 0;
        for (uint256 i = 0; i < owned.length; i++) {
            if (records[owned[i]].isEmergency && records[owned[i]].status == RecordStatus.Active) {
                result[idx++] = owned[i];
            }
        }
        return result;
    }

    function getRecordCount() external view override returns (uint256) {
        return totalRecords;
    }

    function isRecordActive(uint256 _recordId) external view override returns (bool) {
        return _recordId > 0 && _recordId < nextRecordId && records[_recordId].status == RecordStatus.Active;
    }
}
