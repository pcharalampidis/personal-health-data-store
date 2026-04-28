// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title IAccessControl
 * @notice Interface for consent-based access management
 * @dev Handles access requests, grants, revocations, and audit logging
 *
 * Requirements Covered: FR-011, FR-012, FR-013, FR-016, NFR-008, NFR-009
 *
 * Design Principle:
 * Access is ALWAYS patient-initiated (grant) or patient-terminated (revoke).
 * Doctors can REQUEST access but cannot self-grant.
 * This enforces the consent-based model required by NFR-008.
 */
interface IAccessControl {
    enum RequestStatus {
        Pending,   // 0 - Awaiting patient decision
        Approved,  // 1 - Patient approved
        Rejected,  // 2 - Patient rejected
        Expired    // 3 - Request timed out
    }

    enum AccessType {
        VIEW,      // 0 - Read access only
        EMERGENCY  // 1 - Emergency access
    }

    struct AccessRequest {
        uint256 requestId;
        address doctor;
        address patient;
        uint256[] recordIds;
        string reason;
        RequestStatus status;
        uint256 requestedAt;
        uint256 respondedAt;
    }

    struct Permission {
        bool isActive;
        address grantedBy;     // Patient address
        address grantedTo;     // Doctor address
        uint256 recordId;
        uint256 grantedAt;
        uint256 expiresAt;
        uint256 revokedAt;     // 0 if not revoked
    }

    struct AccessLogEntry {
        address accessor;
        uint256 recordId;
        AccessType accessType;
        uint256 timestamp;
        bytes32 transactionHash;
    }

    event AccessRequested(
        uint256 indexed requestId,
        address indexed doctor,
        address indexed patient,
        uint256[] recordIds,
        string reason,
        uint256 timestamp
    );

    event AccessGranted(
        uint256 indexed recordId,
        address indexed patient,
        address indexed doctor,
        uint256 expiresAt,
        uint256 timestamp
    );

    event AccessRevoked(
        uint256 indexed recordId,
        address indexed patient,
        address indexed doctor,
        uint256 timestamp
    );

    event AccessRequestRejected(
        uint256 indexed requestId,
        address indexed patient,
        address indexed doctor,
        uint256 timestamp
    );

    event RecordAccessed(
        uint256 indexed recordId,
        address indexed accessor,
        address indexed recordOwner,
        AccessType accessType,
        uint256 timestamp
    );

    function requestAccess(
        address _patient,
        uint256[] calldata _recordIds,
        string calldata _reason
    ) external returns (uint256 requestId);

    function approveAccess(
        uint256 _requestId,
        uint256 _expiresAt,
        bytes[] calldata _encryptedKeys
    ) external;

    function grantAccess(
        uint256 _recordId,
        address _doctor,
        uint256 _expiresAt,
        bytes calldata _encryptedKey
    ) external;

    function rejectAccess(uint256 _requestId) external;

    function revokeAccess(uint256 _recordId, address _doctor) external;

    function revokeAllAccess(uint256 _recordId) external;

    function batchRevoke(
        uint256[] calldata _recordIds,
        address[] calldata _doctors
    ) external;

    function checkAccess(
        address _doctor,
        uint256 _recordId
    ) external view returns (bool hasAccess, bytes memory encryptedKey);

    function logAccess(uint256 _recordId, AccessType _accessType) external;

    function getSharedRecords(address _doctor) external view returns (uint256[] memory);

    function getPermissionsForRecord(uint256 _recordId) external view returns (Permission[] memory);

    function getPermissionsByOwner(address _patient) external view returns (Permission[] memory);

    function getPendingRequests(address _patient) external view returns (AccessRequest[] memory);

    function getRequestsByDoctor(address _doctor) external view returns (AccessRequest[] memory);

    function getRequestCount() external view returns (uint256);
}
