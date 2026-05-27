# REQUIREMENTS_STATUS

Canonical requirement-level progress tracker for implementation.
Use together with `TODO_AI.md`, `testing.md`, and `CHANGES.md`.

## Status Legend

- `not_started`: no implementation work started
- `in_progress`: implementation work active
- `implemented`: code complete, validation pending
- `validated`: required tests/scripts passed and logged
- `blocked`: cannot proceed due to dependency/decision issue

Scope tiers:

- `core`: required for MVP dissertation implementation
- `stretch`: implement only after core is validated

## Roll-Up (Current Tracked Requirements)

| Status | Count |
|---|---:|
| not_started | 0 |
| in_progress | 0 |
| implemented | 0 |
| validated | 15 |
| blocked | 0 |

| Scope Tier | Count |
|---|---:|
| core | 15 |
| stretch | 0 |

Last roll-up update: 2026-05-27

## UX Readiness (Milestone 4 Targets)

| Requirement | Functional | UX Status | M4 Target |
|---|---|---|---|
| FR-006 Upload | validated | needs polish — debug UI, no stepper | M4.7 |
| FR-008 Retrieval | validated | weak — patient self-view missing | M4.4 |
| FR-011 Grant Access | validated | acceptable | — |
| FR-013 Shared Records | validated | medium — duplicated decrypt logic | M4.5 |
| FR-014c Emergency Retrieval | validated | needs polish — trusted-contact incomplete | M4.6 |
| FR-016 Audit Trail | validated | basic — logs on metadata view not decrypt | M4.5, M4.6 |

---

## FR-001 - Wallet Connection

- Status: `validated`
- Scope Tier: `core`
- Owner: `developer+agent`
- Linked TODO tasks: `M1.1`, `M1.3`
- Linked tests: `UR-T01`, `UR-T04`
- Model Notes: Wallet is the primary identity/auth path. Registration UI enables full flow: connect wallet → register as patient → upload records.
- Evidence links: `frontend/src/hooks/useWallet.ts`, `frontend/src/components/WalletConnect.tsx`, `frontend/src/components/Register.tsx`
- Last updated: `2026-03-20`

## FR-003 - Role Assignment

- Status: `validated`
- Scope Tier: `core`
- Owner: `developer+agent`
- Linked TODO tasks: `M1.2a`
- Linked tests: `UR-T01`, `UR-T02`, `UR-T04`, `UR-T05`
- Model Notes: Role baseline is enforced in `UserRegistry` before sharing and emergency flows.
- Evidence links: `contracts/UserRegistry.sol`, `test/UserRegistry.test.ts` (32 tests passing)
- Last updated: `2026-03-12`

## FR-005 - Custodian / Provider Registry

- Status: `validated`
- Scope Tier: `core`
- Owner: `developer+agent`
- Linked TODO tasks: `M1.2`, `M3.2`
- Linked tests: `AC-T02`, `AC-T09`, `EA-T01`, `EA-T02`, `SEC-T10`
- Model Notes: Doctor verification moved off-chain per supervisor guidance. UserRegistry no longer has admin verification functions. On-chain `isDoctorVerified()` returns true for any registered doctor. Custodian registry baseline is implemented as JSON, optionally pinned to IPFS, and consumed by backend validation service. M3.2 implements full automated emergency OTP issuance via backend event listener and API endpoints.
- Evidence links: `custodian/providers.json`, `backend/src/services/custodian.ts`, `backend/src/routes/custodian.ts`, `backend/src/services/emergency.ts`, `backend/src/routes/emergency.ts`, `scripts/pin-custodian.js`, `contracts/UserRegistry.sol` (simplified, no verifyDoctor)
- Last updated: `2026-05-05`

## FR-006 - Health Record Upload

- Status: `validated`
- Scope Tier: `core`
- Owner: `developer+agent`
- Linked TODO tasks: `M1.3`, `M1.4`
- Linked tests: `RM-T01`, `RM-T02`, `RM-T04`, `RM-T05`, `RM-T06`, E2E tests
- Model Notes: Record upload requires client-side encryption before any network transfer. E2E proof test validates full vertical slice.
- Evidence links: `contracts/RecordManager.sol` (addRecord), `test/RecordManager.test.ts`, `test/e2e-upload.test.ts`, `frontend/src/components/UploadRecord.tsx`, `frontend/src/utils/encryption.ts`, `backend/src/routes/records.ts`
- Last updated: `2026-04-30`

## FR-007 - Health Record Metadata

- Status: `validated`
- Scope Tier: `core`
- Owner: `developer+agent`
- Linked TODO tasks: `M1.3`, `M1.4`
- Linked tests: `RM-T01`, `RM-T07`, E2E tests
- Model Notes: Minimal metadata model; avoid exposing sensitive medical content on-chain. HealthRecord struct stores recordType, contentHash, status, timestamps. No plaintext on-chain. E2E tests validate content integrity and hash determinism.
- Evidence links: `contracts/RecordManager.sol` (HealthRecord struct), `contracts/interfaces/IRecordManager.sol`, `test/e2e-upload.test.ts`
- Last updated: `2026-04-30`

## FR-008 - Health Record Retrieval

- Status: `validated`
- Scope Tier: `core`
- Owner: `developer+agent`
- Linked TODO tasks: `M1.3`, `M1.4`
- Linked tests: `RM-T19`, `RM-T20`, `RM-T21`, E2E tests
- Model Notes: Owner retrieval flow is part of the first full vertical slice. E2E tests validate CID retrieval and content hash verification.
- Evidence links: `contracts/RecordManager.sol` (getRecord, getRecordsByOwner, getRecordCID, getEncryptedKey), `test/e2e-upload.test.ts`, `frontend/src/components/RecordList.tsx`, `backend/src/routes/records.ts` (fetch endpoint)
- Last updated: `2026-04-30`

## FR-011 - Grant Access to a Doctor

- Status: `validated`
- Scope Tier: `core`
- Owner: `developer+agent`
- Linked TODO tasks: `M2.1`, `M2.2`, `M2.3`
- Linked tests: `AC-T01` to `AC-T13`, `INT-T01`, `INT-T03`
- Model Notes: Patient-controlled grant to verified doctors only. Validated with edge cases for request expiry and record-state revalidation during approval. Doctor request UI now implemented (M2.3).
- Evidence links: `contracts/AccessControl.sol` (requestAccess, approveAccess, grantAccess), `test/AccessControl.test.ts` (42 AccessControl tests; includes `Expiry, Revocation, and Edge Cases`), `frontend/src/components/RequestAccess.tsx`, `frontend/src/hooks/useDoctorAccess.ts`
- Last updated: `2026-05-05`

## FR-012 - Revoke Access from a Doctor

- Status: `validated`
- Scope Tier: `core`
- Owner: `developer+agent`
- Linked TODO tasks: `M2.1`, `M2.2`
- Linked tests: `AC-T16` to `AC-T22`, `INT-T01`, `INT-T03`, `INT-T04`
- Model Notes: Revocation governs future access; audit and state transitions remain explicit. Validated for single, batch, and revoke-all, including key-removal side effects and inactive-record access denial.
- Evidence links: `contracts/AccessControl.sol` (revokeAccess, revokeAllAccess, batchRevoke, checkAccess), `test/AccessControl.test.ts`
- Last updated: `2026-04-30`

## FR-013 - View Shared Records

- Status: `validated`
- Scope Tier: `core`
- Owner: `developer+agent`
- Linked TODO tasks: `M2.3`
- Linked tests: `AC-T12` to `AC-T15`, `INT-T09`
- Model Notes: Doctors can view records shared with them via AccessControl.getSharedRecords(). Frontend component displays shared records with detail view and auto-logs access via logAccess().
- Evidence links: `contracts/AccessControl.sol` (getSharedRecords, checkAccess, logAccess), `frontend/src/components/SharedRecords.tsx`, `frontend/src/hooks/useDoctorAccess.ts`
- Last updated: `2026-05-05`

## FR-014a - Self-Access

- Status: `validated`
- Scope Tier: `core`
- Owner: `developer+agent`
- Linked TODO tasks: `M1.3`, `M3.3`
- Linked tests: `RM-T15`, `RM-T16`, `RM-T17`, `RM-T18`
- Model Notes: Emergency flag toggle implemented and tested in RecordManager. Frontend EmergencyConfig component allows patients to toggle emergency flag on records.
- Evidence links: `contracts/RecordManager.sol` (setEmergencyFlag, getEmergencyRecords), `test/RecordManager.test.ts` (Emergency Flag tests), `frontend/src/components/EmergencyConfig.tsx`
- Last updated: `2026-05-05`

## FR-014b - Emergency Trigger And OTP Issuance Gate

- Status: `validated`
- Scope Tier: `core`
- Owner: `developer+agent`
- Linked TODO tasks: `M1.2`, `M3.1`, `M3.2`, `M3.3`
- Linked tests: `EA-T01`, `EA-T02`, `INT-T05`
- Model Notes: Hybrid model implemented (trusted contacts + Custodian pending path). Backend emergency service (`M3.2`) validates doctors against custodian registry and auto-issues OTP or rejects. Frontend EmergencyTrigger component allows doctors to trigger emergency access. EmergencyConfig allows patients to configure trusted contacts.
- Evidence links: `contracts/EmergencyAccess.sol` (triggerEmergencyAccess, issueEmergencyOTP, rejectEmergencyRequest), `backend/src/services/custodian.ts`, `backend/src/services/emergency.ts`, `backend/src/routes/emergency.ts`, `frontend/src/components/EmergencyTrigger.tsx`, `frontend/src/components/EmergencyConfig.tsx`, `test/EmergencyAccess.test.ts`
- Last updated: `2026-05-05`

## FR-014c - Emergency Record Retrieval

- Status: `validated`
- Scope Tier: `core`
- Owner: `developer+agent`
- Linked TODO tasks: `M3.1`, `M3.2`, `M3.3`
- Linked tests: `EA-T03`, `INT-T05`
- Model Notes: Emergency retrieval scope is limited to emergency-designated records. Pre-encrypted keys stored by patient, retrieved via active session. Frontend EmergencySessions component shows doctors which records they can access.
- Evidence links: `contracts/EmergencyAccess.sol` (consumeEmergencyAccess, getEmergencyKey), `test/EmergencyAccess.test.ts`, `frontend/src/components/EmergencySessions.tsx`, `frontend/src/hooks/useEmergencyAccess.ts`
- Last updated: `2026-05-05`

## FR-014d - Ephemeral OTP/Session Consumption

- Status: `validated`
- Scope Tier: `core`
- Owner: `developer+agent`
- Linked TODO tasks: `M3.1`, `M3.2`, `M3.3`
- Linked tests: `EA-T04`
- Model Notes: Sessions are time-limited (1-72 hours) and can be revoked by patient. Status tracked (Active/Expired/Revoked). Frontend EmergencySessions shows session status, allows consumption for doctors and revocation for patients.
- Evidence links: `contracts/EmergencyAccess.sol` (consumeEmergencyAccess, revokeEmergencySession), `test/EmergencyAccess.test.ts`, `frontend/src/components/EmergencySessions.tsx`
- Last updated: `2026-05-05`

## FR-015 - View Access Permissions

- Status: `validated`
- Scope Tier: `core`
- Owner: `developer+agent`
- Linked TODO tasks: `M2.2`
- Linked tests: `RM-T12`, `RM-T13`, `AC-T20`
- Model Notes: Permission visibility supports control and explainability of access decisions. Contract view functions implemented. Frontend UI now allows patients to view pending requests and active permissions.
- Evidence links: `contracts/AccessControl.sol` (getSharedRecords, getPermissionsForRecord, getPermissionsByOwner, getPendingRequests, getRequestsByDoctor), `test/AccessControl.test.ts`, `frontend/src/components/PermissionManager.tsx`, `frontend/src/hooks/usePermissions.ts`
- Last updated: `2026-05-05`

## FR-016 - Audit Trail / Access Log

- Status: `validated`
- Scope Tier: `core`
- Owner: `developer+agent`
- Linked TODO tasks: `M2.1`, `M2.3`
- Linked tests: `AC-T23`, `AC-T24`, `AC-T25`, `INT-T09`
- Model Notes: All sensitive access actions must be auditable via events and traceable logs. Access and emergency paths now validated with edge-case event assertions. Doctor SharedRecords component auto-logs access when viewing records (M2.3).
- Evidence links: `contracts/AccessControl.sol` (logAccess, RecordAccessed), `contracts/EmergencyAccess.sol` (EmergencyAccessTriggered, EmergencyOTPIssued, EmergencyOTPConsumed, EmergencyRecordAccessed, EmergencySessionRevoked), `test/AccessControl.test.ts`, `test/EmergencyAccess.test.ts`, `frontend/src/components/SharedRecords.tsx` (logRecordAccess)
- Last updated: `2026-05-05`
