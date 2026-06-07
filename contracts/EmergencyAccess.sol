// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./interfaces/IUserRegistry.sol";
import "./interfaces/IRecordManager.sol";
import "./interfaces/IEmergencyAccess.sol";

/**
 * @title EmergencyAccess
 */
contract EmergencyAccess is IEmergencyAccess {
    address public owner;

    modifier onlyOwner() {
        require(msg.sender == owner, "EmergencyAccess: caller is not the Custodian");
        _;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "EmergencyAccess: zero address");
        owner = newOwner;
    }

    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;
    uint256 private _status;

    modifier nonReentrant() {
        require(_status != _ENTERED, "EmergencyAccess: reentrant call");
        _status = _ENTERED;
        _;
        _status = _NOT_ENTERED;
    }

    // ── Dependencies ────────────────────────────────
    IUserRegistry public userRegistry;
    IRecordManager public recordManager;

    // ── Storage: Sessions ───────────────────────────
    mapping(uint256 => EmergencySession) private sessions;
    mapping(address => uint256[]) private patientSessions;
    mapping(address => uint256[]) private doctorSessions;
    uint256[] private pendingSessionIds;

    uint256 private nextSessionId;
    uint256 public totalSessions;

    // ── Storage: Trusted Contacts ───────────────────
    mapping(address => EmergencyConfig) private configs;
    mapping(address => mapping(address => bool)) private isContactMapping;
    // emergencyKeys[patient][contact][recordId] = encryptedKey
    mapping(address => mapping(address => mapping(uint256 => bytes))) private emergencyKeys;

    // ── Storage: Custodian Emergency Keys ───────────
    // custodianEmergencyKeys[patient][recordId] = AES key wrapped for Custodian
    mapping(address => mapping(uint256 => bytes)) private custodianEmergencyKeys;

    // ── Constants ───────────────────────────────────
    uint256 public constant MIN_SESSION_DURATION = 1 hours;
    uint256 public constant MAX_SESSION_DURATION = 72 hours;
    uint256 public constant DEFAULT_SESSION_DURATION = 24 hours;

    // ── Access Modifiers ────────────────────────────
    modifier onlyPatient() {
        require(
            userRegistry.getUserRole(msg.sender) == IUserRegistry.Role.Patient,
            "EmergencyAccess: caller is not a patient"
        );
        _;
    }

    modifier onlyVerifiedDoctor() {
        require(
            userRegistry.isDoctorVerified(msg.sender),
            "EmergencyAccess: caller is not a verified doctor"
        );
        _;
    }

    modifier sessionExists(uint256 _sessionId) {
        require(
            _sessionId > 0 && _sessionId < nextSessionId,
            "EmergencyAccess: session does not exist"
        );
        _;
    }

    // ── Constructor ─────────────────────────────────
    constructor(address _userRegistryAddress, address _recordManagerAddress) {
        require(_userRegistryAddress != address(0), "EmergencyAccess: zero UserRegistry address");
        require(_recordManagerAddress != address(0), "EmergencyAccess: zero RecordManager address");
        
        owner = msg.sender;
        userRegistry = IUserRegistry(_userRegistryAddress);
        recordManager = IRecordManager(_recordManagerAddress);
        nextSessionId = 1;
        _status = _NOT_ENTERED;
    }

    // ══════════════════════════════════════════════════
    // PATH 1: TRUSTED CONTACTS CONFIGURATION
    // ══════════════════════════════════════════════════

    function configureEmergencyAccess(
        address[] calldata _trustedContacts,
        uint256 _sessionDuration
    ) external override onlyPatient nonReentrant {
        require(_trustedContacts.length > 0, "EmergencyAccess: no trusted contacts");
        require(
            _sessionDuration >= MIN_SESSION_DURATION && _sessionDuration <= MAX_SESSION_DURATION,
            "EmergencyAccess: invalid session duration"
        );

        // Validate all contacts are registered users (have public keys for encryption)
        for (uint256 i = 0; i < _trustedContacts.length; i++) {
            require(_trustedContacts[i] != address(0), "EmergencyAccess: zero address contact");
            require(
                userRegistry.isRegistered(_trustedContacts[i]),
                "EmergencyAccess: contact not registered"
            );
        }

        EmergencyConfig storage config = configs[msg.sender];
        
        // Clear old contacts
        for (uint256 i = 0; i < config.trustedContacts.length; i++) {
            isContactMapping[msg.sender][config.trustedContacts[i]] = false;
        }

        // Set new config
        config.patient = msg.sender;
        config.trustedContacts = _trustedContacts;
        config.sessionDuration = _sessionDuration;
        config.isConfigured = true;

        for (uint256 i = 0; i < _trustedContacts.length; i++) {
            isContactMapping[msg.sender][_trustedContacts[i]] = true;
        }

        emit EmergencyConfigured(msg.sender, _trustedContacts, _sessionDuration, block.timestamp);
    }

    function updateEmergencyContacts(
        address[] calldata _newContacts
    ) external override onlyPatient nonReentrant {
        require(configs[msg.sender].isConfigured, "EmergencyAccess: not configured");
        require(_newContacts.length > 0, "EmergencyAccess: no contacts provided");

        for (uint256 i = 0; i < _newContacts.length; i++) {
            require(_newContacts[i] != address(0), "EmergencyAccess: zero address contact");
            require(
                userRegistry.isRegistered(_newContacts[i]),
                "EmergencyAccess: contact not registered"
            );
        }

        EmergencyConfig storage config = configs[msg.sender];
        
        // Clear old contacts
        for (uint256 i = 0; i < config.trustedContacts.length; i++) {
            isContactMapping[msg.sender][config.trustedContacts[i]] = false;
        }

        config.trustedContacts = _newContacts;

        for (uint256 i = 0; i < _newContacts.length; i++) {
            isContactMapping[msg.sender][_newContacts[i]] = true;
        }

        emit EmergencyContactsUpdated(msg.sender, _newContacts, block.timestamp);
    }

    function storeEmergencyKeys(
        uint256[] calldata _recordIds,
        address[] calldata _contacts,
        bytes[] calldata _encryptedKeys
    ) external override onlyPatient nonReentrant {
        require(configs[msg.sender].isConfigured, "EmergencyAccess: not configured");
        require(_recordIds.length > 0, "EmergencyAccess: no records provided");
        require(_contacts.length > 0, "EmergencyAccess: no contacts provided");
        require(
            _encryptedKeys.length == _recordIds.length * _contacts.length,
            "EmergencyAccess: keys count mismatch"
        );

        // Validate records
        for (uint256 i = 0; i < _recordIds.length; i++) {
            IRecordManager.HealthRecord memory record = recordManager.getRecord(_recordIds[i]);
            require(record.owner == msg.sender, "EmergencyAccess: not record owner");
            require(record.isEmergency, "EmergencyAccess: record not flagged for emergency");
        }

        // Validate contacts
        for (uint256 i = 0; i < _contacts.length; i++) {
            require(
                isContactMapping[msg.sender][_contacts[i]],
                "EmergencyAccess: not a trusted contact"
            );
        }

        // Store keys: [rec0-contact0, rec0-contact1, ..., rec1-contact0, ...]
        uint256 keyIdx = 0;
        for (uint256 i = 0; i < _recordIds.length; i++) {
            for (uint256 j = 0; j < _contacts.length; j++) {
                require(_encryptedKeys[keyIdx].length > 0, "EmergencyAccess: empty key");
                emergencyKeys[msg.sender][_contacts[j]][_recordIds[i]] = _encryptedKeys[keyIdx];
                keyIdx++;
            }
        }

        emit EmergencyKeysStored(msg.sender, _recordIds.length, _contacts.length, block.timestamp);
    }

    // ══════════════════════════════════════════════════
    // EMERGENCY TRIGGER (HYBRID)
    // ══════════════════════════════════════════════════

    function triggerEmergencyAccess(
        address _patient
    ) external override nonReentrant returns (uint256 sessionId) {
        require(
            userRegistry.getUserRole(_patient) == IUserRegistry.Role.Patient,
            "EmergencyAccess: target is not a patient"
        );

        // Check patient has emergency records
        uint256[] memory emergencyRecords = recordManager.getEmergencyRecords(_patient);
        require(emergencyRecords.length > 0, "EmergencyAccess: no emergency records");

        bool isTrustedContact = isContactMapping[_patient][msg.sender];
        TriggerType triggerType;
        SessionStatus initialStatus;
        uint256 expiresAt;

        if (isTrustedContact) {
            // PATH 1: Trusted Contact - Immediate Access
            triggerType = TriggerType.TrustedContact;
            initialStatus = SessionStatus.Active;
            expiresAt = block.timestamp + configs[_patient].sessionDuration;
            
            // Check no duplicate active session for trusted contact
            require(
                !_hasActiveSessionInternal(_patient, msg.sender),
                "EmergencyAccess: active session already exists"
            );
        } else {
            // PATH 2: Custodian Registry - Requires Validation
            require(
                userRegistry.isDoctorVerified(msg.sender),
                "EmergencyAccess: caller must be trusted contact or verified doctor"
            );
            
            triggerType = TriggerType.CustodianRegistry;
            initialStatus = SessionStatus.Pending;
            expiresAt = 0; // Set when Custodian issues OTP
            
            // Check no duplicate pending session
            require(
                !_hasPendingSessionInternal(_patient, msg.sender),
                "EmergencyAccess: pending session already exists"
            );
        }

        sessionId = nextSessionId++;

        sessions[sessionId] = EmergencySession({
            sessionId: sessionId,
            patient: _patient,
            doctor: msg.sender,
            status: initialStatus,
            triggerType: triggerType,
            triggeredAt: block.timestamp,
            activatedAt: isTrustedContact ? block.timestamp : 0,
            expiresAt: expiresAt,
            encryptedOTP: "",
            recordsAccessed: 0
        });

        patientSessions[_patient].push(sessionId);
        doctorSessions[msg.sender].push(sessionId);
        
        if (!isTrustedContact) {
            pendingSessionIds.push(sessionId);
        }
        
        totalSessions++;

        emit EmergencyAccessTriggered(sessionId, _patient, msg.sender, triggerType, block.timestamp);
    }

    // ══════════════════════════════════════════════════
    // PATH 2: CUSTODIAN FUNCTIONS
    // ══════════════════════════════════════════════════

    function issueEmergencyOTP(
        uint256 _sessionId,
        bytes calldata _encryptedOTP,
        uint256 _sessionDuration
    ) external override onlyOwner sessionExists(_sessionId) nonReentrant {
        EmergencySession storage session = sessions[_sessionId];
        
        require(session.status == SessionStatus.Pending, "EmergencyAccess: session not pending");
        require(
            session.triggerType == TriggerType.CustodianRegistry,
            "EmergencyAccess: not a Custodian path session"
        );
        require(_encryptedOTP.length > 0, "EmergencyAccess: empty OTP");
        require(
            _sessionDuration >= MIN_SESSION_DURATION && _sessionDuration <= MAX_SESSION_DURATION,
            "EmergencyAccess: invalid session duration"
        );

        session.status = SessionStatus.Active;
        session.activatedAt = block.timestamp;
        session.expiresAt = block.timestamp + _sessionDuration;
        session.encryptedOTP = _encryptedOTP;

        _removePendingSession(_sessionId);

        emit EmergencyOTPIssued(
            _sessionId,
            session.patient,
            session.doctor,
            session.expiresAt,
            block.timestamp
        );
    }

    function rejectEmergencyRequest(
        uint256 _sessionId
    ) external override onlyOwner sessionExists(_sessionId) {
        EmergencySession storage session = sessions[_sessionId];
        require(session.status == SessionStatus.Pending, "EmergencyAccess: session not pending");

        session.status = SessionStatus.Expired;
        _removePendingSession(_sessionId);

        emit EmergencySessionExpired(_sessionId, block.timestamp);
    }

    // ══════════════════════════════════════════════════
    // SESSION CONSUMPTION
    // ══════════════════════════════════════════════════

    function consumeEmergencyAccess(
        uint256 _sessionId
    ) external override sessionExists(_sessionId) nonReentrant returns (
        bytes memory encryptedData,
        uint256[] memory recordIds
    ) {
        EmergencySession storage session = sessions[_sessionId];
        
        require(session.doctor == msg.sender, "EmergencyAccess: not session doctor");
        require(session.status == SessionStatus.Active, "EmergencyAccess: session not active");
        require(block.timestamp <= session.expiresAt, "EmergencyAccess: session expired");

        session.status = SessionStatus.Consumed;
        recordIds = recordManager.getEmergencyRecords(session.patient);

        if (session.triggerType == TriggerType.CustodianRegistry) {
            encryptedData = session.encryptedOTP;
        } else {
            // Trusted contact path - return empty, they use getEmergencyKey()
            encryptedData = "";
        }

        emit EmergencyOTPConsumed(_sessionId, msg.sender, block.timestamp);
    }

    function getEmergencyKey(
        address _patient,
        uint256 _recordId
    ) external view override returns (bytes memory encryptedKey) {
        // Caller must have a consumed trusted contact session with this patient
        uint256[] memory sessionIds = doctorSessions[msg.sender];
        bool hasValidSession = false;
        
        for (uint256 i = 0; i < sessionIds.length; i++) {
            EmergencySession storage session = sessions[sessionIds[i]];
            if (
                session.patient == _patient &&
                session.triggerType == TriggerType.TrustedContact &&
                session.status == SessionStatus.Consumed &&
                block.timestamp <= session.expiresAt
            ) {
                hasValidSession = true;
                break;
            }
        }
        
        require(hasValidSession, "EmergencyAccess: no valid trusted contact session");
        return emergencyKeys[_patient][msg.sender][_recordId];
    }

    function logEmergencyRecordAccess(
        uint256 _sessionId,
        uint256 _recordId
    ) external override sessionExists(_sessionId) {
        EmergencySession storage session = sessions[_sessionId];
        
        require(session.doctor == msg.sender, "EmergencyAccess: not session doctor");
        require(session.status == SessionStatus.Consumed, "EmergencyAccess: session not consumed");
        require(block.timestamp <= session.expiresAt, "EmergencyAccess: session expired");

        IRecordManager.HealthRecord memory record = recordManager.getRecord(_recordId);
        require(record.owner == session.patient, "EmergencyAccess: not patient's record");
        require(record.isEmergency, "EmergencyAccess: record not flagged for emergency");
        require(recordManager.isRecordActive(_recordId), "EmergencyAccess: record not active");

        session.recordsAccessed++;

        emit EmergencyRecordAccessed(_sessionId, _recordId, msg.sender, block.timestamp);
    }

    // ══════════════════════════════════════════════════
    // PATIENT SESSION CONTROL
    // ══════════════════════════════════════════════════

    function revokeEmergencySession(
        uint256 _sessionId
    ) external override sessionExists(_sessionId) nonReentrant {
        EmergencySession storage session = sessions[_sessionId];
        
        require(session.patient == msg.sender, "EmergencyAccess: not session patient");
        require(
            session.status != SessionStatus.Revoked && session.status != SessionStatus.Expired,
            "EmergencyAccess: session already ended"
        );

        if (session.status == SessionStatus.Pending) {
            _removePendingSession(_sessionId);
        }

        session.status = SessionStatus.Revoked;

        emit EmergencySessionRevoked(_sessionId, msg.sender, block.timestamp);
    }

    // ══════════════════════════════════════════════════
    // INTERNAL HELPERS
    // ══════════════════════════════════════════════════

    function _hasPendingSessionInternal(address _patient, address _doctor) internal view returns (bool) {
        uint256[] memory sessionIds = doctorSessions[_doctor];
        for (uint256 i = 0; i < sessionIds.length; i++) {
            EmergencySession storage session = sessions[sessionIds[i]];
            if (session.patient == _patient && session.status == SessionStatus.Pending) {
                return true;
            }
        }
        return false;
    }

    function _hasActiveSessionInternal(address _patient, address _doctor) internal view returns (bool) {
        uint256[] memory sessionIds = doctorSessions[_doctor];
        for (uint256 i = 0; i < sessionIds.length; i++) {
            EmergencySession storage session = sessions[sessionIds[i]];
            if (
                session.patient == _patient &&
                (session.status == SessionStatus.Active || session.status == SessionStatus.Consumed) &&
                block.timestamp <= session.expiresAt
            ) {
                return true;
            }
        }
        return false;
    }

    function _removePendingSession(uint256 _sessionId) internal {
        uint256 length = pendingSessionIds.length;
        for (uint256 i = 0; i < length; i++) {
            if (pendingSessionIds[i] == _sessionId) {
                pendingSessionIds[i] = pendingSessionIds[length - 1];
                pendingSessionIds.pop();
                break;
            }
        }
    }

    // ══════════════════════════════════════════════════
    // CUSTODIAN EMERGENCY KEY STORAGE
    // ══════════════════════════════════════════════════

    function storeCustodianEmergencyKeys(
        uint256[] calldata recordIds,
        bytes[] calldata wrappedKeys
    ) external onlyPatient nonReentrant {
        require(recordIds.length == wrappedKeys.length, "EmergencyAccess: length mismatch");

        for (uint256 i = 0; i < recordIds.length; i++) {
            IRecordManager.HealthRecord memory record = recordManager.getRecord(recordIds[i]);
            require(record.owner == msg.sender, "EmergencyAccess: not record owner");
            require(record.isEmergency, "EmergencyAccess: record not emergency");
            require(wrappedKeys[i].length > 0, "EmergencyAccess: empty key");
            custodianEmergencyKeys[msg.sender][recordIds[i]] = wrappedKeys[i];
        }

        emit CustodianEmergencyKeysStored(msg.sender, recordIds.length, block.timestamp);
    }

    function getCustodianEmergencyKey(
        address patient,
        uint256 recordId
    ) external view onlyOwner returns (bytes memory) {
        return custodianEmergencyKeys[patient][recordId];
    }

    // ══════════════════════════════════════════════════
    // VIEW FUNCTIONS
    // ══════════════════════════════════════════════════

    function getEmergencyConfig(
        address _patient
    ) external view override returns (EmergencyConfig memory) {
        return configs[_patient];
    }

    function isEmergencyContact(
        address _contact,
        address _patient
    ) external view override returns (bool) {
        return isContactMapping[_patient][_contact];
    }

    function getSession(
        uint256 _sessionId
    ) external view override returns (EmergencySession memory) {
        require(_sessionId > 0 && _sessionId < nextSessionId, "EmergencyAccess: session does not exist");
        return sessions[_sessionId];
    }

    function getSessionsByPatient(
        address _patient
    ) external view override returns (EmergencySession[] memory) {
        uint256[] memory sessionIds = patientSessions[_patient];
        EmergencySession[] memory result = new EmergencySession[](sessionIds.length);
        
        for (uint256 i = 0; i < sessionIds.length; i++) {
            result[i] = sessions[sessionIds[i]];
        }
        
        return result;
    }

    function getSessionsByDoctor(
        address _doctor
    ) external view override returns (EmergencySession[] memory) {
        uint256[] memory sessionIds = doctorSessions[_doctor];
        EmergencySession[] memory result = new EmergencySession[](sessionIds.length);
        
        for (uint256 i = 0; i < sessionIds.length; i++) {
            result[i] = sessions[sessionIds[i]];
        }
        
        return result;
    }

    function getPendingSessions() external view override returns (EmergencySession[] memory) {
        EmergencySession[] memory result = new EmergencySession[](pendingSessionIds.length);
        
        for (uint256 i = 0; i < pendingSessionIds.length; i++) {
            result[i] = sessions[pendingSessionIds[i]];
        }
        
        return result;
    }

    function hasActiveSession(
        address _patient,
        address _doctor
    ) external view override returns (bool) {
        return _hasActiveSessionInternal(_patient, _doctor);
    }

    function hasPendingSession(
        address _patient,
        address _doctor
    ) external view override returns (bool) {
        return _hasPendingSessionInternal(_patient, _doctor);
    }

    function getSessionCount() external view override returns (uint256) {
        return totalSessions;
    }

    function getStoredEmergencyKey(
        address _patient,
        address _contact,
        uint256 _recordId
    ) external view returns (bytes memory) {
        return emergencyKeys[_patient][_contact][_recordId];
    }
}
