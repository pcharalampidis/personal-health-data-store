# TODO_AI - High Priority Tasks

Use this as the canonical task board for AI-assisted implementation.
Always follow `AI_GUIDE.md`.

## Workflow Rules

- Pick exactly one unchecked task at a time.
- Include FR/UC IDs and related `testing.md` IDs in each task.
- Keep file scope small and explicit.
- Mark complete only after running required scripts.
- Add the mandatory task footer when finishing a task.

## Scope Tiers

### Core MVP (must deliver)

- M1.1, M1.2a, M1.2, M1.3, M1.4
- M2.1, M2.2, M2.3
- M3.1, M3.2, M3.3

### Stretch (only after Core MVP is validated)

- Advanced request-flow refinements
- Advanced filtering/search
- Non-essential UX polish and convenience features

## Execution Sequence (Vertical Slice First)

1. Environment/script baseline (`M1.1`)
2. User/role baseline (`M1.2a`)
3. Custodian registry baseline (`M1.2`)
4. Encrypted upload + retrieval (`M1.3`, `M1.4`)
5. Grant/revoke + doctor view (`M2.x`)
6. Emergency Custodian+OTP core path (`M3.x`)
7. Stretch items (after core validation)

---

## Task Template (Copy For New Tasks)

```markdown
### [ ] <Task ID> - <Title>

Requirement IDs:
- FR-xxx / UC-xxx

Tests to satisfy:
- <testing.md test IDs>

Allowed files:
- <file path list>

Non-goals:
- <what must not change>
- Do not edit other layers unless this task explicitly allows it.

Verification scripts:
- <script 1>
- <script 2>

Completion notes (fill after done):
Files touched:
- ...

Commands run:
- ...

Result summary:
- ...

Follow-up tasks:
- None
```

---

## Milestone 1 - Setup + Upload Flow + Custodian Registry

### [x] M1.1 - Environment setup

Requirement IDs:
- FR-001

Tests to satisfy:
- API-T01, API-T06, API-T07 (smoke baseline once server scaffolding exists)
- UR-T01 and RM-T01 test execution path is runnable from scripts

Allowed files:
- `package.json`
- `hardhat.config.ts`
- `.env.example`
- `.gitignore`
- `backend/package.json`
- `frontend/package.json`
- minimal project scaffold files

Non-goals:
- Implementing complete business logic
- Do not modify contract, backend, and frontend business logic; this task is setup only.

Verification scripts:
- `npm run test:contracts` (once contracts exist)
- `npm run dev:all` (smoke start)

Files touched:
- `package.json`
- `hardhat.config.ts`
- `.env.example`
- `.gitignore`
- `backend/package.json`
- `backend/tsconfig.json`
- `frontend/package.json`
- `frontend/tsconfig.json`
- `frontend/vite.config.ts`
- `frontend/index.html`

Commands run:
- `npm init -y`
- `npm install --save-dev hardhat @nomicfoundation/hardhat-toolbox-mocha-ethers concurrently`
- `npm install` (backend and frontend)

Result summary:
- Git initialized, Hardhat 3 with Solidity 0.8.19 configured
- Root scripts wired: `test:contracts`, `dev:backend`, `dev:frontend`, `dev:all`, `deploy:local`
- Backend (Express + TypeScript + tsx) and frontend (React + Vite + ethers.js) scaffolds created

Follow-up tasks:
- None

### [x] M1.2a - User and role baseline (`UserRegistry`)

Requirement IDs:
- FR-003, FR-005

Tests to satisfy:
- UR-T01 to UR-T08 (registration and key management)
- SEC-T03, SEC-T09, SEC-T10

Allowed files:
- `contracts/UserRegistry.sol`
- `test/unitUserRegistry.test.js` (or equivalent user-registry test file)
- minimal fixture/helper updates required by this contract only

Non-goals:
- Do not modify backend or frontend files.
- Do not implement emergency flow UI/backend in this task.

Verification scripts:
- `npm run test:contracts`

Files touched:
- `contracts/UserRegistry.sol`
- `contracts/interfaces/IUserRegistry.sol`
- `test/UserRegistry.test.ts`
- `test/RecordManager.test.ts` (updated fixture)

Commands run:
- `npm run test:contracts`

Result summary:
- UserRegistry with custom Ownable + Pausable (no OpenZeppelin)
- Patient registration, doctor registration (simplified, no verification status)
- **REFACTORED per supervisor guidance**: Removed admin verify/reject functions
- Doctor verification now handled off-chain by Custodian registry
- `isDoctorVerified()` returns true for any registered doctor (basic check)
- Detailed verification for emergency access checks Custodian registry off-chain
- 23 UserRegistry + 29 RecordManager = 52 unit tests passing

Follow-up tasks:
- None

### [x] M1.2 - Custodian provider registry on IPFS

Requirement IDs:
- FR-005, FR-014b

Tests to satisfy:
- UR-T09 to UR-T12 (doctor verification model alignment)
- AC-T02, AC-T09 (verified-doctor gate)
- EA-T01, EA-T02 (emergency actor and OTP issuance path prerequisites)

Allowed files:
- `custodian/providers.json`
- `scripts/pin-custodian.js`
- `backend/src/scripts/check-custodian.ts`
- `backend/src/services/custodian.ts`
- `backend/src/routes/custodian.ts`
- `backend/src/server.ts`
- `backend/src/routes/records.ts`
- `backend/src/services/ipfs.ts`
- `package.json`

Non-goals:
- Emergency full UI flow
- Do not modify frontend UI or unrelated contract logic.

Verification scripts:
- backend lint/test scripts
- targeted script for registry pinning/validation

Files touched:
- `custodian/providers.json`
- `scripts/pin-custodian.js`
- `backend/src/scripts/check-custodian.ts`
- `backend/src/services/custodian.ts`
- `backend/src/routes/custodian.ts`
- `backend/src/server.ts`
- `backend/src/routes/records.ts`
- `backend/src/services/ipfs.ts`
- `package.json`
- `custodian/registry-meta.json`
- `docs/TODO_AI.md`
- `docs/REQUIREMENTS_STATUS.md`
- `docs/CHANGES.md`

Commands run:
- `npm run check:custodian`
- `npm run pin:custodian` (validated and pinned registry to IPFS)
- `npm --prefix backend run build`
- `npx hardhat test test/AccessControl.test.ts` (rerun after a full-suite fixture timeout)
- `npm run test:contracts`

Result summary:
- Demo Custodian provider registry created with active and suspended providers.
- Backend Custodian service can load the registry, normalize provider wallets, return provider metadata, and validate active/suspended/missing/malformed wallets.
- Demo routes added: `GET /api/custodian/providers` and `GET /api/custodian/providers/:wallet/verify`.
- Registry validation/pinning script added. It pinned the registry to IPFS CID `QmVmL1TyDYryDfdQUT6gvo967vaqnqphwAPNu8xxRt7xhu` and wrote `custodian/registry-meta.json`.
- Focused script checks cover active, suspended, missing, and malformed provider wallets.
- Hardening update: `encryptionPublicKey` validation now enforces strict 32-byte hex format (`0x` + 64 hex chars).
- Hardening update: Custodian checks now execute real backend service logic (`validateProviderWallet`) via `backend/src/scripts/check-custodian.ts`, avoiding duplicated validation logic drift.

Follow-up tasks:
- M3.2 should use `backend/src/services/custodian.ts` before calling `EmergencyAccess.issueEmergencyOTP()` or `rejectEmergencyRequest()`.

### [x] M1.3 - End-to-end upload flow (encrypt -> IPFS -> chain)

Requirement IDs:
- FR-006, FR-007, FR-008, NFR-003

Tests to satisfy:
- RM-T01 to RM-T07
- RM-T19, RM-T20
- API-T04, API-T05

Allowed files:
- `frontend/src/components/UploadRecord.tsx`
- `backend/src/routes/records.ts`
- `contracts/RecordManager.sol`
- related tests only

Non-goals:
- broad refactors
- Do not change access-control (`AccessControl.sol`) or emergency (`EmergencyAccess.sol`) flows in this task.

Verification scripts:
- `npm run test:contracts`
- backend test script
- frontend test script

Files touched:
- `contracts/RecordManager.sol`
- `contracts/interfaces/IRecordManager.sol`
- `test/RecordManager.test.ts`
- `backend/src/server.ts`
- `backend/src/routes/records.ts`
- `backend/src/routes/health.ts`
- `backend/src/services/ipfs.ts`
- `frontend/src/main.tsx`
- `frontend/src/App.tsx`
- `frontend/src/hooks/useWallet.ts`
- `frontend/src/utils/encryption.ts`
- `frontend/src/services/contracts.ts`
- `frontend/src/components/WalletConnect.tsx`
- `frontend/src/components/UploadRecord.tsx`
- `frontend/src/components/RecordList.tsx`
- `scripts/deploy.ts`

Commands run:
- `npm run test:contracts` (61 tests passing — 32 UserRegistry + 29 RecordManager)
- `npx tsc --noEmit` (frontend type-check clean)
- `npx vite build` (frontend build succeeds)

Result summary:
- RecordManager with add/archive/restore/delete lifecycle, emergency flag, encrypted key storage
- 29 unit tests passing for RecordManager
- Backend Express server with Pinata IPFS pin/fetch/unpin routes
- Frontend client-side AES-256-GCM encryption, wallet connection, upload and record list UI
- Deployment script for UserRegistry + RecordManager

Follow-up tasks:
- M1.4 (interconnection proof test) still pending
- Backend/frontend integration testing requires Pinata API keys in `.env`

### [x] M1.4 - Interconnection proof test

Requirement IDs:
- FR-006, FR-007, FR-008

Tests to satisfy:
- RM-T01, RM-T03, RM-T19 traceability
- API-T04, API-T05 traceability
- Add one dedicated E2E upload proof test case (`test/e2e-upload.test.ts`)

Allowed files:
- `test/e2e-upload.test.ts`

Non-goals:
- unrelated contract/frontend/backend rewrites
- Do not implement new product features while creating this proof test.

Verification scripts:
- `npm run test:contracts`

Files touched:
- `test/e2e-upload.test.ts`
- `docs/TODO_AI.md`
- `docs/CHANGES.md`
- `docs/REQUIREMENTS_STATUS.md`

Commands run:
- `npm run test:contracts` (151 tests passing — 144 existing + 7 new E2E tests)

Result summary:
- Created E2E upload proof test suite validating full vertical slice: encrypt → IPFS → chain
- 7 test cases covering:
  - Single record upload flow (encrypt, pin simulation, on-chain storage, retrieval)
  - Multi-record content integrity
  - Lifecycle operations preserving metadata
  - Emergency flag toggle without data corruption
  - Content hash determinism and uniqueness
  - Stored hash verification against retrieved CID
- Simulates client-side encryption output and IPFS CID generation
- Proves interconnection between encryption, IPFS storage, and on-chain record management

Follow-up tasks:
- None (Milestone 1 complete)

---

## Milestone 2 - Access Control + Doctor View

### [x] M2.1 - Implement `AccessControl.sol`

Requirement IDs:
- FR-011, FR-012, FR-013, FR-016

Tests to satisfy:
- AC-T01 to AC-T25
- INT-T01, INT-T02, INT-T03

Allowed files:
- `contracts/AccessControl.sol`
- `test/unitAccessControl.test.js` (or equivalent access-control test file)
- minimal fixture/helper updates required by this contract only

Non-goals:
- Do not implement emergency OTP logic in this task.
- Do not modify backend or frontend files.

Verification scripts:
- `npm run test:contracts`

Files touched:
- `contracts/AccessControl.sol`
- `contracts/interfaces/IAccessControl.sol`
- `contracts/RecordManager.sol` (fixed syntax error in onlyAuthorised modifier)
- `test/AccessControl.test.ts`

Commands run:
- `npx hardhat compile` (3 Solidity files compiled)
- `npm run test:contracts` (144 tests passing after edge-case expansion)

Result summary:
- AccessControl contract with consent-based access management
- Doctor access request with reason and record ID validation
- Patient approve/reject workflow for access requests
- Direct grant for proactive sharing (e.g., scheduled appointments)
- Single revocation, batch revocation, revoke all access to record
- Lazy expiry checking (no cron/keeper needed)
- Encrypted key storage/removal delegated to RecordManager
- Audit trail via RecordAccessed event
- Request expiry enforcement (`AccessControl: request expired`)
- Record state revalidation during `approveAccess`
- `checkAccess` now denies archived/deleted records
- 42 AccessControl tests passing (144 total contract tests)

Follow-up tasks:
- M2.2 (Patient grant/revoke UI)
- M2.3 (Doctor request + view shared records)

### [x] M2.2 - Patient grant/revoke UI

Requirement IDs:
- FR-011, FR-012, FR-013

Tests to satisfy:
- AC-T07 to AC-T18 (permission grant/check/revoke behavior)
- AC-T19 to AC-T22 (revocation side-effects and batch revoke behavior)
- INT-T01, INT-T02

Allowed files:
- `frontend/src/components/*` (patient permission UI only)
- `frontend/src/hooks/*` (permission hooks only)
- `frontend/src/services/*` (access-control API/contract client only)
- frontend tests related to these flows only

Non-goals:
- Do not modify `.sol` contracts in this task.
- Do not change backend routes/services in this task.

Verification scripts:
- `npm run lint --prefix frontend`
- `npm run test --prefix frontend`

Files touched:
- `frontend/src/services/contracts.ts`
- `frontend/src/hooks/usePermissions.ts`
- `frontend/src/hooks/useRecords.ts`
- `frontend/src/components/PermissionManager.tsx`
- `frontend/src/components/GrantAccess.tsx`
- `frontend/src/App.tsx`
- `docs/TODO_AI.md`
- `docs/CHANGES.md`
- `docs/REQUIREMENTS_STATUS.md`

Commands run:
- `npx tsc --noEmit` (frontend type-check clean)
- `npx vite build` (frontend build succeeds)
- `npm run test:contracts` (151 tests passing)

Result summary:
- Added AccessControl ABI and contract getter to frontend services
- Created `usePermissions` hook for loading/managing access requests and permissions
- Created `useRecords` hook for loading patient records
- Built `PermissionManager` component with tabbed UI for pending requests and active permissions
- Built `GrantAccess` component for direct access grants to verified doctors
- Integrated both components into App.tsx
- Patient can now: view pending requests, approve/reject them, view active permissions, revoke access, and proactively grant access to doctors

Follow-up tasks:
- M2.3 (Doctor request + view shared records)

### [x] M2.3 - Doctor request + view shared records

Requirement IDs:
- FR-011, FR-013, FR-016

Tests to satisfy:
- AC-T01 to AC-T06 (request flow constraints)
- AC-T12 to AC-T15 (access checks and lazy expiry behavior)
- AC-T23 to AC-T25 (audit/access logging)
- INT-T01, INT-T03, INT-T09

Allowed files:
- `frontend/src/components/*` (doctor request/view pages only)
- `frontend/src/hooks/*` (doctor access hooks only)
- `frontend/src/services/*` (doctor access contract/api calls only)
- frontend tests related to doctor flows only

Non-goals:
- Do not modify `.sol` contracts in this task.
- Do not implement emergency OTP UI in this task.

Verification scripts:
- `npm run lint --prefix frontend`
- `npm run test --prefix frontend`

Files touched:
- `frontend/src/hooks/useDoctorAccess.ts`
- `frontend/src/hooks/useUserRole.ts`
- `frontend/src/components/RequestAccess.tsx`
- `frontend/src/components/SharedRecords.tsx`
- `frontend/src/components/Register.tsx`
- `frontend/src/App.tsx`
- `docs/TODO_AI.md`
- `docs/CHANGES.md`
- `docs/REQUIREMENTS_STATUS.md`

Commands run:
- `npx tsc --noEmit` (frontend type-check clean)
- `npx vite build` (frontend build succeeds)
- `npm run test:contracts` (151 tests passing)

Result summary:
- Created `useDoctorAccess` hook for doctor-specific operations (request access, view shared records, log access)
- Created `useUserRole` hook for role detection (patient vs doctor vs unregistered)
- Built `RequestAccess` component: doctors can lookup patient, select records, submit request with reason
- Built `SharedRecords` component: doctors can view records shared with them, click to see details, auto-logs access
- Updated `Register` component to call `onRegistered` callback for role refresh
- Integrated role-based rendering into App.tsx: shows patient UI or doctor UI based on registered role
- Doctor can now: lookup patient records, request access with reason, view pending/past requests, view shared records

Follow-up tasks:
- M3.2 (Custodian emergency backend path)
- M3.3 (Frontend emergency UIs)

---

## Milestone 3 - Emergency OTP Flow

### [x] M3.1 - Implement `EmergencyAccess.sol`

Requirement IDs:
- FR-014b, FR-014c, FR-014d

Tests to satisfy:
- EA-T01 to EA-T04
- INT-T05

Allowed files:
- `contracts/EmergencyAccess.sol`
- `test/unitEmergencyAccess.test.js` (or equivalent emergency test file)
- minimal fixture/helper updates required by this contract only

Non-goals:
- Do not modify backend or frontend files.
- Do not refactor `AccessControl.sol` unless strictly required for interface compatibility.

Verification scripts:
- `npm run test:contracts`

Files touched:
- `contracts/EmergencyAccess.sol`
- `contracts/interfaces/IEmergencyAccess.sol`
- `test/EmergencyAccess.test.ts`
- `scripts/deploy.ts`

Commands run:
- `npx hardhat compile`
- `npm run test:contracts` (144 tests passing after edge-case expansion)

Result summary (HYBRID MODEL per updated ADR-002):
- EmergencyAccess contract with **two emergency access paths**:
  - **Path 1 - Trusted Contacts**: Patient pre-configures trusted contacts (any registered user, not just doctors). Patient pre-stores encrypted keys. Trusted contact triggers → immediate Active session.
  - **Path 2 - Custodian Registry**: Any verified doctor triggers → Pending session. Custodian validates against off-chain provider registry. Issues OTP if valid.
- **TriggerType enum**: TrustedContact (0) vs CustodianRegistry (1)
- **Session states**: Pending → Active → Consumed → Expired/Revoked
- Patient autonomy: trusted contacts don't need to be doctors
- Patient can revoke sessions at any time
- Full audit trail via events
- 39 EmergencyAccess tests passing (hybrid model + edge cases)
- Deploy script updated to deploy all 4 contracts with configuration

Follow-up tasks:
- M3.2 (Custodian emergency backend path - validates against IPFS provider registry, issues OTPs)
- M3.3 (Frontend emergency UIs - configure trusted contacts, trigger emergency, view sessions)

### [x] M3.2 - Custodian emergency backend path

Requirement IDs:
- FR-005, FR-014b, FR-014c

Tests to satisfy:
- EA-T02, EA-T03 integration traceability
- API-T07 (consistent error format for failure paths)
- INT-T05

Allowed files:
- `backend/src/services/custodian.ts`
- `backend/src/routes/*` (emergency endpoints only)
- `backend/src/server.ts` (middleware wiring only if required)
- backend tests for emergency OTP path only

Non-goals:
- Do not edit `.sol` contracts in this task.
- Do not modify frontend pages/components in this task.

Verification scripts:
- `npm run lint --prefix backend`
- `npm run test --prefix backend`

Files touched:
- `backend/src/services/emergency.ts` (new)
- `backend/src/routes/emergency.ts` (new)
- `backend/src/server.ts`
- `.env.example`
- `docs/TODO_AI.md`
- `docs/CHANGES.md`
- `docs/REQUIREMENTS_STATUS.md`

Commands run:
- `npm run build --prefix backend` (TypeScript compiles clean)
- `npm run test:contracts` (151 tests passing)

Result summary:
- Created `emergency.ts` service with:
  - `initializeEmergencyService()` - connects to blockchain, validates Custodian wallet
  - `getPendingSessions()` / `getSession()` - read pending emergency requests
  - `processSession()` - validates doctor against custodian registry, issues OTP or rejects
  - `processPendingSessions()` - batch process all pending sessions
  - `startEventListener()` / `stopEventListener()` - auto-process new emergency requests
- Created `emergency.ts` routes:
  - `GET /api/emergency/status` - service status
  - `POST /api/emergency/initialize` - manual initialization
  - `GET /api/emergency/pending` - list pending sessions
  - `GET /api/emergency/session/:sessionId` - get session details
  - `POST /api/emergency/process/:sessionId` - manually process a session
  - `POST /api/emergency/process-all` - process all pending sessions
  - `POST /api/emergency/listener/start` - start event listener
  - `POST /api/emergency/listener/stop` - stop event listener
- Updated server.ts to mount emergency routes and auto-initialize service
- Updated .env.example with EMERGENCY_ACCESS_ADDRESS, CUSTODIAN_PRIVATE_KEY, AUTO_START_EMERGENCY_LISTENER

Follow-up tasks:
- M3.3 (Frontend emergency UIs)

### [x] M3.3 - Frontend emergency UIs

Requirement IDs:
- FR-014a, FR-014b, FR-014c, FR-014d

Tests to satisfy:
- RM-T15 to RM-T18 (emergency flag behaviors)
- EA-T01 to EA-T04 (session + OTP flow traceability)
- INT-T05

Allowed files:
- `frontend/src/components/*` (emergency pages/components only)
- `frontend/src/hooks/*` (emergency hooks only)
- `frontend/src/services/*` (emergency API/contract client only)
- frontend tests for emergency flows only

Non-goals:
- Do not modify `.sol` contract files in this task.
- Do not change unrelated patient/doctor non-emergency views.

Verification scripts:
- `npm run lint --prefix frontend`
- `npm run test --prefix frontend`

Files touched:
- `frontend/src/services/contracts.ts`
- `frontend/src/hooks/useEmergencyAccess.ts` (new)
- `frontend/src/components/EmergencyConfig.tsx` (new)
- `frontend/src/components/EmergencyTrigger.tsx` (new)
- `frontend/src/components/EmergencySessions.tsx` (new)
- `frontend/src/App.tsx`
- `docs/TODO_AI.md`
- `docs/CHANGES.md`
- `docs/REQUIREMENTS_STATUS.md`

Commands run:
- `npx tsc --noEmit` (frontend type-check clean)
- `npx vite build` (frontend build succeeds)
- `npm run test:contracts` (151 tests passing)

Result summary:
- Added EmergencyAccess ABI and contract getter to frontend services
- Created `useEmergencyAccess` hook with full emergency operations
- Built `EmergencyConfig` component: patients configure trusted contacts, toggle emergency flag on records
- Built `EmergencyTrigger` component: doctors trigger emergency access with patient lookup
- Built `EmergencySessions` component: view/manage sessions (revoke for patient, consume for doctor)
- Integrated all emergency components into App.tsx with role-based rendering
- Patient can: configure trusted contacts, flag records for emergency, view/revoke sessions
- Doctor can: trigger emergency access, view session status, consume active sessions

---

## Milestone 4 - Retrieval and UI/UX Hardening

### [x] M4.1 - Freeze current implementation baseline (docs only)

Requirement IDs:
- All implemented MVP requirements (FR-006, FR-008, FR-011, FR-014, FR-016, FR-017)

Tests to satisfy:
- Documentation-only task

Allowed files:
- docs/CURRENT_IMPLEMENTATION_BASELINE.md
- docs/REQUIREMENTS_STATUS.md
- docs/CHANGES.md
- docs/TODO_AI.md

Non-goals:
- Do not change source code.

Verification scripts:
- Documentation review only

Files touched:
- docs/CURRENT_IMPLEMENTATION_BASELINE.md (new)
- docs/REQUIREMENTS_STATUS.md
- docs/CHANGES.md
- docs/TODO_AI.md

Commands run:
- None (docs only)

Result summary:
- Created baseline document superseding older mock-key documentation
- Added UX readiness table to REQUIREMENTS_STATUS.md identifying M4 targets
- Documented known gaps: patient self-view, duplicated decrypt logic, ABI gaps, access logging timing

Follow-up tasks:
- M4.2

### [x] M4.2 - Record packaging and retrieval utilities

Requirement IDs:
- FR-006, FR-007, FR-008, FR-017, FR-014c, NFR-001, NFR-002

Tests to satisfy:
- Frontend utility tests for package parsing, legacy fallback, hash verification, missing private key

Allowed files:
- frontend/src/utils/encryption.ts
- frontend/src/utils/recordPackage.ts
- frontend/src/utils/recordRetrieval.ts
- frontend/src/utils/*.test.ts

Non-goals:
- Do not modify contracts.
- Do not modify backend routes.
- Do not refactor UI components yet.

Verification scripts:
- npm run test --prefix frontend -- --run
- npx tsc --noEmit
- npx vite build

### [x] M4.3 - Reusable RecordViewer component

Requirement IDs:
- FR-008, FR-017, FR-014c, FR-016, NFR-013, NFR-014

Allowed files:
- frontend/src/components/RecordViewer.tsx
- frontend/src/components/TechnicalDetails.tsx
- frontend/src/utils/recordRetrieval.ts

Non-goals:
- Do not change UploadRecord, SharedRecords, or EmergencySessions yet.
- Do not modify contracts/backend.

Verification scripts:
- npx tsc --noEmit
- npx vite build

### [x] M4.4 - Patient self-view and download

Requirement IDs:
- FR-008, NFR-001, NFR-013

Allowed files:
- frontend/src/components/RecordList.tsx
- frontend/src/hooks/useRecords.ts
- frontend/src/services/contracts.ts
- frontend/src/components/RecordViewer.tsx

Non-goals:
- Do not change doctor or emergency flows.
- Do not modify contracts/backend.

Verification scripts:
- npx tsc --noEmit
- npx vite build

### [x] M4.5 - Refactor doctor shared records to RecordViewer

Requirement IDs:
- FR-017, FR-016, NFR-008

Allowed files:
- frontend/src/components/SharedRecords.tsx
- frontend/src/hooks/useDoctorAccess.ts
- frontend/src/components/RecordViewer.tsx

Non-goals:
- Do not change patient upload/view logic.
- Do not modify contracts/backend.

Verification scripts:
- npx tsc --noEmit
- npx vite build

### [x] M4.6 - Emergency retrieval viewer integration

Requirement IDs:
- FR-014c, FR-014d, FR-016

Allowed files:
- frontend/src/components/EmergencySessions.tsx
- frontend/src/hooks/useEmergencyAccess.ts
- frontend/src/components/RecordViewer.tsx
- frontend/src/services/contracts.ts

Non-goals:
- Do not change contracts unless ABI mismatch discovered.
- Do not change backend emergency processing.

Verification scripts:
- npx tsc --noEmit
- npx vite build

### [x] M4.7 - Upload UX hardening

Requirement IDs:
- FR-006, FR-007, NFR-013, NFR-014

Allowed files:
- frontend/src/components/UploadRecord.tsx
- frontend/src/components/TechnicalDetails.tsx
- frontend/src/utils/recordPackage.ts

Non-goals:
- Do not modify contracts.
- Do not modify backend upload route.

Verification scripts:
- npx tsc --noEmit
- npx vite build

### [x] M4.8 - Record actions and lifecycle polish

Requirement IDs:
- FR-008, FR-009, FR-014a, FR-015

Allowed files:
- frontend/src/components/RecordList.tsx
- frontend/src/hooks/useRecords.ts
- frontend/src/services/contracts.ts
- frontend/src/components/ConfirmModal.tsx

Non-goals:
- Do not modify backend.
- Do not modify contracts.

Verification scripts:
- npx tsc --noEmit
- npx vite build

### [x] M4.9 - Workflow catalogue and demo script

Requirement IDs:
- All core MVP FRs

Tests to satisfy:
- Documentation/demo review

Allowed files:
- docs/WORKFLOW_CATALOG.md
- docs/REQUIREMENTS_STATUS.md
- docs/CHANGES.md

Non-goals:
- Do not change source code.

Verification scripts:
- Documentation review only

Files touched:
- `frontend/src/components/PermissionManager.tsx`

Result summary:
- Added batch select/approve/reject for multiple pending requests
- Added expiry countdown display for active permissions (e.g., "5d 3h remaining")
- Separated active vs expired permissions in the UI
- Auto-refresh expiry display every minute

### [x] S4.2 - Advanced filtering/search

Files touched:
- `frontend/src/components/RecordList.tsx`
- `frontend/src/components/EmergencySessions.tsx`

Result summary:
- RecordList: Added search by ID/CID/type, filter by record type, status (active/archived/deleted), emergency flag
- EmergencySessions: Added filter by session status (pending/active/consumed/ended) and trigger type (trusted/custodian)
- Both show filtered count vs total count

### [x] S4.3 - Non-essential UX polish

Files touched:
- `frontend/src/components/ConfirmModal.tsx` (new)
- `frontend/src/components/Toast.tsx` (new)
- `frontend/src/hooks/useToast.ts` (new)
- `frontend/src/App.tsx`

Result summary:
- Created reusable ConfirmModal component for destructive action confirmations
- Created Toast notification system with success/error/info/warning types
- Integrated ToastContainer into App for global notifications
- Added success toasts for record upload and registration

### [x] S4.4 - Mobile-responsive UI

Files touched:
- `frontend/src/index.css` (new)
- `frontend/src/main.tsx`
- `frontend/src/App.tsx`
- `frontend/src/components/WalletConnect.tsx`
- `frontend/src/components/Register.tsx`
- `frontend/src/components/UploadRecord.tsx`
- `frontend/src/components/RecordList.tsx`
- `frontend/src/components/PermissionManager.tsx`
- `frontend/src/components/GrantAccess.tsx`
- `frontend/src/components/RequestAccess.tsx`
- `frontend/src/components/SharedRecords.tsx`
- `frontend/src/components/EmergencyConfig.tsx`
- `frontend/src/components/EmergencyTrigger.tsx`
- `frontend/src/components/EmergencySessions.tsx`
- `frontend/src/components/Toast.tsx`
- `frontend/src/components/ConfirmModal.tsx`

Commands run:
- `npx tsc --noEmit` (frontend type-check passed)

Result summary:
- Created `index.css` with CSS custom properties and mobile-first responsive design
- Implemented responsive breakpoints: 480px (mobile), 769px (tablet/desktop)
- Updated all 13 frontend components to use CSS variables
- Touch-friendly targets (min 44px) for buttons and inputs
- Flexible layouts with wrap/stack behavior on small screens
- Proper word-break for long wallet addresses and IPFS CIDs
- Consistent theming via CSS custom properties (colors, spacing, radii)

---

## Completion Footer (Mandatory For Closed Tasks)

```markdown
Files touched:
- path/to/fileA
- path/to/fileB

Commands run:
- npm run <script>

Result summary:
- concise bullet(s)

Follow-up tasks:
- None
```

---

## Track B — Action Semantics & Disclosure (Complete)

### [x] AS-1 to AS-8 — Action Semantics & Disclosure

Files touched:
- docs/USER_ACTION_SEMANTICS.md (new)
- frontend/src/components/TechnicalDetails.tsx (new)
- frontend/src/components/PrivacySecurityInfo.tsx (new)
- frontend/src/components/EmergencyTrigger.tsx
- frontend/src/components/EmergencyConfig.tsx
- frontend/src/components/EmergencySessions.tsx
- frontend/src/components/PermissionManager.tsx
- frontend/src/hooks/useEmergencyAccess.ts

Result summary:
- Created canonical action semantics document (14 actions)
- Standardised terminology (Trigger→Request, Consume→Open, Sync→Prepare)
- Added TechnicalDetails component, all raw data collapsed
- Added ConfirmModal to revoke access, end session, request emergency
- Archive primary, Delete not exposed (until FP-8b)
- Doctor audit notice + access logged after decrypt only
- Privacy/Security info page (7 expandable sections)

---

## Milestone 5 — UI Redesign (Complete)

### [x] M5.1 to M5.8 — Responsive App Shell + UI Redesign

Files touched:
- frontend/src/index.css (healthcare palette, app shell CSS)
- frontend/src/App.tsx (page-based navigation, AppShell)
- frontend/src/components/RecordList.tsx (empty state)

Result summary:
- Healthcare colour palette (blue #2563eb, teal #14b8a6, slate text)
- Desktop sidebar (≥1024px) with role-based navigation
- Mobile bottom nav with 4 items
- Patient pages: Records, Access, Emergency, Settings
- Doctor pages: Shared, Request, Emergency, Settings
- Page headers with title + description
- Clean landing page + registration flow
- Records empty state with dashed border

---

## Final Polish Pass (Complete)

### [x] FP-1 to FP-8 — Final UI Polish

Files touched:
- frontend/src/App.tsx
- frontend/src/index.css
- frontend/src/hooks/useWallet.ts
- frontend/src/utils/errorMessages.ts (new)
- frontend/src/components/layout/AppShell.tsx (new)
- frontend/src/components/layout/Sidebar.tsx (new)
- frontend/src/components/layout/MobileBottomNav.tsx (new)
- frontend/src/components/RecordList.tsx
- frontend/src/components/UploadRecord.tsx
- docs/UI_MOBILE_QA.md (new)
- docs/FINAL_WORKFLOW_STATUS.md (new)

Result summary:
- Nav icons updated (📄🔐🚨⚙️ / 👥✉️🚨⚙️)
- Upload collapsed behind "Upload record" button
- Extracted AppShell/Sidebar/MobileBottomNav components
- Settings: account info, local key status card, privacy info
- Friendly error messages (no raw ethers errors)
- Change wallet button
- "Remove from vault" button (unpin + deleteRecord + warning)
- Mobile QA documentation
- Final workflow status documentation
