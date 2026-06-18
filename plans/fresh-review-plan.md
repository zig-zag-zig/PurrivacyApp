# Purrivacy — Fresh Structural Review & Refinement Plan

> **Date:** 2026-06-16
> **Scope:** Structural improvements only. No feature changes. Only test pure logic without native module mocking.

---

## 1. Structural Issues Found (This Round)

### 1.1 ❗ `dekStore.ts`: `hasDek` and `hasBiometricDek` are byte-for-byte identical

**File:** [`src/features/security/services/dekStore.ts`](src/features/security/services/dekStore.ts:76-93)

Lines 76-84 (`hasDek`) and 87-93 (`hasBiometricDek`) are the **exact same function**. One is dead code or they were intended to be different but never diverged. Either remove one and alias it, or document why both exist.

**Fix:** Remove `hasBiometricDek`, alias `hasDek` as `hasBiometricDek` (a re-export), or delete one and update all callers.

**Callers of `hasBiometricDek`:**
- `securityService.ts` line 71
- `localAuthSession.ts` line 161
- `signInFlow.ts` line 72, 125

**Callers of `hasDek`:**
- `securityService.ts` line 70
- `userAuthService.ts` line 46

---

### 1.2 ❗ `httpErrorHandler.ts` throws plain objects instead of `AuthFlowError`

**File:** [`src/api/request/httpErrorHandler.ts`](src/api/request/httpErrorHandler.ts:56,61)

Lines 56 and 61 throw plain objects (e.g., `{ sessionError: errorData, status }`, `{ wrongMfaCode: true, ... }`). The catch blocks in:
- `sessionManager.ts` (lines 75,113,195)
- `mfaFlow.test.ts` (line 100)
- `mfaUtils.ts` (line 80)

...all use duck-typing (`error?.wrongMfaCode`, `error?.sessionError`) rather than `instanceof` checks. The `errorGuards.ts` was created specifically to consolidate this, but the plain-object throws remain.

**Fix:** Replace the two plain-object throws in `httpErrorHandler.ts` with `new AuthFlowError(...)` throws. Update the duck-type checks in `sessionManager.ts` and `sessionErrors.ts` to use the shared guard functions from `errorGuards.ts` (which they already import but don't fully use).

---

### 1.3 ❗ `processResponse.ts` uses bare `__DEV__` with no fallback

**File:** [`src/api/request/processResponse.ts`](src/api/request/processResponse.ts:35)

```ts
requestBody: __DEV__ ? body : '[redacted outside dev]',
```

If `__DEV__` is not defined (e.g., in Vitest `node` environment), this throws `ReferenceError`. Our test file works around it with `(globalThis as any).__DEV__ = true;` but this is fragile.

**Fix:** Replace with `typeof __DEV__ !== 'undefined' && __DEV__` or use a config constant from `env.ts`.

---

### 1.4 ❗ `api/client.ts` uses mutable module-level singletons — untestable

**File:** [`src/api/client.ts`](src/api/client.ts:129-138)

```ts
let sessionManager: SessionManager;
const request = createApiRequester(...);
sessionManager = new SessionManager(request);
const userApi = createUserApi(request);
const recoveryApi = createRecoveryApi(request);
const mfaApi = createMfaApi(request, ...);
```

These are initialized at import time, making `ApiClient` impossible to unit test without mocking its entire transitive dependency tree (`SessionManager` → `ApiRequestFn` → fetch → firebase → react-native).

**Fix:** Wrap in a lazy-initialization getter, or make `ApiClient` accept these as constructor parameters. This is a larger refactoring — note it as a follow-up architectural improvement.

---

### 1.5 ❗ `apiRequestFactory.ts` pre-flight MFA creates then discards a session

**File:** [`src/api/core/apiRequestFactory.ts`](src/api/core/apiRequestFactory.ts:39-54)

```ts
if (await isSensitiveAndRequiresMfa(endpoint, method) && !options?.mfaCode) {
    await buildAuthHeaders(requiresAuth, retryOnFailure, createSession, options);  // creates session
    return await handleHttpError(403, { mfaRequiredSensitive: true }, ..., createSession);  // creates another session
}
```

The `buildAuthHeaders` call on line 40 creates a session that is **immediately discarded** when `handleHttpError` redirects to `MfaErrorHandler.handleSensitiveMfaError` (which creates its own session). This is wasteful and adds latency.

**Fix:** Skip the `buildAuthHeaders` call in the pre-flight path. The session will be created inside `handleSensitiveMfaError` when needed.

---

## 2. New Tests — Pure Logic (No Native Module Mocking Needed)

### 2.1 `src/features/auth/services/recoverySeedService.ts` — 8 tests

All functions are pure or depend only on `bip39` and `expo-crypto` (both mockable):
- `generateSeed()` — returns 24-word BIP39 mnemonic
- `normalizeSeedPhrase()` — trims, lowercases, collapses whitespace
- `getThreeUniqueRandomIndices()` — returns 3 unique 1-based indices; throws on seed < 3 words
- `verifySeed()` — validates answers against seed; handles missing answers, empty answers

### 2.2 `src/config/env.ts` parser functions — ~15 tests

Pure validators with no dependencies:
- `parseNumberEnv()` — valid, missing, floor at min, non-finite
- `parseBooleanEnv()` — "true"/"1"/"yes" → true; "false"/"0"/"no" → false; garbage → default
- `ensureTrailingSlash()` — adds slash, doesn't double
- `parseApiBaseUrl()` — validates http/https, adds trailing slash
- `parseAuthEmailDomain()` — valid domain, rejects invalid
- `parseApiVersion()` — "v1", "1"→"v1", strips slashes, rejects v0
- `parseOptionalGitHubRepoUrl()` — null on empty, validates https://github.com, strips .git

### 2.3 `src/api/modalHandler.test.ts` — 6 tests

Pure getter/setter functions:
- Set then get handlers for MFA, recovery codes, passphrase consent
- Setting null clears the handler
- Getting before setting returns null

---

## 3. E2E Test Additions

No new E2E flows needed — 10 flows already cover the critical user journeys.

---

## 4. Execution Order

### Batch 1: Structural Fixes (5 items, ~30 lines changed)
1. Merge `hasDek`/`hasBiometricDek` in `dekStore.ts`
2. Convert plain-object throws to `AuthFlowError` in `httpErrorHandler.ts`
3. Add `__DEV__` guard in `processResponse.ts`
4. Skip redundant `buildAuthHeaders` in `apiRequestFactory.ts` pre-flight MFA path

### Batch 2: Pure-Logic Tests (3 files, ~30 tests)
5. Write `recoverySeedService.test.ts`
6. Write `env.test.ts` expansion (parsers)
7. Write `modalHandler.test.ts`

### Batch 3: Verify
8. Run typecheck + full test suite

---

## 5. Summary

| Category | Count |
|----------|-------|
| New structural issues found | 5 |
| New test files | 3 (~30 tests) |
| Files to modify | 4 (`dekStore.ts`, `httpErrorHandler.ts`, `processResponse.ts`, `apiRequestFactory.ts`) |
| E2E additions | 0 (already sufficient) |
| Follow-up architectural improvements | 1 (`ApiClient` singleton pattern) |
