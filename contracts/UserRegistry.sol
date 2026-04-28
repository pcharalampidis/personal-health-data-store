// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./interfaces/IUserRegistry.sol";

/**
 * @title UserRegistry
 * @notice Manages wallet-based identity, role assignment, and encryption public key storage.
 * @dev 
 *
 * Requirements Covered: FR-001, FR-003, FR-004, FR-005, NFR-006
 */
contract UserRegistry is IUserRegistry {
    // ── Custom Ownable ──────────────────────────────
    address public owner;

    modifier onlyOwner() {
        require(msg.sender == owner, "UserRegistry: caller is not the owner");
        _;
    }

    // ── Custom Pausable ─────────────────────────────
    bool private _paused;

    modifier whenNotPaused() {
        require(!_paused, "UserRegistry: contract is paused");
        _;
    }

    modifier whenPaused() {
        require(_paused, "UserRegistry: contract is not paused");
        _;
    }

    event Paused(address account);
    event Unpaused(address account);

    function pause() external onlyOwner whenNotPaused {
        _paused = true;
        emit Paused(msg.sender);
    }

    function unpause() external onlyOwner whenPaused {
        _paused = false;
        emit Unpaused(msg.sender);
    }

    function paused() external view returns (bool) {
        return _paused;
    }

    // ── Storage ─────────────────────────────────────
    mapping(address => UserProfile) private users;
    mapping(address => DoctorProfile) private doctors;

    uint256 public totalUsers;
    uint256 public totalDoctors;

    // ── Access Modifiers ────────────────────────────
    modifier onlyUnregistered() {
        require(!users[msg.sender].isRegistered, "UserRegistry: already registered");
        _;
    }

    modifier onlyRegistered() {
        require(users[msg.sender].isRegistered, "UserRegistry: not registered");
        _;
    }

    // ── Constructor ─────────────────────────────────
    constructor() {
        owner = msg.sender;
    }

    // ── Registration ────────────────────────────────

    function registerAsPatient(
        bytes calldata _encryptionPublicKey
    ) external override whenNotPaused onlyUnregistered {
        require(_encryptionPublicKey.length > 0, "UserRegistry: empty public key");

        users[msg.sender] = UserProfile({
            role: Role.Patient,
            isRegistered: true,
            encryptionPublicKey: _encryptionPublicKey,
            registeredAt: block.timestamp
        });

        totalUsers++;
        emit UserRegistered(msg.sender, Role.Patient, block.timestamp);
    }

    function registerAsDoctor(
        string calldata _name,
        string calldata _licenseNumber,
        string calldata _specialty,
        string calldata _institution,
        bytes calldata _encryptionPublicKey
    ) external override whenNotPaused onlyUnregistered {
        require(bytes(_name).length > 0, "UserRegistry: empty name");
        require(bytes(_licenseNumber).length > 0, "UserRegistry: empty license");
        require(bytes(_specialty).length > 0, "UserRegistry: empty specialty");
        require(bytes(_institution).length > 0, "UserRegistry: empty institution");
        require(_encryptionPublicKey.length > 0, "UserRegistry: empty public key");

        users[msg.sender] = UserProfile({
            role: Role.Doctor,
            isRegistered: true,
            encryptionPublicKey: _encryptionPublicKey,
            registeredAt: block.timestamp
        });

        doctors[msg.sender] = DoctorProfile({
            name: _name,
            licenseNumber: _licenseNumber,
            specialty: _specialty,
            institution: _institution,
            registeredAt: block.timestamp
        });

        totalUsers++;
        totalDoctors++;

        emit UserRegistered(msg.sender, Role.Doctor, block.timestamp);
    }

    // ── Key Management ──────────────────────────────

    function updatePublicKey(
        bytes calldata _newPublicKey
    ) external override onlyRegistered whenNotPaused {
        require(_newPublicKey.length > 0, "UserRegistry: empty public key");

        users[msg.sender].encryptionPublicKey = _newPublicKey;
        emit PublicKeyUpdated(msg.sender, block.timestamp);
    }

    // ── View Functions ──────────────────────────────

    function getUserRole(address _user) external view override returns (Role) {
        return users[_user].role;
    }

    function isRegistered(address _user) external view override returns (bool) {
        return users[_user].isRegistered;
    }

    function getPublicKey(address _user) external view override returns (bytes memory) {
        require(users[_user].isRegistered, "UserRegistry: user not registered");
        return users[_user].encryptionPublicKey;
    }

    function getUserProfile(address _user) external view override returns (UserProfile memory) {
        require(users[_user].isRegistered, "UserRegistry: user not registered");
        return users[_user];
    }

    function getDoctorProfile(address _doctor) external view override returns (DoctorProfile memory) {
        require(users[_doctor].role == Role.Doctor, "UserRegistry: not a doctor");
        return doctors[_doctor];
    }

    function isDoctorVerified(address _doctor) external view override returns (bool) {
        // Doctor verification is handled off-chain by Custodian registry
        // This function returns true if address is registered as a doctor
        // Detailed verification (for emergency access) checks Custodian registry
        return users[_doctor].role == Role.Doctor;
    }
}
