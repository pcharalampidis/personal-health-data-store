# Current Implementation Baseline

Baseline date: 2026-05-27  
Last validated commit: `bbce73c95b587d08071800395492ea84933de198`

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

## Known UX/Retrieval Gaps (Milestone 4 Targets)

| Gap | Description |
|---|---|
| Patient self-view | RecordList shows metadata only; no decrypt/view/download for patient's own records |
| Duplicated decrypt logic | SharedRecords.tsx and EmergencySessions.tsx each implement their own decrypt/download |
| No unified viewer | No reusable RecordViewer component across owner/doctor/emergency contexts |
| Upload UX | Debug panel, raw CIDs, console-oriented messages still visible |
| File metadata | No preserved filename/MIME type after decryption (raw bytes only) |
| Hash verification | Not surfaced in UI during retrieval |
| Trusted-contact retrieval | Incomplete — getEmergencyKey path not fully wired in frontend |
| Frontend ABI gaps | Missing: restoreRecord, getEmergencyRecords, getContentHash |
| Access logging timing | Currently logs on metadata view, should log after successful decrypt only |

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
