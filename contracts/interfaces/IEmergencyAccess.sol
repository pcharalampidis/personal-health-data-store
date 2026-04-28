// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title IEmergencyAccess
 * @notice Interface for hybrid emergency access mechanism
 * @dev Implements two emergency access paths:
 *
 * PATH 1: Trusted Contacts (Immediate Access)
 * - Patient pre-configures trusted contacts (any registered user)
 * - Patient pre-stores encrypted keys for emergency records
 * - Trusted contact triggers → immediate session activation
 * - No Custodian validation needed (patient already consented)
 *
 * PATH 2: Custodian Registry (Validated Access)
 * - Any verified doctor can trigger emergency access
 * - Custodian backend validates doctor against provider registry (IPFS)
 * - If valid, Custodian issues encrypted OTP
 * - Covers true emergencies where patient is treated by unknown providers
 *
 * Requirements Covered: FR-014, FR-014b, FR-014c, FR-014d
 *
 * Security Model:
 * - Trusted contacts: patient autonomy, patient-consented access
 * - Provider registry: system-validated, Custodian-controlled access
 * - All actions permanently logged on-chain
 * - Sessions are time-limited and revocable by patient
 */
interface IEmergencyAccess {
    enum SessionStatus {
        Pending,   // 0 - Triggered by non-trusted, awaiting Custodian OTP
        Active,    // 1 - OTP issued (Custodian) or immediate (trusted contact)
        Consumed,  // 2 - OTP/keys retrieved
        Expired,   // 3 - Session timed out or rejected
        Revoked    // 4 - Patient manually ended session
    }

    enum TriggerType {
        TrustedContact,    // 0 - Immediate access via pre-stored keys
        CustodianRegistry  // 1 - Requires Custodian validation
    }

    struct EmergencySession {
        uint256 sessionId;
        address patient;
        address doctor;
        SessionStatus status;
        TriggerType triggerType;
        uint256 triggeredAt;
        uint256 activatedAt;
        uint256 expiresAt;
        bytes encryptedOTP;       // For Custodian path
        uint256 recordsAccessed;
    }

    struct EmergencyConfig {
        address patient;
        address[] trustedContacts;
        uint256 sessionDuration;
        bool isConfigured;
    }

    // ── Configuration Events ────────────────────────
    event EmergencyConfigured(
        address indexed patient,
        address[] trustedContacts,
        uint256 sessionDuration,
        uint256 timestamp
    );

    event EmergencyContactsUpdated(
        address indexed patient,
        address[] newContacts,
        uint256 timestamp
    );

    event EmergencyKeysStored(
        address indexed patient,
        uint256 recordCount,
        uint256 contactCount,
        uint256 timestamp
    );

    // ── Session Events ──────────────────────────────
    event EmergencyAccessTriggered(
        uint256 indexed sessionId,
        address indexed patient,
        address indexed doctor,
        TriggerType triggerType,
        uint256 timestamp
    );

    event EmergencyOTPIssued(
        uint256 indexed sessionId,
        address indexed patient,
        address indexed doctor,
        uint256 expiresAt,
        uint256 timestamp
    );

    event EmergencyOTPConsumed(
        uint256 indexed sessionId,
        address indexed doctor,
        uint256 timestamp
    );

    event EmergencyRecordAccessed(
        uint256 indexed sessionId,
        uint256 indexed recordId,
        address indexed doctor,
        uint256 timestamp
    );

    event EmergencySessionRevoked(
        uint256 indexed sessionId,
        address indexed patient,
        uint256 timestamp
    );

    event EmergencySessionExpired(
        uint256 indexed sessionId,
        uint256 timestamp
    );

    // ── Patient Configuration (Trusted Contacts) ────

    /**
     * @notice Configure emergency access with trusted contacts
     * @param _trustedContacts Array of trusted contact addresses
     * @param _sessionDuration How long emergency sessions should last
     *
     * Requirements:
     * - Caller must be a registered patient
     * - Trusted contacts must be registered users (have public keys)
     * - Session duration must be within allowed range
     *
     * Note: Trusted contacts do NOT need to be verified doctors.
     * Patient autonomy: if you trust them, that's your choice.
     *
     * Emits: EmergencyConfigured
     */
    function configureEmergencyAccess(
        address[] calldata _trustedContacts,
        uint256 _sessionDuration
    ) external;

    /**
     * @notice Update trusted emergency contacts
     * @param _newContacts New array of trusted contact addresses
     *
     * Emits: EmergencyContactsUpdated
     */
    function updateEmergencyContacts(address[] calldata _newContacts) external;

    /**
     * @notice Store pre-encrypted keys for trusted contacts
     * @param _recordIds Array of emergency record IDs
     * @param _contacts Array of trusted contact addresses
     * @param _encryptedKeys Encrypted keys (recordCount * contactCount)
     *
     * Note: Keys are organized as [rec0-contact0, rec0-contact1, ..., rec1-contact0, ...]
     *
     * Emits: EmergencyKeysStored
     */
    function storeEmergencyKeys(
        uint256[] calldata _recordIds,
        address[] calldata _contacts,
        bytes[] calldata _encryptedKeys
    ) external;

    // ── Emergency Trigger ───────────────────────────

    /**
     * @notice Trigger emergency access for an incapacitated patient
     * @param _patient The patient's address
     * @return sessionId The unique emergency session identifier
     *
     * Behavior depends on caller:
     * - If caller is trusted contact: immediate Active session (uses pre-stored keys)
     * - If caller is verified doctor: Pending session (awaits Custodian OTP)
     *
     * Requirements:
     * - Patient must have emergency-flagged records
     * - If trusted contact: patient must have configured emergency access
     * - If not trusted contact: caller must be verified doctor
     *
     * Emits: EmergencyAccessTriggered
     */
    function triggerEmergencyAccess(
        address _patient
    ) external returns (uint256 sessionId);

    // ── Custodian Functions (Owner Only) ────────────

    /**
     * @notice Issue OTP for a pending emergency session
     * @param _sessionId The session ID
     * @param _encryptedOTP OTP encrypted with doctor's public key
     * @param _sessionDuration How long the session should be valid
     *
     * Requirements:
     * - Caller must be Custodian (contract owner)
     * - Session must be Pending (Custodian path only)
     *
     * Emits: EmergencyOTPIssued
     */
    function issueEmergencyOTP(
        uint256 _sessionId,
        bytes calldata _encryptedOTP,
        uint256 _sessionDuration
    ) external;

    /**
     * @notice Reject an emergency request
     * @param _sessionId The session ID to reject
     *
     * Note: Used when doctor fails provider registry validation
     *
     * Emits: EmergencySessionExpired
     */
    function rejectEmergencyRequest(uint256 _sessionId) external;

    // ── Session Consumption ─────────────────────────

    /**
     * @notice Consume emergency access (get keys/OTP)
     * @param _sessionId The session ID
     * @return encryptedData Encrypted OTP (Custodian) or empty (trusted contact uses stored keys)
     * @return recordIds Array of emergency record IDs
     *
     * Emits: EmergencyOTPConsumed
     */
    function consumeEmergencyAccess(
        uint256 _sessionId
    ) external returns (bytes memory encryptedData, uint256[] memory recordIds);

    /**
     * @notice Get pre-stored emergency key (trusted contact path)
     * @param _patient The patient's address
     * @param _recordId The record ID
     * @return encryptedKey The encrypted key for this contact+record
     */
    function getEmergencyKey(
        address _patient,
        uint256 _recordId
    ) external view returns (bytes memory encryptedKey);

    /**
     * @notice Log access to an emergency record
     * @param _sessionId The session ID
     * @param _recordId The record being accessed
     *
     * Emits: EmergencyRecordAccessed
     */
    function logEmergencyRecordAccess(
        uint256 _sessionId,
        uint256 _recordId
    ) external;

    // ── Patient Session Control ─────────────────────

    /**
     * @notice Revoke an emergency session
     * @param _sessionId The session to revoke
     *
     * Emits: EmergencySessionRevoked
     */
    function revokeEmergencySession(uint256 _sessionId) external;

    // ── View Functions ──────────────────────────────

    function getEmergencyConfig(address _patient) external view returns (EmergencyConfig memory);
    function isEmergencyContact(address _contact, address _patient) external view returns (bool);
    function getSession(uint256 _sessionId) external view returns (EmergencySession memory);
    function getSessionsByPatient(address _patient) external view returns (EmergencySession[] memory);
    function getSessionsByDoctor(address _doctor) external view returns (EmergencySession[] memory);
    function getPendingSessions() external view returns (EmergencySession[] memory);
    function hasActiveSession(address _patient, address _doctor) external view returns (bool);
    function hasPendingSession(address _patient, address _doctor) external view returns (bool);
    function getSessionCount() external view returns (uint256);
}
