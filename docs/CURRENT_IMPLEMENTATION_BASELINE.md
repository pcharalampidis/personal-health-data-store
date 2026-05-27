# Current Implementation Baseline

Baseline date: 2026-05-27  
Last validated commit: `43160bf`

## Purpose

This document freezes the implementation truth as of the above date. Older documentation that describes mock or placeholder key wrapping is superseded — RSA-OAEP key wrapping is now implemented across upload, grant/approval, doctor retrieval, and emergency paths.

---

## Implemented (Functional)

### Smart Contracts (Solidity 0.8.19, Hardhat 3)

| Contract | Key Capabilities |
|---|---|
| UserRegistry | Patient/doctor registration, RSA public key storage (hex JWK), role queries |
| RecordManager | addRecord, archiveRecord, deleteRecord, restoreRecord, setEmergencyFlag, per-user encrypted key storage, getEmergencyRecords |
| AccessControl | Doctor request → patient approve/reject, direct grant, revoke (single/batch/all), expiry, checkAccess, logAccess, audit events |
| EmergencyAccess | Hybrid model: trusted contacts (immediate) + Custodian registry (pending→validated). Session lifecycle, emergency key storage, custodian key re-wrapping storage |

All contracts: 151 tests passing.

### Backend (Express + TypeScript)

| Module | Capabilities |
|---|---|
| IPFS/Pinata | Upload (pin), fetch, unpin encrypted content |
| Custodian service | Load provider registry, validate wallets, return metadata |
| Emergency service | Auto-process pending sessions, validate against registry, issue OTP/reject, event listener |
| Custodian key endpoint | Serve Custodian RSA public key for emergency re-wrapping |

### Frontend (React + Vite + ethers.js)

| Area | Status |
|---|---|
| Wallet connection | MetaMask, role detection, change wallet support |
| Registration | Patient/doctor with RSA-OAEP 2048-bit keypair generation |
| Upload | PHDS2 packaging, AES-256-GCM, RSA key wrapping, stepper UX, file validation |
| Record list | Cards with View/Archive/Restore/Emergency toggle/Remove from vault actions |
| Record viewer | Unified RecordViewer: PDF/image/JSON preview, integrity badge, decrypt states |
| Grant/revoke access | Unwrap patient key → re-wrap for doctor, ConfirmModal on revoke |
| Doctor shared records | RecordViewer in doctor mode, access logged after decrypt |
| Emergency config | Trusted contacts, emergency flag toggle, prepare emergency keys |
| Emergency trigger | "Request emergency access" with ConfirmModal, serious wording |
| Emergency sessions | "Open emergency session", RecordViewer integration, "End session" with ConfirmModal |
| App shell | Desktop sidebar + mobile bottom nav, role-based pages |
| Patient pages | Records, Access, Emergency, Settings |
| Doctor pages | Shared, Request, Emergency, Settings |
| Settings | Account info, local key status (green/amber), Privacy & Security info |
| Error handling | Friendly error messages (no raw ethers errors), change wallet button |
| Action semantics | Plain language, confirmations, TechnicalDetails collapsed |

### Cryptography

- AES-256-GCM for file encryption (Web Crypto API)
- RSA-OAEP 2048-bit SHA-256 for key wrapping (Web Crypto API)
- RSA keypair generated at registration, public key stored on-chain as hex JWK
- Private key stored in browser localStorage (MVP limitation)
- Custodian holds its own RSA keypair for emergency re-wrapping (Node webcrypto)

---

## Resolved in Milestone 4 (commit `1c97970`)

| Gap | Resolution |
|---|---|
| Patient self-view | RecordViewer integrated into RecordList (owner mode) |
| Duplicated decrypt logic | SharedRecords + EmergencySessions now use RecordViewer |
| No unified viewer | RecordViewer.tsx with PDF/image/JSON preview |
| Upload UX | PHDS2 packaging, file validation, stepper, no debug wording |
| File metadata | PHDS2 format preserves filename/MIME inside encrypted payload |
| Hash verification | Surfaced as integrity badge in RecordViewer; mismatch blocks retrieval |
| Trusted-contact retrieval | Uses getEmergencyRecords + getEmergencyKey after consume |
| Frontend ABI gaps | Added restoreRecord, getEmergencyRecords |
| Access logging timing | Fires only after successful decrypt via onAccessLogged |

---

## Resolved in Track B + M5 + Final Polish (commits `56d9571` → `43160bf`)

| Gap | Resolution |
|---|---|
| Visual app shell / navigation | Desktop sidebar + mobile bottom nav (M5.2) |
| Action semantics / disclosure wording | USER_ACTION_SEMANTICS.md + all components updated (Track B) |
| Privacy/Security info page | PrivacySecurityInfo.tsx with 7 expandable sections (AS-8) |
| Raw wallet errors | errorMessages.ts + friendlyErrorMessage() (FP-8a) |
| No change wallet option | changeWallet() in useWallet hook (FP-8a) |
| Upload form always visible | Collapsed behind "Upload record" button (FP-2) |
| Delete record not exposed | "Remove from vault" button: unpin + deleteRecord + warning (FP-8b) |
| App shell in App.tsx | Extracted AppShell/Sidebar/MobileBottomNav components (FP-3) |
| Settings minimal | Account info, local key status card, privacy info (FP-4) |

---

## Remaining Gaps (Known Limitations, Not Bugs)

| Gap | Notes |
|---|---|
| Activity/audit timeline page | Contract events exist; no UI timeline yet |
| Paused contract UX | Contracts have pause; no user-facing maintenance banner |
| Key backup/export | localStorage only; no backup mechanism (MVP trade-off) |

---

## Known Limitations (Documented)

1. RSA private keys in localStorage — vulnerable to XSS (MVP trade-off)
2. No key rotation mechanism
3. Revocation prevents future app-mediated access but cannot erase downloaded copies
4. IPFS unpinning ≠ guaranteed deletion (content may persist if pinned elsewhere)
5. Blockchain history is immutable — "delete" removes app reference only
6. Custodian backend is trusted in emergency model (intentional design)
7. No offline/service-worker support
8. Single-browser limitation for key access
