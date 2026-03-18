// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./interfaces/IUserRegistry.sol";

/**
 * @title UserRegistry
 * @notice Manages wallet-based identity, role assignment, doctor verification,
 *         and encryption public key storage.
 * @dev Custom Ownable + Pausable (no OpenZeppelin). The contract owner
 *      represents the Custodian admin who verifies/rejects doctors.
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
    address[] private _pendingDoctors;

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
            status: DoctorStatus.Pending,
            verifiedAt: 0
        });

        _pendingDoctors.push(msg.sender);

        totalUsers++;
        totalDoctors++;

        emit UserRegistered(msg.sender, Role.Doctor, block.timestamp);
        emit DoctorRegistrationRequested(msg.sender, _name, _licenseNumber, block.timestamp);
    }

    // ── Admin Functions ─────────────────────────────

    function verifyDoctor(address _doctorAddress) external override onlyOwner {
        require(users[_doctorAddress].isRegistered, "UserRegistry: doctor not registered");
        require(users[_doctorAddress].role == Role.Doctor, "UserRegistry: not a doctor");
        require(doctors[_doctorAddress].status == DoctorStatus.Pending, "UserRegistry: not pending");

        doctors[_doctorAddress].status = DoctorStatus.Verified;
        doctors[_doctorAddress].verifiedAt = block.timestamp;

        _removePendingDoctor(_doctorAddress);

        emit DoctorVerified(_doctorAddress, msg.sender, block.timestamp);
    }

    function rejectDoctor(
        address _doctorAddress,
        string calldata _reason
    ) external override onlyOwner {
        require(users[_doctorAddress].isRegistered, "UserRegistry: doctor not registered");
        require(users[_doctorAddress].role == Role.Doctor, "UserRegistry: not a doctor");
        require(doctors[_doctorAddress].status == DoctorStatus.Pending, "UserRegistry: not pending");

        doctors[_doctorAddress].status = DoctorStatus.Rejected;

        _removePendingDoctor(_doctorAddress);

        emit DoctorRejected(_doctorAddress, msg.sender, _reason, block.timestamp);
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
        return users[_doctor].role == Role.Doctor &&
               doctors[_doctor].status == DoctorStatus.Verified;
    }

    function getPendingDoctors() external view override returns (address[] memory) {
        return _pendingDoctors;
    }

    // ── Internal Helpers ────────────────────────────

    function _removePendingDoctor(address _doctor) private {
        uint256 length = _pendingDoctors.length;
        for (uint256 i = 0; i < length; i++) {
            if (_pendingDoctors[i] == _doctor) {
                _pendingDoctors[i] = _pendingDoctors[length - 1];
                _pendingDoctors.pop();
                return;
            }
        }
    }
}
