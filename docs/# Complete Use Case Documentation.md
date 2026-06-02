# Complete Use Case Documentation

## Use Case Diagram (Description)

Before the detailed write-ups, here's how your actors and use cases map out:

```
ACTORS:
─────────────────────────────────────
│ Patient        │ Primary actor — owns and manages health data
│ Doctor         │ Healthcare provider — views shared data
│ Custodian      │ Health authority — maintains provider registry & gatekeeps emergencies
│ Smart Contract │ System actor — enforces rules autonomously
│ IPFS           │ System actor — stores encrypted files
│ Blockchain     │ System actor — stores permissions & logs
─────────────────────────────────────
```

```
USE CASE MAP:
─────────────────────────────────────────────────
          PATIENT                    DOCTOR
       ┌──────────┐              ┌──────────┐
       │          │              │          │
       ▼          ▼              ▼          ▼
   UC-001     UC-003          UC-001     UC-012
   Connect    Upload          Connect    View Shared
   Wallet     Record          Wallet     Records
       │          │              │          │
       ▼          ▼              ▼          ▼
   UC-002     UC-004          UC-011     UC-013
   Register   View Own        Register   Request
   Profile    Records         as Doctor  Access
       │          │                        │
       ▼          ▼                        ▼
   UC-005     UC-006                   UC-014
   Grant      Revoke                   Emergency
   Access     Access                   Access
       │          │
       ▼          ▼                    CUSTODIAN
   UC-007     UC-008              ┌──────────┐
   Time-Ltd   Archive             │          │
   Access     Record              ▼          
       │                       UC-015
       ▼                       Validate
   UC-009                      Provider
   View Audit
   Trail
       │
       ▼
   UC-010
   Manage Emergency
   Settings
─────────────────────────────────────────────────
```

---

## Use Case Template

Every use case below follows this structure:

| Field | Purpose |
|---|---|
| **Use Case ID** | Unique identifier linked to requirements |
| **Name** | Short descriptive name |
| **Actor(s)** | Who initiates and participates |
| **Description** | One-paragraph summary |
| **Preconditions** | What must be true BEFORE this use case begins |
| **Postconditions** | What is true AFTER successful completion |
| **Trigger** | What event initiates this use case |
| **Main Success Scenario** | Step-by-step happy path |
| **Alternative Flows** | Variations that still succeed |
| **Exception Flows** | What happens when things go wrong |
| **Business Rules** | Constraints and logic rules |
| **Related Requirements** | Traceability back to FR/NFR |
| **Assumptions** | What you're taking for granted |
| **Notes** | Implementation hints, dissertation discussion points |

---

---

# UC-001: Connect Wallet

| Field | Detail |
|---|---|
| **Use Case ID** | UC-001 |
| **Name** | Connect Wallet |
| **Actor(s)** | Patient OR Doctor (any user) |
| **Description** | A user connects their Ethereum-compatible wallet to the application to authenticate and establish a session. The wallet serves as the sole identity and authentication mechanism — no username or password is needed |
| **Preconditions** | 1. User has a compatible browser. 2. User has MetaMask (or EIP-1193 compatible wallet) installed. 3. User has an Ethereum account with a key pair |
| **Postconditions** | 1. User's public address is captured by the application. 2. A session is established. 3. The UI reflects the connected state showing a truncated wallet address. 4. If user is returning, their role and profile are loaded |
| **Trigger** | User clicks the "Connect Wallet" button on the landing page |

### Main Success Scenario

| Step | Actor | System |
|---|---|---|
| 1 | User navigates to the application landing page | Application loads with "Connect Wallet" button prominently displayed |
| 2 | User clicks "Connect Wallet" | Application calls `window.ethereum.request({ method: 'eth_requestAccounts' })` |
| 3 | | MetaMask popup appears requesting connection approval |
| 4 | User reviews the connection request and clicks "Connect" in MetaMask | |
| 5 | | Application receives the user's public address |
| 6 | | Application sends a challenge message (nonce) for the user to sign, to verify ownership of the address |
| 7 | | MetaMask prompts user to sign the message |
| 8 | User reviews and signs the message | |
| 9 | | Application verifies the signature server-side, confirming the user controls this address |
| 10 | | Application queries the smart contract to check if this address is registered and what role it holds |
| 11a | | **If registered**: Load user profile and role → redirect to appropriate dashboard (patient or doctor) |
| 11b | | **If not registered**: Redirect to registration flow (UC-002 or UC-011) |
| 12 | | Display connected state: truncated address, network indicator, role badge |

### Alternative Flows

| ID | Condition | Flow |
|---|---|---|
| AF-001a | User has multiple accounts in MetaMask | MetaMask shows account selector → user picks one → flow continues from step 5 |
| AF-001b | User is already connected from a previous session | Application detects existing connection → skips to step 6 (signature challenge) to re-verify → loads dashboard |
| AF-001c | User is on the wrong network (e.g., mainnet instead of Sepolia) | Application detects chain ID mismatch → prompts user to switch network → calls `wallet_switchEthereumChain` → if user approves, flow continues |

### Exception Flows

| ID | Condition | Flow |
|---|---|---|
| EF-001a | MetaMask is not installed | Application detects `window.ethereum` is undefined → displays message: "No wallet detected. Please install MetaMask to continue." → provides link to MetaMask download |
| EF-001b | User rejects the connection request | MetaMask returns rejection error → application displays: "Connection was declined. You need to connect your wallet to use this application." → returns to landing page |
| EF-001c | User rejects the signature request | Signature returns null/error → application displays: "Signature required for verification. Please try again." → returns to step 6 |
| EF-001d | Network error / blockchain node unresponsive | Application cannot query contract → displays: "Network error. Please check your connection and try again." → offers retry button |
| EF-001e | Signature verification fails server-side | Recovered address doesn't match claimed address → session is NOT created → display: "Verification failed. Please try again." |

### Business Rules

- BR-001: Only one active session per browser instance
- BR-002: Session expires after 30 minutes of inactivity (configurable)
- BR-003: Switching accounts in MetaMask must trigger a re-authentication flow
- BR-004: The application must listen to the `accountsChanged` and `chainChanged` MetaMask events

### Related Requirements
FR-001, NFR-006, NFR-013, NFR-014

---

---

# UC-002: Register as Patient

| Field | Detail |
|---|---|
| **Use Case ID** | UC-002 |
| **Name** | Register as Patient |
| **Actor(s)** | Patient |
| **Description** | A new user with a connected wallet registers as a patient by providing basic profile information. Their wallet address is mapped to the patient role on the smart contract |
| **Preconditions** | 1. Wallet is connected (UC-001 completed). 2. Address is NOT already registered |
| **Postconditions** | 1. Wallet address is registered as "Patient" in the smart contract. 2. Profile data is encrypted and stored off-chain. 3. User is redirected to the patient dashboard |
| **Trigger** | System detects unregistered address after wallet connection |

### Main Success Scenario

| Step | Actor | System |
|---|---|---|
| 1 | | System displays the registration form with role selection |
| 2 | User selects "Patient" role | |
| 3 | User fills in profile information: full name, date of birth, contact email (optional), blood type (optional), known allergies (optional), emergency contact information (optional) | |
| 4 | User reviews entered information | |
| 5 | User clicks "Register" | |
| 6 | | Application validates all input fields client-side |
| 7 | | Application encrypts profile data using the patient's public key |
| 8 | | Application uploads encrypted profile to IPFS → receives IPFS hash |
| 9 | | Application calls smart contract `registerPatient(profileHash)` function |
| 10 | | MetaMask prompts user to confirm the transaction |
| 11 | User confirms the transaction and pays gas fee | |
| 12 | | Application shows "Transaction pending..." with loading indicator |
| 13 | | Transaction is confirmed on-chain |
| 14 | | Application displays success message: "Registration complete!" with transaction hash |
| 15 | | User is redirected to the patient dashboard |

### Alternative Flows

| ID | Condition | Flow |
|---|---|---|
| AF-002a | User wants to register as Doctor instead | User selects "Doctor" role → redirected to UC-011 (Register as Doctor) |
| AF-002b | User leaves optional fields blank | Validation passes (only required fields enforced) → flow continues from step 6 |

### Exception Flows

| ID | Condition | Flow |
|---|---|---|
| EF-002a | Client-side validation fails | Specific field errors highlighted (e.g., "Name is required") → user corrects → flow resumes from step 4 |
| EF-002b | IPFS upload fails | Application displays: "Failed to store profile data. Please try again." → offers retry → flow resumes from step 7 |
| EF-002c | Smart contract transaction fails | Application displays: "Registration failed: [reason]." → common reasons: insufficient gas, address already registered → user can retry |
| EF-002d | User rejects MetaMask transaction | Application displays: "Transaction was cancelled. Registration was not completed." → returns to form with data preserved |
| EF-002e | Address is already registered | Smart contract reverts with "already registered" → application displays: "This wallet is already registered." → redirects to dashboard |

### Business Rules

- BR-005: Each wallet address can only be registered once with one role
- BR-006: Minimum required fields: full name and role selection
- BR-007: Profile data is NEVER stored in plaintext anywhere except the user's browser during input
- BR-008: The registration transaction must emit a `PatientRegistered(address)` event for indexing

### Related Requirements
FR-003, FR-004, NFR-001, NFR-007, NFR-013

---

---

# UC-003: Upload Health Record

| Field | Detail |
|---|---|
| **Use Case ID** | UC-003 |
| **Name** | Upload Health Record |
| **Actor(s)** | Patient |
| **Description** | A patient uploads a health record file with associated metadata. The file is encrypted client-side, uploaded to IPFS, and a reference hash along with metadata is stored on the blockchain via smart contract |
| **Preconditions** | 1. Patient is authenticated (UC-001). 2. Patient is registered (UC-002). 3. Patient has a file to upload |
| **Postconditions** | 1. Encrypted file is stored on IPFS. 2. IPFS hash and metadata are recorded on the blockchain. 3. Record appears in the patient's dashboard. 4. Only the patient can decrypt the file at this point |
| **Trigger** | Patient clicks "Upload Record" in their dashboard |

### Main Success Scenario

| Step | Actor | System |
|---|---|---|
| 1 | Patient clicks "Upload Record" | Application displays the upload form |
| 2 | Patient selects a file from their device (PDF, image, FHIR JSON, etc.) | |
| 3 | | Application validates file type and size (max 10MB) |
| 4 | Patient fills in metadata: record type (dropdown: lab result, prescription, imaging, discharge summary, vaccination, allergy info, other), record date, healthcare provider name, description/notes | |
| 5 | Patient optionally tags the record as "Emergency Accessible" | |
| 6 | Patient reviews file and metadata | |
| 7 | Patient clicks "Upload & Encrypt" | |
| 8 | | **ENCRYPTION PHASE**: Application generates a unique AES-256 symmetric key for this specific record |
| 9 | | Application encrypts the file using the generated AES key (AES-256-GCM) |
| 10 | | Application encrypts the AES key using the patient's public key (ECIES/RSA) → this is the "wrapped key" |
| 11 | | **STORAGE PHASE**: Application uploads the encrypted file to IPFS via pinning service (Pinata) |
| 12 | | IPFS returns a Content Identifier (CID/hash) |
| 13 | | **BLOCKCHAIN PHASE**: Application calls smart contract `addRecord(ipfsHash, encryptedKeyHash, recordType, timestamp, metadataHash)` |
| 14 | | MetaMask prompts the patient to confirm the transaction |
| 15 | Patient confirms the transaction | |
| 16 | | Application shows "Uploading..." progress indicator with stages: Encrypting → Uploading to IPFS → Storing on blockchain → Confirming... |
| 17 | | Transaction is confirmed on-chain |
| 18 | | Smart contract emits `RecordAdded(owner, recordId, ipfsHash, timestamp)` event |
| 19 | | Application displays success: "Record uploaded successfully!" with record ID and transaction hash |
| 20 | | New record appears in the patient's record dashboard |

### Alternative Flows

| ID | Condition | Flow |
|---|---|---|
| AF-003a | Patient uploads a FHIR JSON document | System detects FHIR format → auto-fills some metadata from FHIR resource fields (resource type, date) → patient reviews and confirms |
| AF-003b | Patient wants to upload multiple files at once | System allows batch selection → each file goes through steps 8-18 individually → progress bar shows per-file status → summary shown at end |
| AF-003c | Patient marks record as "Emergency Accessible" | System stores an additional flag on-chain with this record → this record will be available through the emergency access mechanism (UC-010) |

### Exception Flows

| ID | Condition | Flow |
|---|---|---|
| EF-003a | File type not supported | Validation error: "Unsupported file type. Please upload PDF, JPG, PNG, or JSON files." → returns to step 2 |
| EF-003b | File exceeds size limit | Validation error: "File is too large. Maximum size is 10MB." → returns to step 2 |
| EF-003c | Encryption fails | Application displays: "Encryption error. Please try again." → logs error for debugging → returns to step 7 |
| EF-003d | IPFS upload fails | Application displays: "Storage service unavailable. Please try again later." → encrypted file is discarded → no on-chain transaction occurs |
| EF-003e | Blockchain transaction fails | Application displays: "Transaction failed: [reason]." → IPFS content is orphaned (discuss cleanup strategy) → user can retry |
| EF-003f | User rejects MetaMask transaction | Application displays: "Transaction cancelled." → IPFS content already uploaded becomes orphaned → no on-chain record exists → discuss in dissertation how to handle this (IPFS garbage collection / unpinning) |
| EF-003g | Network disconnection mid-upload | Application detects connection loss → pauses process → displays: "Connection lost. Please check your network." → offers retry from last successful stage |

### Business Rules

- BR-009: Every record MUST have a unique symmetric key. Keys MUST NOT be reused across records
- BR-010: The plaintext file MUST never leave the browser. Encryption happens in browser memory
- BR-011: The IPFS hash stored on-chain serves as an integrity check — the hash OF the encrypted content
- BR-012: Metadata stored on-chain should be minimal to reduce gas costs
- BR-013: The encrypted symmetric key ("wrapped key") must be stored so the patient can later share it with authorised doctors by re-wrapping it with the doctor's public key

### Related Requirements
FR-006, FR-007, NFR-001, NFR-002, NFR-003, NFR-007, NFR-010, NFR-012

### Dissertation Notes
> This is the most technically dense use case. Your sequence diagram for this flow will be one of the most important diagrams in your dissertation. Pay special attention to the encryption flow — examiners will scrutinise the key management. The per-record symmetric key approach is crucial: if you used one key for all records, sharing one record would expose all records.

---

---

# UC-004: View Own Health Records

| Field | Detail |
|---|---|
| **Use Case ID** | UC-004 |
| **Name** | View Own Health Records |
| **Actor(s)** | Patient |
| **Description** | A patient views their personal health records dashboard, browses their records list, and can open/decrypt individual records for viewing or download |
| **Preconditions** | 1. Patient is authenticated. 2. Patient has at least one uploaded record |
| **Postconditions** | 1. Patient has viewed their record listing. 2. If a specific record was opened, it was decrypted and displayed. 3. An access event MAY be logged (optional for self-access) |
| **Trigger** | Patient navigates to "My Records" section |

### Main Success Scenario

| Step | Actor | System |
|---|---|---|
| 1 | Patient clicks "My Records" in navigation | |
| 2 | | Application queries the smart contract for all record IDs owned by this address |
| 3 | | Application retrieves metadata for each record (type, date, description, provider, emergency flag) |
| 4 | | Application displays record list as cards or table rows showing metadata (WITHOUT decrypting actual files) |
| 5 | Patient browses the list, optionally filters by record type or date range | Application applies filters client-side or re-queries |
| 6 | Patient clicks on a specific record to view it | |
| 7 | | Application retrieves the encrypted file from IPFS using the stored CID |
| 8 | | Application retrieves the patient's wrapped key for this record |
| 9 | | Application decrypts the AES key using the patient's private key (via wallet interaction) |
| 10 | | Application decrypts the file using the recovered AES key |
| 11 | | Application displays the file in-browser (PDF viewer for PDFs, image viewer for images, formatted view for FHIR JSON) |
| 12 | Patient optionally clicks "Download" | Decrypted file is downloaded to patient's device |

### Alternative Flows

| ID | Condition | Flow |
|---|---|---|
| AF-004a | Patient has no records | System displays empty state: "No records found. Upload your first health record." with upload button |
| AF-004b | Patient uses search/filter | Results are filtered in real-time → if no matches, "No records match your filter" message |
| AF-004c | Record is archived | Archived records appear in a separate "Archived" tab, greyed out → can still be viewed but marked as inactive |

### Exception Flows

| ID | Condition | Flow |
|---|---|---|
| EF-004a | IPFS content is unavailable (unpinned/gateway error) | Application displays: "This record is temporarily unavailable. The storage service may be experiencing issues." → retry button |
| EF-004b | Decryption fails (key mismatch/corruption) | Application displays: "Unable to decrypt this record. The file may be corrupted." → log error |
| EF-004c | Smart contract query fails | Application displays: "Unable to load records. Please check your network connection." → retry |

### Business Rules

- BR-014: Metadata listing MUST be loadable without decrypting files (performance)
- BR-015: Actual file decryption only happens when a specific record is opened
- BR-016: Self-access does not require smart contract permission checks — ownership is sufficient

### Related Requirements
FR-008, FR-010, NFR-008, NFR-011, NFR-014

---

---

# UC-005: Grant Access to a Doctor

| Field | Detail |
|---|---|
| **Use Case ID** | UC-005 |
| **Name** | Grant Access to a Doctor |
| **Actor(s)** | Patient, Doctor (recipient), Smart Contract |
| **Description** | A patient grants a registered doctor permission to view one or more of their health records. This involves recording the permission on the blockchain AND securely sharing the decryption key so the doctor can actually read the data |
| **Preconditions** | 1. Patient is authenticated. 2. Patient has at least one uploaded record. 3. The target doctor has a registered profile on-chain (UC-011). 4. Patient knows the doctor's wallet address or can find them |
| **Postconditions** | 1. Smart contract records the access grant (patient → doctor → record). 2. The doctor receives a re-encrypted copy of the symmetric key that they can decrypt with their own private key. 3. The doctor can now retrieve and decrypt the specified records. 4. The grant event is logged on-chain |
| **Trigger** | Patient initiates "Share" action on a record or navigates to "Manage Access" |

### Main Success Scenario

| Step | Actor | System |
|---|---|---|
| 1 | Patient selects a record and clicks "Share" OR navigates to access management | Application displays the sharing interface |
| 2 | | Application shows a list of registered doctors (from contract registry) and/or a field to enter a doctor's wallet address |
| 3 | Patient selects or enters the doctor's wallet address | |
| 4 | | Application verifies the address is a registered doctor by querying the smart contract |
| 5 | | Application displays the doctor's public profile info (name, specialisation) for confirmation |
| 6 | Patient selects which record(s) to share | Application shows checkboxes next to patient's records |
| 7 | Patient optionally sets an expiry (UC-007 flow merges here) | |
| 8 | Patient reviews the sharing summary: "You are granting Dr. [Name] ([address]) access to [N] record(s). Expires: [date/never]" | |
| 9 | Patient clicks "Confirm & Share" | |
| 10 | | **KEY SHARING PHASE**: Application retrieves the doctor's public key from the contract or registry |
| 11 | | Application decrypts the record's AES key using the patient's private key (wallet interaction) |
| 12 | | Application re-encrypts the AES key using the doctor's public key → produces a doctor-specific wrapped key |
| 13 | | Application stores the doctor-wrapped key (on IPFS or on-chain, depending on design) |
| 14 | | **PERMISSION PHASE**: Application calls smart contract `grantAccess(doctorAddress, recordId, expiryTimestamp, wrappedKeyReference)` |
| 15 | | MetaMask prompts patient to confirm the transaction |
| 16 | Patient confirms the transaction | |
| 17 | | Transaction is confirmed on-chain |
| 18 | | Smart contract emits `AccessGranted(patient, doctor, recordId, expiry, timestamp)` event |
| 19 | | Application displays: "Access granted successfully!" |
| 20 | | The permission now appears in both the patient's access management view and the doctor's shared records view |

### Alternative Flows

| ID | Condition | Flow |
|---|---|---|
| AF-005a | Patient shares multiple records at once | Steps 10-14 repeat for each record in a batch → single confirmation for all or individual confirmations (design choice) |
| AF-005b | Patient searches for doctor by name instead of address | Application provides a search/lookup against the registered doctors registry → patient selects from results → flow continues from step 4 |
| AF-005c | Patient grants access without expiry | Expiry is set to 0 or MAX_UINT → contract treats as indefinite → only manual revocation ends access |
| AF-005d | Patient re-grants access to same doctor for same record | Contract checks existing permission → if already active, displays "This doctor already has access to this record" → patient can update expiry |

### Exception Flows

| ID | Condition | Flow |
|---|---|---|
| EF-005a | Target address is not a registered doctor | Contract query returns unregistered → application displays: "This address is not a registered healthcare provider. Access cannot be granted." |
| EF-005b | Patient tries to share with themselves | Application prevents self-sharing client-side: "You already have access to your own records." |
| EF-005c | Doctor's public key is not available | Application displays: "Unable to retrieve provider's public key. They may need to complete their registration." |
| EF-005d | Key re-encryption fails | Application displays: "Encryption error. Please try again." |
| EF-005e | Transaction fails on-chain | Application displays: "Transaction failed: [reason]." → common: out of gas, contract paused → retry option |
| EF-005f | Patient rejects MetaMask transaction | Application displays: "Transaction cancelled. Access was not granted." → no state change |

### Business Rules

- BR-017: Access can ONLY be granted by the record owner (patient)
- BR-018: The receiving doctor MUST have a registered profile on-chain before access can be granted
- BR-019: The original record and its encryption are NEVER modified — only a new wrapped key is created for the doctor
- BR-020: Each access grant is individually recorded and revocable
- BR-021: The grant transaction MUST emit an event for audit trail purposes

### Related Requirements
FR-011, FR-013, NFR-002, NFR-003, NFR-004, NFR-008, NFR-012

### Dissertation Notes
> This is the HEART of your system. The key re-encryption in steps 10-12 is what makes the whole thing work. Draw a detailed diagram showing:
> - Original: `File → AES_encrypt(AES_key) → encrypted_file`
> - Patient's wrapped key: `AES_key → ECIES_encrypt(patient_pubkey) → patient_wrapped_key`
> - Doctor's wrapped key: `patient_wrapped_key → ECIES_decrypt(patient_privkey) → AES_key → ECIES_encrypt(doctor_pubkey) → doctor_wrapped_key`
>
> Discuss the alternative of proxy re-encryption (where the patient doesn't need to be online) as future work.

---

---

# UC-006: Revoke Access from a Doctor

| Field | Detail |
|---|---|
| **Use Case ID** | UC-006 |
| **Name** | Revoke Access from a Doctor |
| **Actor(s)** | Patient, Smart Contract |
| **Description** | A patient revokes a previously granted access permission, preventing the doctor from accessing the record going forward |
| **Preconditions** | 1. Patient is authenticated. 2. An active access grant exists for the target doctor and record |
| **Postconditions** | 1. Smart contract marks the permission as revoked. 2. The doctor can no longer retrieve or decrypt the record through the system. 3. Revocation event is logged on-chain. 4. The doctor's wrapped key is invalidated or removed |
| **Trigger** | Patient clicks "Revoke" on an active access permission |

### Main Success Scenario

| Step | Actor | System |
|---|---|---|
| 1 | Patient navigates to "Manage Access" or views a record's sharing settings | Application displays list of all active access grants with doctor name/address, record name, grant date, expiry |
| 2 | Patient identifies the permission to revoke | |
| 3 | Patient clicks "Revoke Access" | |
| 4 | | Application displays confirmation dialog: "Are you sure you want to revoke Dr. [Name]'s access to [Record Name]? They will no longer be able to view this record." |
| 5 | Patient confirms revocation | |
| 6 | | Application calls smart contract `revokeAccess(doctorAddress, recordId)` |
| 7 | | MetaMask prompts patient to confirm the transaction |
| 8 | Patient confirms the transaction | |
| 9 | | Transaction confirmed on-chain |
| 10 | | Smart contract emits `AccessRevoked(patient, doctor, recordId, timestamp)` event |
| 11 | | Application removes or updates the permission in the UI |
| 12 | | Application displays: "Access has been revoked successfully." |

### Alternative Flows

| ID | Condition | Flow |
|---|---|---|
| AF-006a | Patient wants to revoke ALL access for a specific doctor | Application provides "Revoke All" button next to doctor's name → batch revocation for all records shared with that doctor → single or batched transactions |
| AF-006b | Patient revokes from the record detail view | Same flow, triggered from a different UI location |

### Exception Flows

| ID | Condition | Flow |
|---|---|---|
| EF-006a | Permission doesn't exist or is already revoked | Contract reverts → application displays: "This permission is no longer active." |
| EF-006b | Transaction fails | Standard transaction failure handling → retry option |
| EF-006c | Patient rejects MetaMask transaction | Application displays: "Revocation cancelled. Access remains active." |

### Business Rules

- BR-022: Only the record owner can revoke access
- BR-023: Revocation is immediate upon transaction confirmation
- BR-024: Revocation does NOT delete data the doctor may have already downloaded — this is a known limitation. Discuss in dissertation
- BR-025: Revoked permissions should be distinguishable from expired ones in the audit trail
- BR-026: The doctor's wrapped key should be removed or invalidated upon revocation

### Related Requirements
FR-012, NFR-004, NFR-008

---

---

# UC-007: Set Time-Limited Access

| Field | Detail |
|---|---|
| **Use Case ID** | UC-007 |
| **Name** | Set Time-Limited Access |
| **Actor(s)** | Patient, Smart Contract |
| **Description** | When granting access, the patient specifies an expiration time after which the permission automatically becomes invalid without requiring manual revocation |
| **Preconditions** | 1. Patient is in the process of granting access (UC-005, step 7) |
| **Postconditions** | 1. Access grant includes an on-chain expiry timestamp. 2. After the expiry time, the smart contract rejects any access attempts by the doctor for this record |
| **Trigger** | Patient selects "Set Expiry" option during the access grant flow |

### Main Success Scenario

| Step | Actor | System |
|---|---|---|
| 1 | Patient is on the sharing confirmation screen (UC-005 step 7) | Application displays expiry options |
| 2 | Patient selects an expiry option: preset durations (24 hours, 7 days, 30 days) OR custom date/time picker | |
| 3 | | Application calculates the Unix timestamp for the chosen expiry |
| 4 | | Application displays the exact expiry date/time for confirmation: "Access will expire on [date] at [time]" |
| 5 | Patient confirms | Flow merges back into UC-005 step 8 onwards, with the expiry timestamp included in the contract call |

### Alternative Flows

| ID | Condition | Flow |
|---|---|---|
| AF-007a | Patient chooses "No expiry" | Expiry timestamp is set to 0 or MAX_UINT → contract treats as indefinite |
| AF-007b | Patient wants to extend an existing expiry | Patient navigates to active permission → clicks "Extend" → selects new expiry → new transaction updates the expiry on-chain |

### Exception Flows

| ID | Condition | Flow |
|---|---|---|
| EF-007a | Patient selects an expiry in the past | Client-side validation catches this: "Expiry must be in the future." |
| EF-007b | Patient selects an expiry less than 1 hour from now | Warning: "Very short access window. Are you sure?" → patient confirms or adjusts |

### Business Rules

- BR-027: Expiry is enforced at the smart contract level using `block.timestamp` comparison
- BR-028: The contract does NOT actively revoke — it passively rejects access after expiry (lazy evaluation)
- BR-029: Expired permissions are displayed differently from actively revoked ones in the UI
- BR-030: Extending access requires a new transaction (gas cost)

### Related Requirements
FR-013, NFR-004, NFR-012

### Dissertation Notes
> Discuss `block.timestamp` reliability. Miners/validators have slight control over timestamps (typically ±15 seconds on Ethereum). For access windows of hours or days, this is negligible. Mention it as a known limitation.

---

---

# UC-008: Archive Health Record

| Field | Detail |
|---|---|
| **Use Case ID** | UC-008 |
| **Name** | Archive Health Record |
| **Actor(s)** | Patient, Smart Contract |
| **Description** | A patient marks a health record as archived/inactive, removing it from active views and revoking all existing access grants to that record |
| **Preconditions** | 1. Patient is authenticated. 2. Record exists and is in "active" state |
| **Postconditions** | 1. Record is marked as "archived" on-chain. 2. All active access grants for this record are revoked. 3. Record moves to "Archived" section. 4. IPFS content remains (cannot be deleted) but is inaccessible via the application |
| **Trigger** | Patient clicks "Archive" on a specific record |

### Main Success Scenario

| Step | Actor | System |
|---|---|---|
| 1 | Patient selects a record and clicks "Archive" | |
| 2 | | Application displays warning: "Archiving this record will: (1) Remove it from your active records. (2) Revoke all current access grants. (3) The data will remain on IPFS but will be inaccessible through this application. Continue?" |
| 3 | Patient confirms | |
| 4 | | Application calls smart contract `archiveRecord(recordId)` |
| 5 | | Contract sets record status to archived, revokes all associated permissions |
| 6 | | MetaMask transaction confirmation flow |
| 7 | | Smart contract emits `RecordArchived(owner, recordId, timestamp)` and multiple `AccessRevoked` events |
| 8 | | Application updates UI — record moves to "Archived" tab |

### Exception Flows

| ID | Condition | Flow |
|---|---|---|
| EF-008a | Record is already archived | Contract reverts: "Record is already archived." |
| EF-008b | Transaction fails | Standard handling → retry |

### Business Rules

- BR-031: Archiving is a logical state change, NOT deletion
- BR-032: Archived records CAN be viewed by the patient still (from the archived section) but cannot be shared
- BR-033: Archiving automatically revokes ALL access grants for that record
- BR-034: Un-archiving COULD be supported (design choice — document either way)

### Related Requirements
FR-009, NFR-007, NFR-009

### Dissertation Notes
> CRITICAL discussion point for GDPR right to erasure. The data persists on IPFS and the hash persists on blockchain. Your logical deletion is a pragmatic approach. Discuss:
> - IPFS content can theoretically be unpinned (removed from pinning service) and eventually garbage collected
> - Blockchain record cannot be deleted
> - This is an inherent tension in blockchain-based health systems — dedicate a section to this

---

---

# UC-009: View Audit Trail

| Field | Detail |
|---|---|
| **Use Case ID** | UC-009 |
| **Name** | View Audit Trail |
| **Actor(s)** | Patient |
| **Description** | A patient views a chronological, tamper-proof log of all access-related events for their records — who was granted access, who accessed what, when, and any revocations or expirations |
| **Preconditions** | 1. Patient is authenticated. 2. At least one access-related event has occurred |
| **Postconditions** | 1. Patient has viewed the complete audit history |
| **Trigger** | Patient navigates to "Audit Trail" or "Access History" section |

### Main Success Scenario

| Step | Actor | System |
|---|---|---|
| 1 | Patient clicks "Audit Trail" in navigation | |
| 2 | | Application queries blockchain event logs for all events related to this patient's address: `AccessGranted`, `AccessRevoked`, `RecordAccessed`, `RecordAdded`, `RecordArchived`, `EmergencyAccessUsed` |
| 3 | | Application formats events into a chronological timeline |
| 4 | | Application displays the audit trail with columns: Date/Time, Event Type, Record, Counterparty (doctor), Details, Transaction Hash |
| 5 | Patient browses the trail | |
| 6 | Patient optionally filters by event type, date range, or specific record | Application applies filters |
| 7 | Patient optionally clicks a transaction hash | Opens block explorer in new tab showing the on-chain transaction |

### Alternative Flows

| ID | Condition | Flow |
|---|---|---|
| AF-009a | No events exist | Display: "No access activity yet." |
| AF-009b | Patient views audit for a specific record | Filtered view showing only events for that record |

### Exception Flows

| ID | Condition | Flow |
|---|---|---|
| EF-009a | Blockchain node is slow to return events | Loading indicator → timeout message → retry |

### Business Rules

- BR-035: Audit trail data comes DIRECTLY from blockchain events, not from a database — this ensures tamper-proofness
- BR-036: Events cannot be edited or deleted by anyone
- BR-037: Emergency access events are highlighted/flagged distinctly

### Related Requirements
FR-016, NFR-004, NFR-008

---

---

# UC-010: Configure Emergency Access

| Field | Detail |
|---|---|
| **Use Case ID** | UC-010 |
| **Name** | Configure Emergency Access Settings |
| **Actor(s)** | Patient |
| **Description** | A patient pre-configures their emergency access preferences: which records are available in emergencies, who (if anyone) is pre-authorised as an emergency contact, and what type of emergency mechanism is enabled |
| **Preconditions** | 1. Patient is authenticated and registered. 2. Patient has at least one record |
| **Postconditions** | 1. Emergency settings are stored on-chain. 2. Tagged records are accessible through the emergency mechanism. 3. Designated emergency contacts are recorded |
| **Trigger** | Patient navigates to "Emergency Settings" |

### Main Success Scenario

| Step | Actor | System |
|---|---|---|
| 1 | Patient navigates to "Emergency Settings" | Application displays current emergency configuration |
| 2 | Patient reviews their records and toggles "Emergency Accessible" flag for relevant records (e.g., allergies, blood type, chronic conditions, current medications) | |
| 3 | Patient optionally adds emergency contact addresses (trusted doctors, family members who are users) | |
| 4 | Patient selects emergency access mode: "Pre-authorised contacts only" OR "Any registered doctor (break-glass via Custodian validation)" | |
| 5 | Patient clicks "Save Emergency Settings" | |
| 6 | | Application calls smart contract to update emergency settings |
| 7 | | MetaMask transaction confirmation |
| 8 | | Application displays: "Emergency settings updated successfully." |

### Business Rules

- BR-038: Emergency-tagged records contain a separate wrapped key for emergency use (design decision: pre-encrypted with emergency contact's key, or stored in a recoverable way)
- BR-039: Emergency settings changes are logged on-chain
- BR-040: At least one record should be recommended for emergency tagging (prompt if none are tagged)

### Related Requirements
FR-014, FR-014a, FR-014b

---

---

# UC-011: Register as Doctor

| Field | Detail |
|---|---|
| **Use Case ID** | UC-011 |
| **Name** | Register as Healthcare Provider |
| **Actor(s)** | Doctor |
| **Description** | A new user registers as a healthcare provider, providing professional information. Their profile is stored on-chain and they are immediately available for normal record sharing. |
| **Preconditions** | 1. Wallet is connected. 2. Address is not already registered |
| **Postconditions** | 1. Doctor's address is registered on-chain with doctor role. 2. Profile information is stored. 3. Doctor can receive normal shared records. |
| **Trigger** | New user selects "Healthcare Provider" during registration |

### Main Success Scenario

| Step | Actor | System |
|---|---|---|
| 1 | User selects "Healthcare Provider" role | Application displays doctor registration form |
| 2 | Doctor fills in: full name, medical licence number, specialisation, affiliated institution | |
| 3 | Doctor submits their public key for encryption purposes (may be derived from wallet automatically) | |
| 4 | Doctor clicks "Register" | |
| 5 | | Application validates inputs |
| 6 | | Application calls smart contract `registerAsDoctor(name, licenseNumber, specialty, institution, encryptionPublicKey)` |
| 7 | | MetaMask transaction confirmation |
| 8 | | Smart contract stores doctor profile and sets role = Role.Doctor |
| 9 | | Smart contract emits `UserRegistered(address, Role.Doctor, timestamp)` event |
| 10 | | Application displays: "Doctor registration successful. Patients can now share records with your wallet address." |

### Exception Flows

| ID | Condition | Flow |
|---|---|---|
| EF-011a | Address already registered | Contract reverts → "This wallet is already registered." |
| EF-011b | Required fields missing | Validation errors shown |

### Business Rules

- BR-041: Doctors can immediately receive normal shared records once registered.
- BR-042: The doctor's public key must be stored on-chain in the UserRegistry so patients can encrypt record keys for them during access grants.
- BR-043: Doctor identity display is retrieved from the details registered on-chain.

### Related Requirements
FR-003, FR-005

---

---

# UC-012: View Shared Records (Doctor)

| Field | Detail |
|---|---|
| **Use Case ID** | UC-012 |
| **Name** | View Shared Records |
| **Actor(s)** | Doctor |
| **Description** | A registered doctor views all health records that patients have shared with them and can open/decrypt individual records |
| **Preconditions** | 1. Doctor is authenticated and registered on-chain. 2. At least one patient has granted this doctor access to a record |
| **Postconditions** | 1. Doctor has viewed shared records. 2. Access event is logged on-chain |
| **Trigger** | Doctor navigates to "Shared With Me" dashboard |

### Main Success Scenario

| Step | Actor | System |
|---|---|---|
| 1 | Doctor clicks "Shared Records" | |
| 2 | | Application queries smart contract for all active access grants where this doctor is the grantee |
| 3 | | Application displays list grouped by patient: Patient A (3 records), Patient B (1 record), etc. |
| 4 | | Each record shows: type, date, description, grant date, expiry status |
| 5 | Doctor selects a specific record to view | |
| 6 | | Application calls smart contract to verify access is still valid (not revoked, not expired) |
| 7 | | **If valid**: Application retrieves the doctor-wrapped key for this record |
| 8 | | Application fetches encrypted file from IPFS |
| 9 | | Application decrypts the AES key using the doctor's private key (wallet interaction) |
| 10 | | Application decrypts the file using the AES key |
| 11 | | Application displays the decrypted record |
| 12 | | Smart contract emits `RecordAccessed(patient, doctor, recordId, timestamp)` event — this feeds the patient's audit trail |
| 13 | Doctor reviews the medical information | |

### Alternative Flows

| ID | Condition | Flow |
|---|---|---|
| AF-012a | No records shared with this doctor | Display: "No patients have shared records with you yet." |
| AF-012b | Access has expired since last visit | Record appears greyed out: "Access expired on [date]." → doctor cannot open it |
| AF-012c | Doctor wants to download the record | Download button available → decrypted file downloaded locally |

### Exception Flows

| ID | Condition | Flow |
|---|---|---|
| EF-012a | Access was revoked between listing and opening | Contract returns "access denied" → application displays: "The patient has revoked your access to this record." → record removed from list on refresh |
| EF-012b | IPFS content unavailable | "Record temporarily unavailable." → retry |
| EF-012c | Decryption fails | "Unable to decrypt. The access key may be invalid." |

### Business Rules

- BR-044: EVERY record access by a doctor MUST be logged on-chain (emit event)
- BR-045: The access check MUST happen at the smart contract level, not just the frontend
- BR-046: Expired access must be rejected even if the doctor has the wrapped key — the contract is the source of truth
- BR-047: Doctors should NOT be able to bulk-download all records

### Related Requirements
FR-017, NFR-004, NFR-008, NFR-011

---

---

# UC-013: Request Access (Doctor)

| Field | Detail |
|---|---|
| **Use Case ID** | UC-013 |
| **Name** | Request Access to Patient Records |
| **Actor(s)** | Doctor, Patient (approver) |
| **Description** | A registered doctor sends an access request to a patient. The patient is notified and can approve or deny the request |
| **Preconditions** | 1. Doctor is authenticated and registered on-chain. 2. Doctor knows the patient's wallet address |
| **Postconditions** | 1. Access request is recorded (on-chain or off-chain). 2. Patient is notified. 3. Request is in "pending" state until patient acts |
| **Trigger** | Doctor clicks "Request Access" and enters patient information |

### Main Success Scenario

| Step | Actor | System |
|---|---|---|
| 1 | Doctor clicks "Request Access" | Application displays request form |
| 2 | Doctor enters patient's wallet address | |
| 3 | | Application verifies the address is a registered patient |
| 4 | Doctor optionally adds a message/reason for the request | |
| 5 | Doctor clicks "Send Request" | |
| 6 | | Application calls smart contract `requestAccess(patientAddress, message)` or stores request off-chain |
| 7 | | Smart contract emits `AccessRequested(doctor, patient, timestamp)` event |
| 8 | | Application displays: "Request sent. The patient will be notified." |
| 9 | | Patient's application detects the event → shows notification (UC-020) |
| 10 | Patient reviews the request: doctor's name, specialisation, reason | |
| 11a | Patient approves → triggers UC-005 (Grant Access) flow | |
| 11b | Patient denies → request marked as "denied" | Doctor sees "Request denied" status |

### Business Rules

- BR-048: Doctors cannot spam requests — rate limiting (e.g., max 3 pending requests per patient)
- BR-049: Pending requests expire after a configurable time (e.g., 7 days)
- BR-050: Denied requests are logged but the doctor is not given a detailed reason

### Related Requirements
FR-018, NFR-004, NFR-020

---

---

# UC-014: Unified Access Models (OTP-Based)

| Field | Detail |
|---|---|
| **Use Case ID** | UC-014 |
| **Name** | Emergency & Institutional Access |
| **Actor(s)** | System, Custodian, Patient, Doctor |
| **Description** | Covers the three access scenarios required by the Custodian model: 1. Patient self-access, 2. Conscious patient providing one-off explicit consent securely, 3. Unconscious patient emergency access governed by the Custodian registry with OTP issuance. |
| **Preconditions** | 1. Custodian has populated the provider registry with valid institution wallet IDs and public keys. 2. Patient has at least one record. |
| **Postconditions** | 1. Authorized requests receive a one-time password (OTP) encrypted with their public key to decrypt records. 2. Unauthorized requests are denied. 3. All access attempts are logged. |
| **Trigger** | Doctor requests emergency or one-off access to patient records. |

### Main Success Scenario 1: Conscious Patient (Explicit One-Off Consent)

| Step | Actor | System |
|---|---|---|
| 1 | Doctor | Submits an access request to the patient's wallet address |
| 2 | System | Notifies the conscious patient of the pending request |
| 3 | Patient | Clicks "Consent" to grant one-off access to the requesting wallet ID |
| 4 | System | Generates a random one-time decryption key (OTP) for the requested record |
| 5 | System | Encrypts the OTP using the doctor's public key (fetched from Request) and sends it back |
| 6 | Doctor | Decrypts the OTP using their private key and accesses the record for that single session |
| 7 | System | Logs the one-off access consent and requires a new consent for any future attempts |

### Main Success Scenario 2: Unconscious Patient (Emergency Access)

| Step | Actor | System |
|---|---|---|
| 1 | Doctor | Submits an emergency access request when the patient is unconscious or unresponsive |
| 2 | System | Receives request and queries the Custodian's encrypted provider registry |
| 3 | System | Verifies that the requesting wallet ID exists in the Custodian registry |
| 4 | System | Generates a fresh random one-time decryption key (OTP) for the emergency records |
| 5 | System | Encrypts the OTP with the institution's public key (fetched from Custodian registry) and issues it |
| 6 | System | Logs the emergency access event immutably |
| 7 | Doctor | Decrypts the OTP using the institution's private key and accesses the records once |

### Main Success Scenario 3: Patient Self-Access

| Step | Actor | System |
|---|---|---|
| 1 | Patient | Opens their own record dashboard |
| 2 | System | Displays records (as described in UC-004) without invoking the Custodian OTP flow |

### Exception Flows

| ID | Condition | Flow |
|---|---|---|
| EF-014a | Requester wallet not in Custodian registry (Unconscious scenario) | System denies access immediately and logs the unauthorized attempt. |
| EF-014b | Patient denies explicit consent | System logs the denial; doctor does not receive the OTP. |

### Business Rules

- BR-051: The Custodian registry is the ultimate source of truth for recognizing valid institutional wallets in an emergency.
- BR-052: OTPs are valid for a single access session and must be discarded. A new request must generate a new OTP.
- BR-053: Emergency access events are logged immutably.
- BR-054: Patient self-access bypasses the OTP and Custodian checks as the patient decrypts their own data.

### Related Requirements
FR-005, FR-014, FR-014a, FR-014b, FR-014c, FR-014d, NFR-008

---

---

# UC-015: Validate Healthcare Provider (Custodian Admin)

| Field | Detail |
|---|---|
| **Use Case ID** | UC-015 |
| **Name** | Validate Healthcare Provider for Emergency Access |
| **Actor(s)** | Custodian Administrator |
| **Description** | An administrator reviews a healthcare provider's credentials off-chain and adds their wallet/keys to the trusted Custodian registry (pinned to IPFS) to enable emergency access |
| **Preconditions** | 1. Provider details and institutional credentials are provided to the Custodian. 2. Admin has access to the Custodian registry configuration. |
| **Postconditions** | 1. The provider's identity is added to the Custodian registry. 2. The registry is pinned to IPFS, updating the root hash. 3. The provider is recognized for emergency access |
| **Trigger** | Admin needs to authorize a new healthcare provider for emergency access |

### Main Success Scenario

| Step | Actor | System |
|---|---|---|
| 1 | Admin validates the doctor's credentials off-chain against official medical/licensing databases | |
| 2 | Admin adds the provider's wallet address, public key, and metadata to the Custodian provider registry file | |
| 3 | Admin executes the pinning script (e.g. `npm run pin-custodian` or similar) | System uploads/pins the registry to IPFS and logs the updated IPFS hash |
| 4 | | System updates the active Custodian IPFS pointer, ensuring all nodes resolve the new registry |

### Business Rules

- BR-056: The Custodian registry is the ultimate source of truth for recognizing valid institutional wallets in an emergency.
- BR-057: Updating the Custodian registry is restricted to authorized administrative processes off-chain.
- BR-058: This design uses an off-chain trust registry pinned to IPFS rather than expensive/centralized on-chain status checks, keeping patient registry decentralization high while ensuring strict governance for emergency access.

### Related Requirements
FR-005, NFR-004

---

---

# Traceability Matrix

This ties everything together. Your examiners WILL look for this.

| Requirement | Use Case(s) | Priority |
|---|---|---|
| FR-001 Wallet Connection | UC-001 | MUST |
| FR-002 Wallet Disconnection | UC-001 (AF) | MUST |
| FR-003 Role Assignment | UC-002, UC-011 | MUST |
| FR-004 Profile Creation | UC-002, UC-011 | SHOULD |
| FR-005 Doctor Registration & Custodian Validation | UC-011, UC-015 | SHOULD |
| FR-006 Record Upload | UC-003 | MUST |
| FR-007 Record Metadata | UC-003 | MUST |
| FR-008 Record Retrieval | UC-004 | MUST |
| FR-009 Record Archive | UC-008 | SHOULD |
| FR-010 Record Filtering | UC-004 | COULD |
| FR-011 Grant Access | UC-005 | MUST |
| FR-012 Revoke Access | UC-006 | MUST |
| FR-013 Time-Limited Access | UC-007 | SHOULD |
| FR-014 Emergency Access | UC-010, UC-014 | SHOULD |
| FR-015 View Permissions | UC-005, UC-006 | MUST |
| FR-016 Audit Trail | UC-009 | MUST |
| FR-017 View Shared Records | UC-012 | MUST |
| FR-018 Request Access | UC-013 | COULD |
| FR-019 Transaction Feedback | All UCs (every tx) | MUST |
| FR-020 Notifications | UC-013, UC-014 | SHOULD |

---

# What You Should Produce From This

1. **A formal UML Use Case Diagram** — actors on the sides, use cases as ovals, with `<<include>>` and `<<extend>>` relationships where appropriate:
   - UC-005 `<<include>>` UC-007 (time-limited is part of granting)
   - UC-014 `<<extend>>` UC-010 (emergency access extends from emergency config)
   - UC-008 `<<include>>` UC-006 (archiving includes revoking)

2. **Sequence diagrams** for at minimum UC-003, UC-005, UC-012, and UC-014 — these are your four most technically interesting flows

3. **Activity diagrams** for UC-005 and UC-014 — these have the most complex decision logic

4. **The traceability matrix** expanded to include test case IDs once you write your test plan

---

Want me to move on to producing the **sequence diagrams** for the key flows, or would you prefer to tackle the **architecture and encryption/key-sharing design** next? The key management design underpinning UC-005 and UC-014 is the most technically challenging piece and will directly shape your smart contract interface.