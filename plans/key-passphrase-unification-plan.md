# Key & Passphrase Unification Plan

## Current Architecture — The Duplication Problem

### Current Data Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        SERVER (Purrivacy)                               │
│                                                                         │
│  ┌──────────────────────────┐    ┌──────────────────────────────────┐  │
│  │  Firestore User Document │    │  RTDB /userKeys/{userId}          │  │
│  │                          │    │                                    │  │
│  │  dekPassword             │    │  items/{recordId}: {              │  │
│  │  dekSeed                 │    │    encryptedData, iv, tag         │  │
│  │  passphraseStorageEnabled│    │  }  ← contains full KeyPair       │  │
│  │  passphraseStore: {      │    │     including privateKeyPassphrase│  │
│  │    fp1: "hunter2",       │◄───│     inside the encrypted blob     │  │
│  │    fp2: "correctbattery" │    │                                    │  │
│  │  }                       │    │  Endpoints:                       │  │
│  │                          │    │  POST   /key-records              │  │
│  │  Endpoints:              │    │  PUT    /key-records/:recordId    │  │
│  │  GET  /passphrase-storage│    │  DELETE /key-records/:recordId    │  │
│  │  POST /passphrase-storage│    │  GET    /key-records              │  │
│  │  POST /passphrase-storage│    │                                    │  │
│  │       /key               │    │  FCM: "user" ← when keys change   │  │
│  │  POST /passphrase-storage│    │                                    │  │
│  │       /key/delete        │    │                                    │  │
│  │                          │    │                                    │  │
│  │  FCM: "passphraseStorage │    │                                    │  │
│  │        Changed"          │    │                                    │  │
│  │  FCM: "passphraseSynced" │    │                                    │  │
│  │  FCM: "passphraseDeleted"│    │                                    │  │
│  └──────────────────────────┘    └──────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      CLIENT (PurrivacyApp)                              │
│                                                                         │
│  ┌──────────────────────┐   ┌──────────────────────────────────────┐  │
│  │  passphraseStore.ts  │   │  keyRepository.ts / keyMutationService│  │
│  │                      │   │                                      │  │
│  │  - in-memory cache   │   │  - encrypts/decrypts KeyPair         │  │
│  │  - secure storage    │   │  - KeyPair.privateKeyPassphrase      │  │
│  │  - index management  │   │    included in encrypted blob        │  │
│  │  - FCM sync hooks    │   │  - synced BOTH to key record AND    │  │
│  │  - backend sync      │◄──│    to passphrase store (duplicate!)  │  │
│  │    adapter            │   │                                      │  │
│  │                      │   │  syncLocalPassphraseCacheFromPayload │  │
│  │  usePassphraseSync   │   │  copies passphrase FROM key payload  │  │
│  │  usePassphraseStorage│   │  INTO passphraseStore on every fetch │  │
│  │  AutoSync            │   │                                      │  │
│  │                      │   │  persistKeyPassphrase bridges the    │  │
│  │  persistKeyPassphrase │◄──│  two systems together               │  │
│  └──────────────────────┘   └──────────────────────────────────────┘  │
│                                                                         │
│  DUPLICATION: passphrases live in TWO places:                          │
│    1. KeyPair.privateKeyPassphrase (part of encrypted key blob)        │
│    2. passphraseStore (separate local cache + Firestore + FCM)         │
└─────────────────────────────────────────────────────────────────────────┘
```

### What the user's proposal correctly identifies

1. Every key is stored as one encrypted blob on the server (RTDB `items/{recordId}`)
2. `PUT /key-records/:recordId` already handles ANY key update — the client sends the full encrypted key, the server just stores it
3. `KeyPair.privateKeyPassphrase` is already embedded in that encrypted blob
4. The separate `passphraseStore` / Firestore `passphraseStore` / FCM passphrase events are all redundant
5. Passphrase semantics can be encoded directly on the key:
   - `null` → passphrase storage disabled or no passphrase
   - `''` (empty string) → key is unprotected
   - non-empty → stored passphrase, ready for autofill

---

## Simplified Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        SERVER (Purrivacy)                               │
│                                                                         │
│  ┌──────────────────────────┐    ┌──────────────────────────────────┐  │
│  │  Firestore User Document │    │  RTDB /userKeys/{userId}          │  │
│  │                          │    │                                    │  │
│  │  dekPassword             │    │  items/{recordId}: {              │  │
│  │  dekSeed                 │    │    encryptedData, iv, tag         │  │
│  │  passphraseStorageEnabled│    │  }  ← one blob per key            │  │
│  │                          │    │     includes privateKeyPassphrase │  │
│  │  ~~passphraseStore~~     │    │                                    │  │
│  │  (REMOVED)               │    │  Endpoints (no changes):          │  │
│  │                          │    │  POST   /key-records              │  │
│  │  Endpoints:              │    │  PUT    /key-records/:recordId    │  │
│  │  POST /passphrase-storage│    │  DELETE /key-records/:recordId    │  │
│  │  (SIMPLIFIED — only      │    │  GET    /key-records              │  │
│  │   toggles the flag)      │    │                                    │  │
│  │                          │    │  FCM: "user" ← single event for   │  │
│  │  ~~GET /passphrase-storage~~ │  ALL key changes (already exists)  │  │
│  │  ~~POST /passphrase-storage│   │                                    │  │
│  │        /key~~             │    │                                    │  │
│  │  ~~POST /passphrase-storage│   │                                    │  │
│  │        /key/delete~~      │    │                                    │  │
│  │                          │    │                                    │  │
│  │  ~~FCM: passphraseXxx~~  │    │                                    │  │
│  │  (REMOVED — "user"       │    │                                    │  │
│  │   covers all key changes)│    │                                    │  │
│  └──────────────────────────┘    └──────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      CLIENT (PurrivacyApp)                              │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  SIMPLIFIED:                                                      │  │
│  │                                                                    │  │
│  │  passphraseStore.ts → simplified to just:                         │  │
│  │    - isPassphraseStorageEnabled(userId): boolean                  │  │
│  │    - setPassphraseStorageEnabled(userId, enabled): void           │  │
│  │    (simple flag read/write, no cache, no index, no FCM)          │  │
│  │                                                                    │  │
│  │  Passphrase source of truth: key.privateKeyPassphrase             │  │
│  │    - null   → no stored passphrase                                │  │
│  │    - ''     → unprotected key                                     │  │
│  │    - "hunt" → stored, autofill                                    │  │
│  │                                                                    │  │
│  │  REMOVED:                                                         │  │
│  │    - passphraseBackendSyncAdapter.ts                              │  │
│  │    - usePassphraseSync.ts                                         │  │
│  │    - usePassphraseStorageAutoSync.ts (simplify)                   │  │
│  │    - passphrasePersistenceService.ts / persistKeyPassphrase       │  │
│  │    - syncLocalPassphraseCacheFromPayload in keyRepository.ts      │  │
│  │    - maybeStorePassphrase in useKeyOperations.ts                  │  │
│  │    - ~10 passphrase-related API methods                           │  │
│  │                                                                    │  │
│  │  WHEN DISABLING STORAGE:                                          │  │
│  │    For each key with a private key:                               │  │
│  │      1. Set key.privateKeyPassphrase = null                       │  │
│  │      2. Re-upload via PUT /key-records/:recordId                  │  │
│  │    This triggers FCM "user" → other devices re-fetch and see null │  │
│  │                                                                    │  │
│  │  ALL KEY MUTATIONS use the same PUT /key-records/:recordId:       │  │
│  │    - change passphrase                                            │  │
│  │    - change expiration                                            │  │
│  │    - set default                                                  │  │
│  │    - change email/name/comment                                    │  │
│  │    - anything else                                                │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Step-by-Step Plan

### Phase 1: Server Simplification

**File: [`userRoutes.ts`](src/features/user/api/userRoutes.ts)**

1. Remove these 3 endpoints:
   - `GET /passphrase-storage` (line 89-93) — no longer needed; passphrases come as part of decrypted keys
   - `POST /passphrase-storage/key` (line 103-109) — sync is redundant; key upload already includes passphrase
   - `POST /passphrase-storage/key/delete` (line 111-117) — passphrase deletion happens via key update
2. Simplify `POST /passphrase-storage` (line 95-101) — keep only the enabled toggle. Remove the `passphraseStore` clearing logic since there's no separate store anymore.
3. Remove the corresponding imports (`parseDeletePassphraseRequest`, `parseSyncPassphraseRequest`).

**File: [`userRequests.ts`](src/features/user/api/userRequests.ts)**

4. Remove `parseSyncPassphraseRequest` (line 52-58) and `parseDeletePassphraseRequest` (line 60-64).

**File: [`UserService.ts`](src/features/user/application/UserService.ts)**

5. Remove `syncPassphrase` (line 125-132) and `deleteStoredPassphrase` (line 134-140) and `getStoredPassphrases` (line 142-146) methods.

**File: [`userWrites.ts`](src/features/user/application/userWrites.ts)**

6. Remove `syncPassphrase` function (line 102-120) and `deleteStoredPassphrase` function (line 122-139).
7. Simplify `setPassphraseStorage` (line 79-100) — remove the Firestore `passphraseStore` clearing (line 87-90) since that field no longer exists. Keep the flag toggle and the FCM notification. The FCM event should change from `passphraseStorageChanged` to `user` (so other devices know to re-fetch keys with updated passphrase state).
8. Remove the `PASSPHRASE_STORE_FIELD` constant.

**File: [`userReads.ts`](src/features/user/application/userReads.ts)**

9. Remove `getStoredPassphrases` function (line 31-36).

**File: [`NotificationService.ts`](src/features/notification/application/NotificationService.ts)**

10. No code changes needed (it's generic), but the callers change from `passphraseStorageChanged`/`passphraseSynced`/`passphraseDeleted` to just `user`.

### Phase 2: Client Simplification

**File: [`passphraseStore.ts`](src/features/security/services/passphraseStore.ts)**

11. Simplify to only contain:
    - `isPassphraseStorageEnabled(userId)` — reads the flag
    - `setPassphraseStorageEnabled(userId, enabled)` — writes the flag + calls backend to toggle
    - `hasAnsweredPassphraseStoragePrompt(userId)` / `setPassphraseStoragePrompted(userId, prompted)`
    - Remove: all passphrase CRUD, cache, index management, backend sync adapter, FCM listeners, `clearPassphrase`, `storePassphrase`, `getPassphrase`, `hasStoredPassphrase`, `getPassphraseIndex`, `clearIndexedPassphrases`, `clearPassphraseCacheForUser`, `subscribePassphraseStoreChanges`, `PassphraseBackendSync` interface, `setPassphraseBackendSync`, `emitPassphraseStoreChange`

**Files to remove or make no-ops:**

12. [`passphraseBackendSyncAdapter.ts`](src/features/security/services/passphraseBackendSyncAdapter.ts) — Remove entirely
13. [`usePassphraseSync.ts`](src/features/security/hooks/usePassphraseSync.ts) — Remove (no more passphrase FCM events to listen for)
14. [`passphrasePersistenceService.ts`](src/features/keys/services/passphrasePersistenceService.ts) — Remove `persistKeyPassphrase` function
15. [`ModalToastHost.tsx`](src/components/ModalToastHost.tsx) — Already a no-op from previous work

**File: [`usePassphraseStorageAutoSync.ts`](src/features/security/hooks/usePassphraseStorageAutoSync.ts)**

16. Simplify — keep only the auto-sync of `passphraseStorageEnabled` flag on login. Remove the `storePassphrase` calls that sync passphrases from backend (since there's no backend passphrase store anymore).

**File: [`App.tsx`](App.tsx)**

17. Remove `setPassphraseBackendSync(createPassphraseBackendSyncAdapter())` call
18. Remove `usePassphraseSync()` hook usage
19. Remove corresponding imports

**File: [`keyRepository.ts`](src/features/keys/services/keyRepository.ts)**

20. Remove `syncLocalPassphraseCacheFromPayload` function (line 62-78) and its call on line 166.
21. Remove import of `securityService.storePassphrase`/`securityService.clearPassphrase` if no longer used.

**File: [`useKeyOperations.ts`](src/features/keys/hooks/useKeyOperations.ts)**

22. Remove `maybeStorePassphrase` helper function (line 56-69)
23. Remove `persistKeyPassphrase` import
24. Remove `ensurePassphraseStorageConsent` calls from `onCreateKey` and `onImportKey`
25. Simplify passphrase handling — just set `keyGenerationOptions.passphrase` (or empty string for unprotected) on the key options; the passphrase gets embedded in the key payload naturally
26. On disable storage: mark all keys' `privateKeyPassphrase` as `null` and re-upload

**File: [`securityService.ts`](src/features/security/services/securityService.ts)**

27. Remove `storePassphrase`, `hasStoredPassphrase`, `getPassphrase`, `clearPassphrase`, `clearIndexedPassphrases`, `subscribePassphraseStoreChanges` from the export object
28. Remove corresponding imports from `passphraseStore`

**File: [`ApiClient`](src/api/client.ts) and [`userApi`](src/api/user/userApi.ts)**

29. Remove `setPassphraseStorage`, `syncPassphrase`, `deleteStoredPassphrase`, `getStoredPassphrases` methods
30. Remove corresponding `userApi` methods and request helpers

**Files that reference `securityService.getPassphrase` / `hasStoredPassphrase`:**

31. Search and replace all usages with `key.privateKeyPassphrase` checks:
    - `useDecryptPage.ts` — autofill from `selectedKey.privateKeyPassphrase`
    - `useEncryptPage.ts` — autofill from `selectedKey.privateKeyPassphrase`
    - `PassphraseField.tsx` — autofill logic
    - Any other component that reads passphrases

**File: [`passphraseSync.test.ts`](src/features/security/services/passphraseSync.test.ts)**

32. Update or remove tests for the simplified passphrase store

### Phase 3: Disable Passphrase Storage — Re-upload Keys

When the user disables passphrase storage:

33. Create a new function in `keyMutationService.ts` (or `useKeyOperations.ts`):
    ```typescript
    async function clearAllStoredPassphrases(userId: string, keys: KeyPairWithRecordId[]): Promise<void>
    ```
    For each key with `privateKey`:
    - Set `key.privateKeyPassphrase = null`
    - Call `updateEncryptedKeyRecord(userId, key)`
    - This triggers one FCM "user" event per key update (on server), or we can batch them client-side and send one final notification

34. Call this function from the passphrase storage toggle handler when disabling.

---

## Files Summary

### Server (5 files changed)
| File | Change |
|------|--------|
| `userRoutes.ts` | Remove 3 passphrase endpoints, simplify 1 |
| `userRequests.ts` | Remove 2 request parsers |
| `UserService.ts` | Remove 3 methods |
| `userWrites.ts` | Remove `syncPassphrase`, `deleteStoredPassphrase`, simplify `setPassphraseStorage` |
| `userReads.ts` | Remove `getStoredPassphrases` |

### Client (15+ files changed)
| File | Change |
|------|--------|
| `passphraseStore.ts` | Heavy simplification (~200 lines removed) |
| `passphraseBackendSyncAdapter.ts` | **Delete** |
| `usePassphraseSync.ts` | **Delete** |
| `usePassphraseStorageAutoSync.ts` | Simplify |
| `passphrasePersistenceService.ts` | Remove `persistKeyPassphrase` |
| `keyRepository.ts` | Remove `syncLocalPassphraseCacheFromPayload` |
| `useKeyOperations.ts` | Remove `maybeStorePassphrase`, simplify consent |
| `securityService.ts` | Remove passphrase-related exports |
| `App.tsx` | Remove backend sync + usePassphraseSync |
| `ApiClient` / `userApi` | Remove 4 passphrase API methods |
| `useDecryptPage.ts` | Read passphrase from `key.privateKeyPassphrase` |
| `useEncryptPage.ts` | Read passphrase from `key.privateKeyPassphrase` |
| `PassphraseField.tsx` | Read passphrase from `key.privateKeyPassphrase` |
| `keyMutationService.ts` | Add `clearAllStoredPassphrases` helper |
| `passphraseSync.test.ts` | Update/remove tests |

### Net reduction
- ~500 lines of server code removed
- ~800 lines of client code removed
- 3 HTTP endpoints removed
- 3 FCM event types consolidated into 1 existing event
- 1 conceptual model unified (passphrases live on keys)
