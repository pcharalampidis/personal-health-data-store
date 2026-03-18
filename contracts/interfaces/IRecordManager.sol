// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title IRecordManager
 * @notice Interface for health record lifecycle management
 * @dev Stores on-chain references to encrypted off-chain records (IPFS CIDs)
 *
 * Requirements Covered: FR-006, FR-007, FR-008, FR-009, FR-010, FR-015
 */
interface IRecordManager {
    enum RecordType {
        LabResult,
        Prescription,
        ImagingReport,
        DischargeSummary,
        AllergyRecord,
        VaccinationRecord,
        ClinicalNote,
        Other
    }

    enum RecordStatus {
        Active,
        Archived,
        Deleted
    }

    struct HealthRecord {
        uint256 recordId;
        address owner;
        string ipfsCID;
        bytes32 contentHash;
        RecordType recordType;
        RecordStatus status;
        bool isEmergency;
        uint256 createdAt;
        uint256 updatedAt;
    }

    event RecordAdded(uint256 indexed recordId, address indexed owner, string ipfsCID, RecordType recordType, uint256 timestamp);
    event RecordArchived(uint256 indexed recordId, address indexed owner, uint256 timestamp);
    event RecordDeleted(uint256 indexed recordId, address indexed owner, uint256 timestamp);
    event RecordRestored(uint256 indexed recordId, address indexed owner, uint256 timestamp);
    event EmergencyFlagUpdated(uint256 indexed recordId, address indexed owner, bool isEmergency, uint256 timestamp);

    function addRecord(string calldata _ipfsCID, bytes32 _contentHash, RecordType _recordType, bytes calldata _encryptedKey) external returns (uint256 recordId);
    function archiveRecord(uint256 _recordId) external;
    function deleteRecord(uint256 _recordId) external;
    function restoreRecord(uint256 _recordId) external;
    function setEmergencyFlag(uint256 _recordId, bool _isEmergency) external;

    function storeEncryptedKey(uint256 _recordId, address _grantee, bytes calldata _encryptedKey) external;
    function removeEncryptedKey(uint256 _recordId, address _grantee) external;

    function getRecord(uint256 _recordId) external view returns (HealthRecord memory);
    function getRecordsByOwner(address _owner) external view returns (uint256[] memory);
    function getRecordCID(uint256 _recordId) external view returns (string memory);
    function getContentHash(uint256 _recordId) external view returns (bytes32);
    function getEncryptedKey(uint256 _recordId, address _user) external view returns (bytes memory);
    function getEmergencyRecords(address _owner) external view returns (uint256[] memory);
    function getRecordCount() external view returns (uint256);
    function isRecordActive(uint256 _recordId) external view returns (bool);
}
