// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./interfaces/IUserRegistry.sol";
import "./interfaces/IRecordManager.sol";
import "./interfaces/IAccessControl.sol";

/**
 * @title AccessControl
 * @notice Manages consent-based access to health records
 * @dev Doctors can request access; patients grant/revoke.
 */
contract AccessControl is IAccessControl {

    address public owner;

    modifier onlyOwner() {
        require(msg.sender == owner, "AccessControl: caller is not the owner");
        _;
    }

    // ──ReentrancyGuard ──────────────────────
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;
    uint256 private _status;

    modifier nonReentrant() {
        require(_status != _ENTERED, "AccessControl: reentrant call");
        _status = _ENTERED;
        _;
        _status = _NOT_ENTERED;
    }

    // ── Dependencies ────────────────────────────────
    IUserRegistry public userRegistry;
    IRecordManager public recordManager;

    // ── Storage ─────────────────────────────────────
    mapping(uint256 => AccessRequest) private requests;
    mapping(uint256 => mapping(address => Permission)) private permissions;
    mapping(uint256 => address[]) private recordGrantees;
    mapping(address => uint256[]) private doctorSharedRecords;
    mapping(address => uint256[]) private patientPermissionRecords;
    mapping(address => uint256[]) private doctorRequests;
    mapping(address => uint256[]) private patientRequests;

    uint256 private nextRequestId;
    uint256 public totalRequests;

    // ── Constants ───────────────────────────────────
    uint256 public constant REQUEST_EXPIRY_DURATION = 7 days;

    // ── Access Modifiers ────────────────────────────
    modifier onlyVerifiedDoctor() {
        require(
            userRegistry.isDoctorVerified(msg.sender),
            "AccessControl: caller is not a verified doctor"
        );
        _;
    }

    modifier onlyPatient() {
        require(
            userRegistry.getUserRole(msg.sender) == IUserRegistry.Role.Patient,
            "AccessControl: caller is not a patient"
        );
        _;
    }

    modifier onlyRequestPatient(uint256 _requestId) {
        require(
            requests[_requestId].patient == msg.sender,
            "AccessControl: caller is not the request patient"
        );
        _;
    }

    modifier requestExists(uint256 _requestId) {
        require(
            _requestId > 0 && _requestId < nextRequestId,
            "AccessControl: request does not exist"
        );
        _;
    }

    modifier requestIsPending(uint256 _requestId) {
        require(
            requests[_requestId].status == RequestStatus.Pending,
            "AccessControl: request is not pending"
        );
        _;
    }

    // ── Constructor ─────────────────────────────────
    constructor(address _userRegistryAddress, address _recordManagerAddress) {
        require(_userRegistryAddress != address(0), "AccessControl: zero UserRegistry address");
        require(_recordManagerAddress != address(0), "AccessControl: zero RecordManager address");
        
        owner = msg.sender;
        userRegistry = IUserRegistry(_userRegistryAddress);
        recordManager = IRecordManager(_recordManagerAddress);
        nextRequestId = 1;
        _status = _NOT_ENTERED;
    }

    // ── Access Request Functions ────────────────────

    function requestAccess(
        address _patient,
        uint256[] calldata _recordIds,
        string calldata _reason
    ) external override onlyVerifiedDoctor nonReentrant returns (uint256 requestId) {
        require(
            userRegistry.getUserRole(_patient) == IUserRegistry.Role.Patient,
            "AccessControl: target is not a patient"
        );
        require(_recordIds.length > 0, "AccessControl: no records requested");
        require(bytes(_reason).length > 0, "AccessControl: empty reason");

        for (uint256 i = 0; i < _recordIds.length; i++) {
            IRecordManager.HealthRecord memory record = recordManager.getRecord(_recordIds[i]);
            require(record.owner == _patient, "AccessControl: record not owned by patient");
            require(recordManager.isRecordActive(_recordIds[i]), "AccessControl: record not active");
        }

        requestId = nextRequestId++;
        
        requests[requestId] = AccessRequest({
            requestId: requestId,
            doctor: msg.sender,
            patient: _patient,
            recordIds: _recordIds,
            reason: _reason,
            status: RequestStatus.Pending,
            requestedAt: block.timestamp,
            respondedAt: 0
        });

        doctorRequests[msg.sender].push(requestId);
        patientRequests[_patient].push(requestId);
        totalRequests++;

        emit AccessRequested(requestId, msg.sender, _patient, _recordIds, _reason, block.timestamp);
    }

    // ── Access Grant / Reject Functions ─────────────

    function approveAccess(
        uint256 _requestId,
        uint256 _expiresAt,
        bytes[] calldata _encryptedKeys
    ) external override requestExists(_requestId) onlyRequestPatient(_requestId) requestIsPending(_requestId) nonReentrant {
        require(_expiresAt > block.timestamp, "AccessControl: expiry must be in the future");
        
        AccessRequest storage request = requests[_requestId];
        require(
            block.timestamp <= request.requestedAt + REQUEST_EXPIRY_DURATION,
            "AccessControl: request expired"
        );
        require(
            _encryptedKeys.length == request.recordIds.length,
            "AccessControl: encrypted keys count mismatch"
        );

        request.status = RequestStatus.Approved;
        request.respondedAt = block.timestamp;

        for (uint256 i = 0; i < request.recordIds.length; i++) {
            uint256 recordId = request.recordIds[i];
            bytes calldata encryptedKey = _encryptedKeys[i];
            IRecordManager.HealthRecord memory record = recordManager.getRecord(recordId);
            require(record.owner == request.patient, "AccessControl: record not owned by patient");
            require(recordManager.isRecordActive(recordId), "AccessControl: record not active");
            
            _grantPermission(recordId, request.doctor, _expiresAt, encryptedKey);
        }
    }

    function grantAccess(
        uint256 _recordId,
        address _doctor,
        uint256 _expiresAt,
        bytes calldata _encryptedKey
    ) external override onlyPatient nonReentrant {
        require(userRegistry.isDoctorVerified(_doctor), "AccessControl: doctor not verified");
        require(_expiresAt > block.timestamp, "AccessControl: expiry must be in the future");
        
        IRecordManager.HealthRecord memory record = recordManager.getRecord(_recordId);
        require(record.owner == msg.sender, "AccessControl: caller is not record owner");
        require(recordManager.isRecordActive(_recordId), "AccessControl: record not active");

        _grantPermission(_recordId, _doctor, _expiresAt, _encryptedKey);
    }

    function rejectAccess(
        uint256 _requestId
    ) external override requestExists(_requestId) onlyRequestPatient(_requestId) requestIsPending(_requestId) {
        AccessRequest storage request = requests[_requestId];
        request.status = RequestStatus.Rejected;
        request.respondedAt = block.timestamp;

        emit AccessRequestRejected(_requestId, msg.sender, request.doctor, block.timestamp);
    }

    // ── Internal Grant Helper ───────────────────────

    function _grantPermission(
        uint256 _recordId,
        address _doctor,
        uint256 _expiresAt,
        bytes calldata _encryptedKey
    ) internal {
        Permission storage perm = permissions[_recordId][_doctor];
        
        bool isNewGrant = !perm.isActive || perm.revokedAt > 0;
        
        perm.isActive = true;
        perm.grantedBy = msg.sender;
        perm.grantedTo = _doctor;
        perm.recordId = _recordId;
        perm.grantedAt = block.timestamp;
        perm.expiresAt = _expiresAt;
        perm.revokedAt = 0;

        if (isNewGrant) {
            recordGrantees[_recordId].push(_doctor);
            doctorSharedRecords[_doctor].push(_recordId);
            patientPermissionRecords[msg.sender].push(_recordId);
        }

        recordManager.storeEncryptedKey(_recordId, _doctor, _encryptedKey);

        emit AccessGranted(_recordId, msg.sender, _doctor, _expiresAt, block.timestamp);
    }

    // ── Revocation Functions ────────────────────────

    function revokeAccess(
        uint256 _recordId,
        address _doctor
    ) external override nonReentrant {
        IRecordManager.HealthRecord memory record = recordManager.getRecord(_recordId);
        require(record.owner == msg.sender, "AccessControl: caller is not record owner");
        
        Permission storage perm = permissions[_recordId][_doctor];
        require(perm.isActive, "AccessControl: no active permission");

        _revokePermission(_recordId, _doctor);
    }

    function revokeAllAccess(uint256 _recordId) external override nonReentrant {
        IRecordManager.HealthRecord memory record = recordManager.getRecord(_recordId);
        require(record.owner == msg.sender, "AccessControl: caller is not record owner");

        address[] memory grantees = recordGrantees[_recordId];
        for (uint256 i = 0; i < grantees.length; i++) {
            if (permissions[_recordId][grantees[i]].isActive) {
                _revokePermission(_recordId, grantees[i]);
            }
        }
    }

    function batchRevoke(
        uint256[] calldata _recordIds,
        address[] calldata _doctors
    ) external override nonReentrant {
        require(_recordIds.length == _doctors.length, "AccessControl: array length mismatch");

        for (uint256 i = 0; i < _recordIds.length; i++) {
            IRecordManager.HealthRecord memory record = recordManager.getRecord(_recordIds[i]);
            require(record.owner == msg.sender, "AccessControl: caller is not record owner");
            
            if (permissions[_recordIds[i]][_doctors[i]].isActive) {
                _revokePermission(_recordIds[i], _doctors[i]);
            }
        }
    }

    function _revokePermission(uint256 _recordId, address _doctor) internal {
        Permission storage perm = permissions[_recordId][_doctor];
        perm.isActive = false;
        perm.revokedAt = block.timestamp;

        recordManager.removeEncryptedKey(_recordId, _doctor);

        emit AccessRevoked(_recordId, perm.grantedBy, _doctor, block.timestamp);
    }

    // ── Access Verification Functions ───────────────

    function checkAccess(
        address _doctor,
        uint256 _recordId
    ) external view override returns (bool hasAccess, bytes memory encryptedKey) {
        Permission storage perm = permissions[_recordId][_doctor];
        
        if (!perm.isActive) {
            return (false, "");
        }
        
        if (block.timestamp > perm.expiresAt) {
            return (false, "");
        }

        if (!recordManager.isRecordActive(_recordId)) {
            return (false, "");
        }
        
        encryptedKey = recordManager.getEncryptedKey(_recordId, _doctor);
        return (true, encryptedKey);
    }

    // ── Audit Trail Functions ───────────────────────

    function logAccess(
        uint256 _recordId,
        AccessType _accessType
    ) external override {
        IRecordManager.HealthRecord memory record = recordManager.getRecord(_recordId);
        
        bool hasPermission = record.owner == msg.sender;
        
        if (!hasPermission) {
            Permission storage perm = permissions[_recordId][msg.sender];
            hasPermission = perm.isActive && block.timestamp <= perm.expiresAt;
        }
        
        require(hasPermission, "AccessControl: no access to record");

        emit RecordAccessed(_recordId, msg.sender, record.owner, _accessType, block.timestamp);
    }

    // ── View Functions ──────────────────────────────

    function getSharedRecords(address _doctor) external view override returns (uint256[] memory) {
        uint256[] memory allRecords = doctorSharedRecords[_doctor];
        uint256 activeCount = 0;

        for (uint256 i = 0; i < allRecords.length; i++) {
            Permission storage perm = permissions[allRecords[i]][_doctor];
            if (perm.isActive && block.timestamp <= perm.expiresAt) {
                activeCount++;
            }
        }

        uint256[] memory activeRecords = new uint256[](activeCount);
        uint256 idx = 0;
        for (uint256 i = 0; i < allRecords.length; i++) {
            Permission storage perm = permissions[allRecords[i]][_doctor];
            if (perm.isActive && block.timestamp <= perm.expiresAt) {
                activeRecords[idx++] = allRecords[i];
            }
        }

        return activeRecords;
    }

    function getPermissionsForRecord(uint256 _recordId) external view override returns (Permission[] memory) {
        address[] memory grantees = recordGrantees[_recordId];
        
        uint256 activeCount = 0;
        for (uint256 i = 0; i < grantees.length; i++) {
            if (permissions[_recordId][grantees[i]].isActive) {
                activeCount++;
            }
        }

        Permission[] memory result = new Permission[](activeCount);
        uint256 idx = 0;
        for (uint256 i = 0; i < grantees.length; i++) {
            if (permissions[_recordId][grantees[i]].isActive) {
                result[idx++] = permissions[_recordId][grantees[i]];
            }
        }

        return result;
    }

    function getPermissionsByOwner(address _patient) external view override returns (Permission[] memory) {
        uint256[] memory recordIds = patientPermissionRecords[_patient];
        
        uint256 totalPerms = 0;
        for (uint256 i = 0; i < recordIds.length; i++) {
            address[] memory grantees = recordGrantees[recordIds[i]];
            for (uint256 j = 0; j < grantees.length; j++) {
                Permission storage perm = permissions[recordIds[i]][grantees[j]];
                if (perm.isActive && perm.grantedBy == _patient) {
                    totalPerms++;
                }
            }
        }

        Permission[] memory result = new Permission[](totalPerms);
        uint256 idx = 0;
        for (uint256 i = 0; i < recordIds.length; i++) {
            address[] memory grantees = recordGrantees[recordIds[i]];
            for (uint256 j = 0; j < grantees.length; j++) {
                Permission storage perm = permissions[recordIds[i]][grantees[j]];
                if (perm.isActive && perm.grantedBy == _patient) {
                    result[idx++] = perm;
                }
            }
        }

        return result;
    }

    function getPendingRequests(address _patient) external view override returns (AccessRequest[] memory) {
        uint256[] memory requestIds = patientRequests[_patient];
        
        uint256 pendingCount = 0;
        for (uint256 i = 0; i < requestIds.length; i++) {
            if (requests[requestIds[i]].status == RequestStatus.Pending) {
                pendingCount++;
            }
        }

        AccessRequest[] memory result = new AccessRequest[](pendingCount);
        uint256 idx = 0;
        for (uint256 i = 0; i < requestIds.length; i++) {
            if (requests[requestIds[i]].status == RequestStatus.Pending) {
                result[idx++] = requests[requestIds[i]];
            }
        }

        return result;
    }

    function getRequestsByDoctor(address _doctor) external view override returns (AccessRequest[] memory) {
        uint256[] memory requestIds = doctorRequests[_doctor];
        AccessRequest[] memory result = new AccessRequest[](requestIds.length);
        
        for (uint256 i = 0; i < requestIds.length; i++) {
            result[i] = requests[requestIds[i]];
        }

        return result;
    }

    function getRequestCount() external view override returns (uint256) {
        return totalRequests;
    }

    function getRequest(uint256 _requestId) external view returns (AccessRequest memory) {
        require(_requestId > 0 && _requestId < nextRequestId, "AccessControl: request does not exist");
        return requests[_requestId];
    }

    function getPermission(uint256 _recordId, address _doctor) external view returns (Permission memory) {
        return permissions[_recordId][_doctor];
    }
}
