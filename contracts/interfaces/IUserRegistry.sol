// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title IUserRegistry
 * @notice Interface for user registration and role management
 * @dev Manages wallet-based identity, roles, and encryption public keys.
 *      Doctor verification is handled off-chain by Custodian (ESY) registry.
 *
 * Requirements Covered: FR-001, FR-003, FR-004, FR-005, NFR-006
 */
interface IUserRegistry {
    enum Role {
        Unregistered, // 0
        Patient, // 1
        Doctor // 2
    }

    struct UserProfile {
        Role role;
        bool isRegistered;
        bytes encryptionPublicKey;
        uint256 registeredAt;
    }

    struct DoctorProfile {
        string name;
        string licenseNumber;
        string specialty;
        string institution;
        uint256 registeredAt;
    }

    event UserRegistered(address indexed userAddress, Role role, uint256 timestamp);
    event PublicKeyUpdated(address indexed userAddress, uint256 timestamp);

    function registerAsPatient(bytes calldata _encryptionPublicKey) external;
    function registerAsDoctor(string calldata _name, string calldata _licenseNumber, string calldata _specialty, string calldata _institution, bytes calldata _encryptionPublicKey) external;
    function updatePublicKey(bytes calldata _newPublicKey) external;

    function getUserRole(address _user) external view returns (Role);
    function isRegistered(address _user) external view returns (bool);
    function getPublicKey(address _user) external view returns (bytes memory);
    function getUserProfile(address _user) external view returns (UserProfile memory);
    function getDoctorProfile(address _doctor) external view returns (DoctorProfile memory);
    function isDoctorVerified(address _doctor) external view returns (bool);
}
