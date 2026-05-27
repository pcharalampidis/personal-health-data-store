# Current Implementation Baseline

Baseline date: 2026-05-27  
Last validated commit: `1c97970`

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
| Wallet connection | MetaMask, role detection |
| Registration | Patient/doctor with RSA-OAEP 2048-bit keypair generation |
| Upload | AES-256-GCM encryption, RSA key wrapping, IPFS pin, on-chain reference |
| Record list | Metadata display with filters (type, status, emergency) |
| Grant/revoke access | Unwrap patient key → re-wrap for doctor, permission management |
| Doctor shared records | Decrypt & download with doctor RSA private key |
| Emergency config | Trusted contacts, emergency flag toggle, key sync for contacts + Custodian |
| Emergency trigger | Doctor triggers session (trusted or Custodian path) |
| Emergency sessions | Session management, Custodian package parsing, decrypt/download |

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

## Remaining Gaps (Post-M4)

| Gap | Target |
|---|---|
| Visual app shell / navigation | M5 (sidebar desktop, bottom nav mobile) |
| Action semantics / disclosure wording | Track B (AS-1 to AS-8) |
| Privacy/Security info page | AS-8 |
| Activity/audit timeline page | M5 or stretch |
| Paused contract UX | Not yet surfaced to user |

---

## Known Limitations (Documented, Not Bugs)

1. RSA private keys in localStorage — vulnerable to XSS (MVP trade-off)
2. No key rotation mechanism
3. Revocation prevents future app-mediated access but cannot erase downloaded copies
4. IPFS unpinning ≠ guaranteed deletion (content may persist if pinned elsewhere)
5. Blockchain history is immutable — "delete" removes app reference only
6. Custodian backend is trusted in emergency model (intentional design)
7. No offline/service-worker support
8. Single-browser limitation for key access
