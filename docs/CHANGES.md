# CHANGES

Track requirement-level deltas from original plan/specs.
Keep entries short and factual for dissertation traceability.

## Entry Template

```markdown
## YYYY-MM-DD

- Change: <what changed>
- Reason: <why it changed>
- Impact:
  - Requirements: <FR/UC IDs or "None">
  - Tests: <test IDs updated or "None">
  - Docs: <files updated or "None">
```

## 2026-05-27 (Track B + M5 + Final Polish)

- Change: Track B — Action Semantics & Disclosure (AS-1 to AS-8)
- Reason: Make every sensitive action honest, non-technical, and safe for health-record users.
- Impact:
  - Requirements: NFR-013, NFR-014, NFR-016
  - Tests: None (UI/UX changes)
  - New files: `docs/USER_ACTION_SEMANTICS.md`, `frontend/src/components/TechnicalDetails.tsx`, `frontend/src/components/PrivacySecurityInfo.tsx`
  - Modified: `EmergencyTrigger.tsx` (Trigger→Request), `EmergencyConfig.tsx` (Sync→Prepare), `EmergencySessions.tsx` (Consumed→Opened, ConfirmModal), `PermissionManager.tsx` (ConfirmModal on revoke), `useEmergencyAccess.ts` (status labels)

- Change: M5 — Responsive app shell and UI redesign
- Reason: Transform app from single stacked demo page to role-based health vault interface.
- Impact:
  - Requirements: NFR-013, NFR-014, NFR-015
  - Tests: None (UI/UX changes)
  - New files: `frontend/src/components/layout/AppShell.tsx`, `frontend/src/components/layout/Sidebar.tsx`, `frontend/src/components/layout/MobileBottomNav.tsx`
  - Modified: `frontend/src/index.css` (healthcare palette, app shell CSS), `frontend/src/App.tsx` (page-based navigation, AppShell, clean landing)
  - Features: Desktop sidebar (≥1024px), mobile bottom nav, patient pages (Records/Access/Emergency/Settings), doctor pages (Shared/Request/Emergency/Settings), page headers

- Change: Final Polish Pass (FP-1 to FP-8)
- Reason: Finish remaining polish for dissertation demo readiness.
- Impact:
  - Requirements: NFR-013, NFR-014, NFR-015, NFR-016
  - Tests: 22 frontend tests passing
  - New files: `frontend/src/utils/errorMessages.ts`, `docs/UI_MOBILE_QA.md`, `docs/FINAL_WORKFLOW_STATUS.md`
  - Modified: `frontend/src/hooks/useWallet.ts` (changeWallet), `frontend/src/App.tsx` (upload collapsed, settings with key status), `frontend/src/components/RecordList.tsx` (Remove from vault button, friendlyErrorMessage), `frontend/src/components/UploadRecord.tsx` (friendlyErrorMessage)
  - Features:
    - Upload collapsed behind "Upload record" button (FP-2)
    - Friendly error messages replacing raw ethers errors (FP-8a)
    - Change wallet button in settings (FP-8a)
    - "Remove from vault" button: unpin IPFS + deleteRecord + warning modal (FP-8b)
    - Settings: account info, local key status card, privacy info (FP-4)
    - Mobile QA documentation (FP-6)
    - Final workflow status documentation (FP-7)

## 2026-05-27 (M4 correction pass)
- Reason: Make the app functionally complete for dissertation demo. Patient self-view was missing, decrypt logic was duplicated, upload UX was technical, emergency retrieval was incomplete.
- Impact:
  - Requirements: FR-006, FR-008, FR-013, FR-014c, FR-016
  - Tests: 22 frontend tests passing (recordPackage, encryption, RSA)
  - Docs: `docs/CURRENT_IMPLEMENTATION_BASELINE.md` (new), `docs/WORKFLOW_CATALOG.md` (new), `docs/REQUIREMENTS_STATUS.md`, `docs/TODO_AI.md`
  - New files:
    - `frontend/src/utils/recordPackage.ts` (PHDS2 binary format + legacy MIME sniffing)
    - `frontend/src/utils/recordRetrieval.ts` (unified decrypt pipeline)
    - `frontend/src/utils/recordPackage.test.ts`
    - `frontend/src/utils/encryption.test.ts`
    - `frontend/src/components/RecordViewer.tsx` (reusable viewer with preview/decrypt/download)
  - Modified:
    - `frontend/src/utils/encryption.ts` (added fromBase64)
    - `frontend/src/services/contracts.ts` (added getEmergencyRecords, restoreRecord to ABI)
    - `frontend/src/hooks/useRecords.ts` (added contentHash, owner, updatedAt)
    - `frontend/src/hooks/useDoctorAccess.ts` (added contentHash, updatedAt to SharedRecord)
    - `frontend/src/components/RecordList.tsx` (View button, archive/restore/emergency actions, ConfirmModal)
    - `frontend/src/components/SharedRecords.tsx` (replaced decrypt logic with RecordViewer)
    - `frontend/src/components/EmergencySessions.tsx` (replaced decrypt logic with RecordViewer, fixed trusted-contact path)
    - `frontend/src/components/UploadRecord.tsx` (PHDS2 packaging, file validation, stepper, no debug)
    - `frontend/src/App.tsx` (pass signer to RecordList)

## 2026-05-16

- Change: Implemented RSA-OAEP key wrapping across all access paths
- Reason: Replace placeholder/mock key handling with real asymmetric encryption for dissertation security claims.
- Impact:
  - Requirements: FR-006 (upload encryption), FR-007 (key storage), FR-014 (emergency access), NFR-006 (encryption public keys)
  - Tests: `frontend/src/utils/rsaKeys.test.ts` (new, 5 tests), `test/EmergencyAccess.test.ts` (7 new custodian key tests)
  - Docs: `docs/SECURITY.md`, `docs/CHANGES.md`, `docs/ARCHITECTURE_DECISIONS.md`
  - New files:
    - `frontend/src/utils/rsaKeys.ts` (RSA-OAEP utilities)
    - `backend/src/utils/keyWrapping.ts` (Custodian RSA crypto, Node webcrypto)
    - `backend/src/scripts/generateCustodianKeys.ts` (one-time key generation)
  - Modified (frontend):
    - `Register.tsx` (real RSA keypair generation via ensureRSAKeyPair)
    - `UploadRecord.tsx` (wrap AES key with patient RSA public key)
    - `GrantAccess.tsx` (unwrap patient key, re-wrap for doctor)
    - `PermissionManager.tsx` (approve-request wrapping)
    - `SharedRecords.tsx` (decrypt & download with doctor private key)
    - `EmergencyConfig.tsx` (wrap keys for trusted contacts + Custodian)
    - `EmergencySessions.tsx` (parse emergency package, decrypt files)
    - `contracts.ts` (new ABI entries)
  - Modified (backend):
    - `routes/custodian.ts` (GET /api/custodian/public-key endpoint)
    - `services/emergency.ts` (key re-wrapping in processSession)
  - Modified (contracts):
    - `EmergencyAccess.sol` (custodianEmergencyKeys storage, storeCustodianEmergencyKeys, getCustodianEmergencyKey)
    - `interfaces/IEmergencyAccess.sol` (interface declarations)
  - Migration: Requires contract redeployment and user re-registration (old mock keys incompatible)

## 2026-05-05

- Change: Added SECURITY.md documentation
- Reason: Document security architecture, measures, and considerations for dissertation completeness.
- Impact:
  - Requirements: None (documentation)
  - Tests: None
  - Docs: `docs/SECURITY.md` (new)
  - Covers: encryption (AES-256-GCM), key management, access control, smart contract security, IPFS, Custodian registry, emergency access, known limitations, production recommendations

- Change: Mobile-responsive UI implementation
- Reason: Application must work on mobile phones and smaller screens for real-world usability.
- Impact:
  - Requirements: None (non-functional/UX requirement)
  - Tests: None (manual visual testing)
  - Docs: `TODO_AI.md`, `CHANGES.md`
  - New files: `frontend/src/index.css` (CSS variables, responsive breakpoints, mobile-first styles)
  - Modified:
    - `frontend/src/main.tsx` (CSS import)
    - `frontend/src/App.tsx` (CSS variable usage)
    - All 13 component files updated with CSS variables and responsive patterns:
      - `WalletConnect.tsx`, `Register.tsx`, `UploadRecord.tsx`
      - `RecordList.tsx`, `PermissionManager.tsx`, `GrantAccess.tsx`
      - `RequestAccess.tsx`, `SharedRecords.tsx`
      - `EmergencyConfig.tsx`, `EmergencyTrigger.tsx`, `EmergencySessions.tsx`
      - `Toast.tsx`, `ConfirmModal.tsx`
  - Features added:
    - Mobile-first CSS with breakpoints (480px, 769px)
    - Touch-friendly targets (min 44px)
    - Flexible layouts with wrap/stack behavior
    - Word-break for long addresses/hashes
    - CSS custom properties for consistent theming

- Change: S4.1, S4.2, S4.3 - Stretch tasks (UX polish)
- Reason: Enhance user experience with filtering, batch actions, and notifications.
- Impact:
  - Requirements: None (stretch/polish tasks)
  - Tests: None
  - Docs: `TODO_AI.md`, `CHANGES.md`
  - New files: `frontend/src/components/ConfirmModal.tsx`, `frontend/src/components/Toast.tsx`, `frontend/src/hooks/useToast.ts`
  - Modified: `frontend/src/components/PermissionManager.tsx` (batch actions, expiry display), `frontend/src/components/RecordList.tsx` (filtering), `frontend/src/components/EmergencySessions.tsx` (filtering), `frontend/src/App.tsx` (toast integration)

- Change: M3.3 - Frontend emergency UIs
- Reason: Complete emergency access user interface for patients and doctors.
- Impact:
  - Requirements: FR-014a (self-access), FR-014b (trigger/OTP), FR-014c (retrieval), FR-014d (session consumption)
  - Tests: RM-T15 to RM-T18, EA-T01 to EA-T04, INT-T05
  - Docs: `TODO_AI.md`, `CHANGES.md`, `REQUIREMENTS_STATUS.md`
  - New files: `frontend/src/hooks/useEmergencyAccess.ts`, `frontend/src/components/EmergencyConfig.tsx`, `frontend/src/components/EmergencyTrigger.tsx`, `frontend/src/components/EmergencySessions.tsx`
  - Modified: `frontend/src/services/contracts.ts` (EmergencyAccess ABI), `frontend/src/App.tsx` (emergency UI integration)

- Change: M3.2 - Custodian emergency backend path
- Reason: Enable automated validation of emergency access requests against the Custodian provider registry.
- Impact:
  - Requirements: FR-005 (Custodian registry), FR-014b (OTP issuance gate), FR-014c (emergency retrieval)
  - Tests: EA-T02, EA-T03, API-T07, INT-T05
  - Docs: `TODO_AI.md`, `CHANGES.md`, `REQUIREMENTS_STATUS.md`, `.env.example`
  - New files: `backend/src/services/emergency.ts`, `backend/src/routes/emergency.ts`
  - Modified: `backend/src/server.ts` (emergency router, auto-init)

- Change: M2.3 - Doctor request + view shared records UI
- Reason: Enable doctor role to request access to patient records and view shared records.
- Impact:
  - Requirements: FR-011 (request access), FR-013 (view shared records), FR-016 (audit trail)
  - Tests: AC-T01 to AC-T06, AC-T12 to AC-T15, AC-T23 to AC-T25
  - Docs: `TODO_AI.md`, `CHANGES.md`, `REQUIREMENTS_STATUS.md`
  - New files: `frontend/src/hooks/useDoctorAccess.ts`, `frontend/src/hooks/useUserRole.ts`, `frontend/src/components/RequestAccess.tsx`, `frontend/src/components/SharedRecords.tsx`
  - Modified: `frontend/src/App.tsx` (role-based rendering), `frontend/src/components/Register.tsx` (onRegistered callback)

## 2026-03-12

- Change: Established canonical AI workflow docs (`AI_GUIDE.md`, `TODO_AI.md`) and task completion protocol.
- Reason: Standardize IDE+AI collaboration before implementation.
- Impact:
  - Requirements: None
  - Tests: None
  - Docs: `AI_GUIDE.md`, `TODO_AI.md`, `CHANGES.md`

- Change: Refined workflow docs with explicit script MUST definitions, stricter no-cross-layer task guardrails, and concrete M1 requirement/test ID mapping in TODO.
- Reason: Reduce agent ambiguity and improve traceability quality for implementation and dissertation reporting.
- Impact:
  - Requirements: FR-001, FR-005, FR-006, FR-007, FR-008, FR-014b, NFR-003
  - Tests: API-T01, API-T04, API-T05, API-T06, API-T07, UR-T01, UR-T09 to UR-T12, RM-T01 to RM-T07, RM-T19, RM-T20, AC-T02, AC-T09, EA-T01, EA-T02
  - Docs: `AI_GUIDE.md`, `TODO_AI.md`, `CHANGES.md`

- Change: Expanded TODO Milestone 2 and 3 tasks to full traceability format (requirement IDs, concrete test IDs, allowed file scopes, non-goals, verification scripts).
- Reason: Make remaining implementation phases as actionable and auditable as Milestone 1 before coding starts.
- Impact:
  - Requirements: FR-005, FR-010, FR-011, FR-012, FR-013, FR-014a, FR-014b, FR-014c, FR-014d, FR-016, NFR-003, NFR-004
  - Tests: AC-T01 to AC-T25, EA-T01 to EA-T04, RM-T15 to RM-T18, API-T07, INT-T01, INT-T02, INT-T03, INT-T05, INT-T09
  - Docs: `TODO_AI.md`, `CHANGES.md`

- Change: Added minimal-context prompting rule, 3-failure verification stop rule, and git checkpoint step in session checklist.
- Reason: Improve token efficiency, prevent AI retry loops, and preserve stable progress checkpoints between tasks.
- Impact:
  - Requirements: None
  - Tests: None
  - Docs: `AI_GUIDE.md`, `SESSION_CHECKLIST.md`, `CHANGES.md`

- Change: Locked MVP execution decisions and aligned workflow docs to supervisor-guided model (core Custodian+OTP emergency, vertical-slice sequencing, canonical terminology).
- Reason: Remove planning ambiguity and enforce a consistent execution path before heavy implementation.
- Impact:
  - Requirements: FR-001, FR-003, FR-005, FR-006, FR-007, FR-008, FR-011, FR-012, FR-014a, FR-014b, FR-014c, FR-014d, FR-015, FR-016
  - Tests: UR-T01 to UR-T12, RM-T01 to RM-T07, RM-T15 to RM-T21, AC-T01 to AC-T25, EA-T01 to EA-T04, INT-T01 to INT-T05, INT-T09, API-T01, API-T04 to API-T07, SEC-T03, SEC-T09, SEC-T10
  - Docs: `ARCHITECTURE_DECISIONS.md`, `AI_GUIDE.md`, `TODO_AI.md`, `REQUIREMENTS_STATUS.md`, `CANONICAL_TERMS.md`, `CHANGES.md`

## 2026-03-12 (Implementation Session)

- Change: Completed M1.1 — initialized git, created project scaffold (root `package.json`, `hardhat.config.ts`, `.gitignore`, `.env.example`, `backend/` and `frontend/` directory structures with `package.json` and `tsconfig.json` each).
- Reason: Establish runnable project baseline per vertical-slice execution plan.
- Impact:
  - Requirements: FR-001
  - Tests: None (scaffold only; test infrastructure now runnable via `npm run test:contracts`)
  - Docs: `CHANGES.md`

- Change: Completed M1.2a — implemented `UserRegistry.sol` with custom Ownable + Pausable, patient/doctor registration, admin verify/reject, public key management. Created `IUserRegistry.sol` interface. 32 unit tests passing.
- Reason: User/role baseline is required before sharing and emergency flows.
- Impact:
  - Requirements: FR-003, FR-005 (partial — on-chain doctor verification done, IPFS custodian registry pending M1.2)
  - Tests: UR-T01 to UR-T12 equivalent coverage (32 tests in `test/UserRegistry.test.ts`)
  - Docs: `CHANGES.md`

- Change: Completed M1.3 (partial) — implemented `RecordManager.sol` with record lifecycle (add/archive/restore/delete), emergency flag, encrypted key storage. Created `IRecordManager.sol` interface. 29 unit tests passing. Built backend IPFS service (`backend/src/services/ipfs.ts`) and record upload/fetch/unpin routes (`backend/src/routes/records.ts`). Built frontend upload flow with client-side AES-256-GCM encryption (`frontend/src/utils/encryption.ts`), wallet hook, contract service, and UI components (WalletConnect, UploadRecord, RecordList).
- Reason: First full vertical slice — encrypt in browser, pin to IPFS, store CID on-chain, retrieve and display.
- Impact:
  - Requirements: FR-006, FR-007, FR-008, FR-014a (emergency flag in RecordManager)
  - Tests: RM-T01 to RM-T07, RM-T15 to RM-T18 equivalent coverage (29 tests in `test/RecordManager.test.ts`)
  - Docs: `CHANGES.md`

- Change: Cleaned up 12 stale PDF exports. Kept `.md` files as single source of truth.
- Reason: PDFs were static snapshots that would immediately diverge from evolving markdown docs.
- Impact:
  - Requirements: None
  - Tests: None
  - Docs: Removed 12 `.pdf` files

- Change: Synced tracking docs to reflect M1.1, M1.2a, M1.3 implementation. Marked TODO tasks as complete with mandatory footers. Updated requirement statuses (FR-001 implemented, FR-003 validated, FR-005 in_progress, FR-006 validated, FR-007 implemented, FR-008 implemented, FR-014a in_progress). Updated roll-up table.
- Reason: Post-session documentation per `SESSION_CHECKLIST.md` protocol.
- Impact:
  - Requirements: FR-001, FR-003, FR-005, FR-006, FR-007, FR-008, FR-014a
  - Tests: None
  - Docs: `TODO_AI.md`, `REQUIREMENTS_STATUS.md`, `CHANGES.md`

- Change: Fixed local deployment network config by defining `localhost` as `http://127.0.0.1:8545` in `hardhat.config.ts` to avoid IPv6 resolution (`::1`) failures on Windows.
- Reason: `npm run deploy:local` failed with `ECONNREFUSED ::1:8545` while `hardhat node` was running on IPv4.
- Impact:
  - Requirements: None
  - Tests: None
  - Docs: `CHANGES.md`

## 2026-03-18

- Change: Refactored UserRegistry.sol per supervisor guidance - removed admin verification model and simplified doctor registration.
- Reason: Supervisor feedback specified ESY (National Health System) as Custodian maintains off-chain registry. On-chain admin verification conflicts with Custodian model. Doctor verification now handled off-chain for emergency access scenarios.
- Impact:
  - Requirements: FR-003, FR-005
  - Tests: Removed UR-T09 to UR-T12 (admin verification tests). Updated test/RecordManager.test.ts fixture. Total: 52 tests passing (23 UR + 29 RM).
  - Docs: `REQUIREMENTS_STATUS.md`, `TODO_AI.md`, `CHANGES.md`
  - Contracts: `contracts/UserRegistry.sol`, `contracts/interfaces/IUserRegistry.sol`
  - **Breaking Changes**: Removed `verifyDoctor()`, `rejectDoctor()`, `getPendingDoctors()`, `DoctorStatus` enum, `_pendingDoctors` array, related events. `isDoctorVerified()` now returns true for any registered doctor.
  - **Architecture**: Doctor registration is now trustless on-chain. Detailed verification for emergency access checks Custodian registry off-chain (M1.2 pending).

- Change: Created automated startup scripts for development environment.
- Reason: Simplify development workflow by automating multi-service startup (Hardhat node, contract deployment, backend, frontend).
- Impact:
  - Files: `start-dev.bat`, `scripts/start-dev.js`, `STARTUP.md`
  - Scripts: `npm run start:dev` (batch), `npm run start:all` (Node.js)
  - Features: Auto-detects running Hardhat node, deploys contracts, starts all services, opens browser

- Change: Improved startup scripts to only kill processes on port 8545 instead of all Node processes.
- Reason: Previous implementation killed the terminal running the script. Now only targets Hardhat node specifically via port cleanup.
- Impact:
  - Files: `start-dev.bat`, `scripts/start-dev.js`
  - Features: Surgical cleanup - only frees port 8545, preserves other Node processes

- Change: Fixed "Maximum call stack size exceeded" error when uploading large files (PDFs).
- Reason: The code `String.fromCharCode(...packaged)` spread large arrays into function arguments causing stack overflow. Fixed by processing in chunks.
- Impact:
  - Files: `frontend/src/utils/encryption.ts`, `frontend/src/components/UploadRecord.tsx`
  - Features: Added `toBase64()` helper that processes data in 8KB chunks, supports large file uploads

- Change: Added comprehensive debug logging and visibility for upload process.
- Reason: User wanted to see the entire encryption, IPFS upload, and blockchain storage procedure.
- Impact:
  - Files: `frontend/src/components/UploadRecord.tsx`, `backend/src/routes/records.ts`
  - Features: 
    - Debug panel with "Show Debug" button in UI
    - Console logging at each step (file reading, encryption, IPFS upload, blockchain storage)
    - Visual display of: file sizes, IPFS CID, transaction hash, content hash
    - Direct links to IPFS gateway and Pinata dashboard
    - Backend logging showing base64 decoding and IPFS pinning

- Change: Added registration UI component to enable patient/doctor registration from frontend.
- Reason: Frontend was missing registration UI - users could not register as patient before uploading records. This blocked the upload flow.
- Impact:
  - Requirements: FR-001 (patient registration), FR-003 (role assignment), FR-004 (wallet identity)
  - Tests: None (frontend UI component)
  - Files: `frontend/src/components/Register.tsx` (new), `frontend/src/App.tsx` (updated)
  - Features: Patient/Doctor registration buttons, role selection, MetaMask transaction integration

## 2026-04-23

- Change: Completed M2.1 — implemented `AccessControl.sol` with consent-based access management. Created `IAccessControl.sol` interface. 37 unit tests passing for AccessControl (89 total project tests).
- Reason: Enables doctors to request access and patients to grant/revoke/approve/reject, completing the sharing flow required for the MVP.
- Impact:
  - Requirements: FR-011 (access requests), FR-012 (grant/revoke), FR-013 (view shared), FR-016 (audit trail)
  - Tests: AC-T01 to AC-T10 equivalent coverage (37 tests in `test/AccessControl.test.ts`)
  - Docs: `CHANGES.md`, `TODO_AI.md`, `REQUIREMENTS_STATUS.md`
  - Contracts: `contracts/AccessControl.sol`, `contracts/interfaces/IAccessControl.sol`
  - Features:
    - Doctor access request with reason
    - Patient approve/reject request workflow
    - Direct patient-to-doctor grant
    - Single/batch/all revocation
    - Lazy expiry checking (no cron)
    - Encrypted key storage via RecordManager
    - Audit trail via events (RecordAccessed)

- Change: Fixed syntax error in `RecordManager.sol` `onlyAuthorised` modifier (missing comma before error message).
- Reason: Contract would not compile due to malformed require statement.
- Impact:
  - Files: `contracts/RecordManager.sol`

- Change: Completed M3.1 — implemented `EmergencyAccess.sol` with OTP-style emergency access mechanism. Created `IEmergencyAccess.sol` interface. 31 unit tests passing for EmergencyAccess (120 total project tests).
- Reason: Enables verified doctors to access emergency-flagged records when patient is incapacitated, completing the emergency flow required for the MVP.
- Impact:
  - Requirements: FR-014b (emergency trigger), FR-014c (emergency retrieval), FR-014d (session consumption)
  - Tests: EA-T01 to EA-T07 equivalent coverage (31 tests in `test/EmergencyAccess.test.ts`)
  - Docs: `CHANGES.md`, `TODO_AI.md`, `REQUIREMENTS_STATUS.md`
  - Contracts: `contracts/EmergencyAccess.sol`, `contracts/interfaces/IEmergencyAccess.sol`
  - Features:
    - Patient configures trusted contacts and session duration
    - Patient pre-stores encrypted keys for emergency records
    - Trusted contact triggers emergency session
    - Time-limited sessions (1-72 hours, default 24)
    - Patient can revoke active sessions upon recovery
    - Full audit trail via events
    - Session tracking per patient

- Change: Updated deploy script to deploy all four core contracts (UserRegistry, RecordManager, AccessControl, EmergencyAccess) with proper post-deployment configuration.
- Reason: Full deployment pipeline needed for testing and demonstration.
- Impact:
  - Files: `scripts/deploy.ts`
  - Features: Deploys all contracts in dependency order, configures RecordManager authorized callers

## 2026-04-25

- Change: **BREAKING** Refactored `EmergencyAccess.sol` to follow ADR-002 Custodian registry + OTP model.
- Reason: Original implementation used patient-configured trusted contacts, which deviated from ADR-002 specification that "requester wallet must be validated against the Custodian provider registry". The correct model allows ANY verified doctor to trigger emergency access, with Custodian backend validating against off-chain provider registry before issuing OTP.
- Impact:
  - Requirements: FR-014b, FR-014c, FR-014d (now correctly aligned with ADR-002)
  - Tests: 38 tests in `test/EmergencyAccess.test.ts` (127 total project tests)
  - Contracts: `contracts/EmergencyAccess.sol`, `contracts/interfaces/IEmergencyAccess.sol`
  - **Breaking Changes**:
    - Removed: `configureEmergencyAccess()`, `updateEmergencyContacts()`, `storeEmergencyKeys()`, `EmergencyConfig` struct, trusted contacts model
    - Added: `issueEmergencyOTP()` (Custodian only), `rejectEmergencyRequest()` (Custodian only), `consumeEmergencyOTP()`, `logEmergencyRecordAccess()`
    - Changed: Session states now include `Pending` (awaiting Custodian), `Active` (OTP issued), `Consumed` (OTP retrieved)
  - **New Flow**:
    1. Any verified doctor calls `triggerEmergencyAccess()` → creates PENDING session
    2. Custodian backend listens for `EmergencyAccessTriggered` event
    3. Custodian validates doctor against off-chain provider registry (IPFS)
    4. If valid: Custodian calls `issueEmergencyOTP()` with encrypted OTP
    5. Doctor calls `consumeEmergencyOTP()` → gets OTP + record IDs (single-use)
    6. Doctor decrypts records, logs access via `logEmergencyRecordAccess()`
    7. Patient can revoke session at any time
  - **Architecture Alignment**: Now correctly implements ADR-002 where Custodian (ESY/National Health System) controls which healthcare institutions can access emergency data, rather than requiring patient pre-configuration

- Change: Enhanced `EmergencyAccess.sol` with **hybrid model** combining both trusted contacts and Custodian registry paths.
- Reason: While ADR-002 Custodian model handles real emergencies (unknown providers), user identified merit in allowing patients to pre-authorize trusted contacts (family doctor, family members) for faster access. Hybrid provides both: immediate access for trusted contacts, validated access for unknown providers.
- Impact:
  - Requirements: FR-014b, FR-014c, FR-014d (enhanced with patient autonomy)
  - Tests: 37 tests in `test/EmergencyAccess.test.ts` (124 total project tests)
  - Contracts: `contracts/EmergencyAccess.sol`, `contracts/interfaces/IEmergencyAccess.sol`
  - Docs: `CHANGES.md`, `ARCHITECTURE_DECISIONS.md` (ADR-002 updated)
  - **Hybrid Model**:
    - **Path 1 - Trusted Contacts**: Patient optionally configures trusted contacts (ANY registered user, not just doctors - patient autonomy). Patient pre-stores encrypted keys. Trusted contact triggers → immediate Active session. No Custodian validation needed.
    - **Path 2 - Custodian Registry**: Any verified doctor can trigger. Creates Pending session. Custodian validates against provider registry. Issues OTP if valid. Covers true emergencies with unknown providers.
  - **Key Design Decision**: Trusted contacts do NOT need to be verified doctors. If patient trusts their spouse or family member with their health data, that's their autonomous choice. Contact only needs to be a registered user (has public key for encryption).
  - **Session States**: Pending (awaiting Custodian) → Active (ready) → Consumed (keys retrieved) → Expired/Revoked
  - **TriggerType enum**: Distinguishes TrustedContact (immediate) vs CustodianRegistry (validated)

## 2026-04-30

- Change: Added comprehensive edge-case test coverage across contracts and frontend encryption utilities.
- Reason: Strengthen correctness guarantees around expiry handling, revocation integrity, authorization boundaries, and cryptographic tamper resistance for dissertation-grade validation.
- Impact:
  - Requirements: FR-011, FR-012, FR-014b, FR-014c, FR-014d, FR-016, NFR-008, NFR-009
  - Tests:
    - Contract tests expanded to 144 passing total (`npm run test:contracts`)
    - Frontend encryption tests added with 7 passing (`npm run test --prefix frontend -- --run`)
    - New suites added in:
      - `test/AccessControl.test.ts` (`Expiry, Revocation, and Edge Cases`)
      - `test/EmergencyAccess.test.ts` (`Emergency Access Edge Cases`)
      - `test/RecordManager.test.ts` (`Authorization and Pause Edge Cases`)
      - `test/UserRegistry.test.ts` (`Pause Edge Cases`)
      - `frontend/src/utils/encryption.test.ts`
  - Contracts:
    - `contracts/AccessControl.sol` hardened with:
      - request expiry enforcement in `approveAccess` (`AccessControl: request expired`)
      - revalidation of record ownership/active status during approval
      - active-record check in `checkAccess` (denies archived/deleted records)
  - Docs: `CHANGES.md`, `TODO_AI.md`, `REQUIREMENTS_STATUS.md`

- Change: Completed M1.2 — added demonstration-grade Custodian provider registry, backend lookup/validation service, IPFS pinning script, debug verification routes, and focused registry checks.
- Reason: Align implementation with supervisor-guided Custodian model where provider authenticity is controlled off-chain and can be content-addressed through IPFS.
- Impact:
  - Requirements: FR-005, FR-014b
  - Tests:
    - `npm run check:custodian` validates active, suspended, missing, and malformed provider wallet cases.
    - `npm run pin:custodian` validates registry shape and pins to IPFS when Pinata credentials are configured.
    - Existing contract suite remains the regression baseline via `npm run test:contracts`.
  - Docs: `CHANGES.md`, `TODO_AI.md`, `REQUIREMENTS_STATUS.md`
  - Files:
    - `custodian/providers.json`
    - `backend/src/services/custodian.ts`
    - `backend/src/routes/custodian.ts`
    - `scripts/pin-custodian.js`
    - `scripts/check-custodian.js`
    - `custodian/registry-meta.json`
  - API:
    - `GET /api/custodian/providers`
    - `GET /api/custodian/providers/:wallet/verify`
  - IPFS: Registry pinned as `QmVmL1TyDYryDfdQUT6gvo967vaqnqphwAPNu8xxRt7xhu`

- Change: Completed M1.4 — added E2E upload proof test suite validating full vertical slice (encrypt → IPFS → chain).
- Reason: Prove interconnection between client-side encryption, IPFS storage, and on-chain record management for dissertation traceability.
- Impact:
  - Requirements: FR-006, FR-007, FR-008
  - Tests:
    - 7 new E2E tests in `test/e2e-upload.test.ts`
    - Total project tests: 151 passing (`npm run test:contracts`)
    - Traceability: RM-T01, RM-T03, RM-T19, API-T04, API-T05
  - Docs: `CHANGES.md`, `TODO_AI.md`, `REQUIREMENTS_STATUS.md`
  - Milestone 1 is now complete (M1.1, M1.2a, M1.2, M1.3, M1.4 all done)

- Change: Hardened Custodian validation by enforcing strict encryption public key format and removing duplicated check logic from standalone script.
- Reason: Address validation robustness gap and prevent drift between demo checks and backend runtime behavior.
- Impact:
  - Requirements: FR-005, FR-014b
  - Tests:
    - `npm run check:custodian` now runs backend service-based checks via `backend/src/scripts/check-custodian.ts`.
    - Active/suspended/missing/malformed wallet checks continue to pass against the real service implementation.
  - Files:
    - `backend/src/services/custodian.ts` (`encryptionPublicKey` regex validation: `^0x[a-fA-F0-9]{64}$`)
    - `backend/src/scripts/check-custodian.ts` (new)
    - `scripts/check-custodian.js` (removed)
    - `package.json` (`check:custodian` script updated)
  - Docs: `CHANGES.md`, `TODO_AI.md`

## 2026-05-05

- Change: Completed M2.2 — implemented patient grant/revoke UI for access permission management.
- Reason: Enable patients to manage doctor access to their health records through a user-friendly interface, satisfying consent-based access control requirements.
- Impact:
  - Requirements: FR-011, FR-012, FR-013, FR-015
  - Tests:
    - Frontend type-check and build clean (`npx tsc --noEmit`, `npx vite build`)
    - Contract regression suite remains green (151 tests passing)
  - Files:
    - `frontend/src/services/contracts.ts` (added AccessControl ABI and getAccessControlContract)
    - `frontend/src/hooks/usePermissions.ts` (new hook for permission management)
    - `frontend/src/hooks/useRecords.ts` (new hook for record loading)
    - `frontend/src/components/PermissionManager.tsx` (new component)
    - `frontend/src/components/GrantAccess.tsx` (new component)
    - `frontend/src/App.tsx` (integrated new components)
  - Features:
    - View pending access requests from doctors
    - Approve or reject access requests
    - View all active permissions by record
    - Revoke access from specific doctors
    - Direct access grant to verified doctors with configurable expiry
  - Docs: `CHANGES.md`, `TODO_AI.md`, `REQUIREMENTS_STATUS.md`
