# User Action Semantics

Authoritative document for UI copy and action behaviour.
Every sensitive button must answer: what happens, who gains/loses access, can it be undone, what remains stored, what is logged.

---

## Action: Upload Record

Actor: Patient

User-facing label: **Upload securely**

Plain-language meaning: Add a new health file to your secure vault.

Technical effect:
- File encrypted in browser (AES-256-GCM)
- Encrypted bytes uploaded to IPFS
- CID, content hash, and wrapped key stored on-chain

Does NOT mean:
- The server receives your readable file
- The file is publicly visible
- Anyone else can open it without your permission

Required UI copy:
> Your file is encrypted in this browser before it is uploaded. The server never receives the readable file.

Technical details (collapsed): CID, content hash, transaction hash, encrypted size

---

## Action: View / Unlock Record

Actor: Patient (owner) / Doctor (shared) / Emergency contact

User-facing label: **Unlock record**

Plain-language meaning: Open a protected health file for viewing or download.

Technical effect:
- Fetch encrypted bytes from IPFS
- Verify content hash
- Unwrap AES key using local RSA private key
- Decrypt locally in browser

Does NOT mean:
- The server decrypts the file
- Anyone else is notified (unless doctor/emergency mode logs access)

Required UI copy:
> This record is protected. Unlock it to view or download the file.

After success:
> File integrity verified. Record unlocked locally.

On failure:
> This record could not be unlocked. Your local access key may be missing or incompatible.

---

## Action: Share / Grant Access

Actor: Patient

User-facing label: **Share record**

Plain-language meaning: Allow a doctor to open selected records until expiry or revocation.

Technical effect:
- Patient unwraps own AES key
- Re-wraps for doctor's public key
- Permission and wrapped key stored on-chain

Does NOT mean:
- The doctor receives the file immediately
- The doctor can keep access after revocation through this app
- Downloaded copies are erased on revocation

Required confirmation:
> This doctor will be able to unlock the selected record until the expiry time. You can revoke access earlier.

Disclosure:
> Revoking later prevents future access through this app. It cannot erase copies already downloaded.

---

## Action: Revoke Access

Actor: Patient

User-facing label: **Revoke access**

Plain-language meaning: Stop a doctor from opening the record again through the system.

Technical effect:
- Permission set inactive
- Doctor's encrypted key removed from RecordManager
- checkAccess returns false

Does NOT mean:
- Files already downloaded are deleted
- Blockchain history is erased

Required confirmation:
> Stop future access? This doctor will no longer be able to open this record through the app. This cannot delete copies they may have already downloaded.

---

## Action: Archive Record

Actor: Patient

User-facing label: **Archive**

Plain-language meaning: Make a record inactive without deleting its reference.

Technical effect:
- Status set to Archived
- CID remains on-chain
- Access checks deny inactive records

Does NOT mean:
- The file is deleted from IPFS
- Blockchain history is erased
- Existing permissions are automatically revoked

Required confirmation:
> Archive this record? This makes the record inactive in the app. It does not erase blockchain history or encrypted IPFS copies.

---

## Action: Restore Record

Actor: Patient

User-facing label: **Restore**

Plain-language meaning: Make an archived record active again.

Technical effect:
- Status changes from Archived to Active
- Old permissions may become usable if not revoked/expired

Required confirmation:
> Restore this record? This makes the record active again. If old permissions were not revoked and have not expired, access rules may apply again.

---

## Action: Remove from Vault

Actor: Patient

User-facing label: **Remove from vault**

Plain-language meaning: Remove the active app reference to a record.

Technical effect:
- Status set to Deleted
- CID field cleared
- Owner encrypted key deleted
- Does NOT unpin from IPFS automatically
- Does NOT remove blockchain history

Does NOT mean:
- Permanent erasure from all systems
- IPFS copies are guaranteed deleted
- Blockchain traces are removed

Required confirmation:
> Remove this record from your vault? This removes the active app reference. Blockchain history cannot be erased, and encrypted IPFS copies may still exist if pinned elsewhere.

UI rule: Do not expose as primary action. Prefer Archive.

---

## Action: Mark Emergency

Actor: Patient

User-facing label: **Mark as emergency record**

Plain-language meaning: Make this record available during approved emergency sessions.

Technical effect:
- isEmergency flag set to true
- getEmergencyRecords includes this record
- Emergency keys must be synced for contacts/Custodian to decrypt

Required confirmation:
> Mark as emergency record? Emergency records can be opened during approved emergency sessions. Only mark records useful in urgent care.

---

## Action: Add Trusted Contact

Actor: Patient

User-facing label: **Add trusted contact**

Plain-language meaning: Pre-authorise a person for immediate emergency access.

Technical effect:
- Contact added to emergency configuration
- When triggered, session activates immediately (no Custodian validation)

Required confirmation:
> Add trusted contact? This person may be able to open emergency-marked records during an emergency session.

---

## Action: Request Emergency Access

Actor: Doctor / Trusted contact

User-facing label: **Request emergency access**

Plain-language meaning: Request access to a patient's emergency records when they cannot consent.

Technical effect:
- Trusted contact: session immediately active
- Other doctor: session pending Custodian validation

Does NOT mean:
- Immediate access to all records
- Permanent access

Required UI copy:
> Use this only when the patient cannot provide consent. Emergency access is temporary and permanently logged.

---

## Action: Open Emergency Session

Actor: Doctor / Trusted contact

User-facing label: **Open emergency session**

Plain-language meaning: Activate an approved emergency session to view emergency records.

Technical effect:
- Session status moves to Consumed
- Emergency records become available for viewing
- Each record access is logged

Does NOT mean:
- Unlimited access
- Access to non-emergency records

Required UI copy:
> Opening this session will allow emergency records to be viewed. Each record access is logged.

---

## Action: Revoke Emergency Session

Actor: Patient

User-facing label: **End emergency session**

Plain-language meaning: Stop an active emergency session.

Technical effect:
- Session status set to Revoked
- Future access through that session blocked

Does NOT mean:
- Files already downloaded are erased

Required confirmation:
> End emergency session? This stops future access through this emergency session. It cannot remove files already downloaded.

---

## Action: Prepare Emergency Access Keys

Actor: Patient

User-facing label: **Prepare emergency access keys**

Plain-language meaning: Encrypt record keys for trusted contacts and Custodian so they can decrypt during emergencies.

Technical effect:
- AES keys wrapped for each trusted contact's public key
- Keys stored on-chain for emergency retrieval

Does NOT mean:
- Contacts can access records right now
- Records are shared permanently

Required UI copy:
> This prepares protected access keys so your trusted contacts or verified emergency providers can unlock emergency records if needed.

---

## System State: Paused / Maintenance

User-facing label: **System maintenance**

Plain-language meaning: Some actions are temporarily unavailable.

Required UI copy:
> Some actions are temporarily unavailable. The system is currently in maintenance mode. Viewing existing local data may still work, but new changes cannot be saved right now.

Do NOT say: "Contract paused", "Paused state", or expose technical pause mechanism.
