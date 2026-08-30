# Purrivacy Backend Security and Architecture Review

**Review date:** 2026-08-18  
**Reviewed revision:** `0decc415`  
**Scope:** TypeScript/Express API, Firebase Admin integration, authentication/session management, MFA, recovery, encrypted-user/key storage, push-token handling, rate limiting, logging/monitoring, Docker/deployment, dependencies, tests, and maintainability.

## Executive summary

The backend has a strong baseline. It uses Firebase ID-token verification with revocation checks, opaque random access/refresh tokens stored only as hashes, refresh-token rotation with reuse detection, session-family revocation, MFA secret encryption, one-time hashed recovery codes, generic recovery errors, strict encrypted-payload validation, direct database deny rules, a non-root runtime container, restricted host binding, structured redacted logging, centralized errors, and extensive unit/integration tests.

No obvious critical authentication bypass, plaintext private-key storage, SQL injection, or direct Firebase client-access issue was found. The strongest parts are session token design, MFA/recovery flow separation, validation, and test coverage.

The main risks are operational and scale-related rather than a basic absence of controls:

1. **High:** Rate limits are process-local, reset on restart, and are not shared across replicas.
2. **High:** Incremental key creation does not enforce the documented 5,000-key limit and uses read/modify/write count refreshes, allowing quota bypass and races.
3. **High:** Firestore batch operations are unbounded even though Firestore batches are limited to 500 writes; revocation/cleanup can fail once enough records accumulate.
4. **Medium:** Recovery uses a deterministic fake salt, making account existence distinguishable to a determined client that compares challenges or already knows/derives the real salt.
5. **Medium:** The application-wide general limiter is defined but never mounted.
6. **Medium:** MFA setup is protected by an access token and a small per-user/device limiter, but does not require fresh password/device authentication or existing MFA verification.
7. **Medium:** Several security-critical production env values are accepted without strong format/production validation.
8. **Medium:** Session/MFA state transitions span multiple non-transactional operations, so partial failure can strand users or leave inconsistent records.

**Overall assessment:** good security architecture with several important production-hardening tasks. The backend is materially safer than average, but rate limiting, Firestore scaling limits, key quotas, and atomic state transitions should be addressed before multi-instance/high-volume operation.

## Severity summary

| Severity | Count | Recommendation |
|---|---:|---|
| Critical | 0 | — |
| High | 3 | Fix before scale-out / high-volume production |
| Medium | 8 | Schedule deliberately |
| Low | 4 | Improve during normal maintenance |

## Threat model used for this review

Attackers may:

- Send arbitrary HTTP requests and malformed/oversized JSON bodies.
- Possess a Firebase ID token, backend access token, refresh token, recovery verifier, MFA code, or stolen device identifier.
- Distribute requests across IPs, processes, replicas, or restarts.
- Race refresh-token, recovery-code, key-record, push-token, MFA, and session operations.
- Create large numbers of sessions/key records within API limits to trigger storage, Firestore, memory, or batch-limit failures.
- Observe response timing/content and rate-limit behavior.
- Compromise an old MFA KEK or production secret and attempt offline attacks against stored data.

Out of scope: Firebase/GCP console IAM, network-edge/tunnel configuration, VPS host hardening, GitHub organization controls, external DAST, and a formal cryptographic proof.

---

# Findings

## API-SEC-001 — High — Rate limiting is process-local and trivially reset or bypassed across replicas

**Evidence**

- `src/api/rate-limit/createRateLimiter.ts:109-143` stores counters in an in-memory `Map` inside each middleware instance.
- Counters disappear on restart/deploy/crash and are not shared across Node processes or containers.
- Limits are partially keyed by IP, user, device, username, or refresh-token hash, which is useful but does not solve distributed enforcement.

**Why this matters**

Authentication, recovery, MFA verification, session creation, and refresh endpoints rely on these limiters for brute-force and abuse resistance. An attacker can multiply allowed attempts by targeting multiple replicas, waiting for deployments/restarts, or distributing requests across source IPs/device IDs. The current production compose file runs one container, but CI/deployment evolution or failover can silently weaken limits.

The `Map` also has no hard cardinality cap. Entries are cleaned every 100 requests only after expiry; high-cardinality traffic can create avoidable memory pressure within the container’s 256 MB limit.

**Required fix**

- Move security-sensitive rate limits to a shared store such as Redis/Memorystore/Upstash with atomic increment/expiry, or enforce them at a trusted gateway/WAF plus an application-level shared store.
- Use layered keys: IP/network, normalized username, user ID, session family, device, and global endpoint budgets.
- Add a maximum key cardinality/eviction strategy even for any retained local fallback.
- Make the app fail conservatively if the shared limiter is unavailable for recovery/MFA endpoints, or define a documented degraded-mode policy.
- Test multi-process behavior and restart persistence.

## API-SEC-002 — High — Incremental key-record creation bypasses the 5,000-key quota and races count updates

**Evidence**

- `src/core/constants/index.ts:19` defines `MAX_KEYS_PER_USER = 5_000`.
- `EncryptedUserDataValidator.sanitizeEncryptedKeys` enforces the limit only for arrays used during initial user creation.
- `src/features/user/infrastructure/UserKeyRepository.ts:95-116` adds a record without checking current count or quota.
- `refreshUserKeyCount` rereads all items and writes `count` afterward. Concurrent additions/deletions can interleave and the count is not used as a transactional guard.

**Why this matters**

Authenticated clients can continue adding records past the documented limit. This increases RTDB cost/storage, expands full-list read/decrypt work on the mobile client, and can be used as a self-DoS or stolen-account resource-abuse vector. Parallel requests can also produce incorrect count metadata.

**Required fix**

- Enforce quota atomically on every add. Use an RTDB transaction over a quota/count node or a server-side reservation pattern.
- Avoid full collection scans to recompute count after every mutation.
- Reject additions at the limit before creating a record; cover concurrent requests in emulator tests.
- Consider a lower practical quota or pagination because the app still downloads/decrypts the entire key set.

## API-SEC-003 — High — Firestore batches are unbounded and will fail above 500 writes

**Evidence**

- `src/features/session/application/sessionDeletion.ts:9-24` queries all sessions/tokens/families for a user and deletes all documents in one batch.
- `src/features/session/application/expiredSessionCleanup.ts:7-24` deletes all expired session records in one batch.
- `src/features/mfa/application/expiredMfaSetupCleanup.ts` does the same for all expired setup records.
- `src/features/session/application/sessionRecordStore.ts:76-92` queues all family sessions/refresh tokens into a caller-provided batch.
- Firestore write batches have a 500-operation limit.

**Why this matters**

A user with enough historical/session records, or a service with enough expired records, can make revocation and cleanup fail. MFA enable/disable calls `revokeAllUserSessions`; account/security operations can therefore fail exactly when reliable revocation is most important. A global cleanup job can repeatedly fail forever once the expired set is large.

**Required fix**

- Page queries and commit chunks below 500 writes (prefer 400–450 for headroom).
- For bulk cleanup, loop until no matching records remain, with bounded work per run and resumable progress.
- For a single session family, enforce small token/session counts by design and still chunk defensively.
- Add tests with >500 fake documents or emulator fixtures.
- Consider Firestore TTL policies for expiry cleanup where appropriate, while retaining explicit revocation logic.

## API-SEC-004 — Medium — Deterministic fake recovery salts allow account-enumeration signals

**Evidence**

- `src/features/auth/recovery/RecoveryAccessService.ts:23-24` derives fake salts as `sha256("recovery:" + username)`.
- Existing users receive their stored random recovery salt; nonexistent/missing users receive the deterministic fake salt.
- Errors from token creation are generic and timing-safe comparison is used, which are positive controls.

**Why this matters**

A client can request the same username multiple times and compare returned values or precompute the deterministic fake salt. If the response differs from the known fake value, the username likely exists. Even without precomputation, account migration or repeated observations may reveal different behavior. This weakens the intended anti-enumeration design.

**Required fix**

Use a server-secret keyed PRF/HMAC for fake salts, e.g. `HMAC(enumerationPepper, normalizedUsername)`, truncated to the correct size. Keep the pepper separate from MFA_KEK. Alternatively store opaque recovery challenge records with uniform behavior. Add timing/response-shape tests for existing and nonexistent users.

## API-SEC-005 — Medium — The global/general limiter is defined but never mounted

**Evidence**

- `src/api/middleware/rateLimiter.ts:25-30` defines `rateLimiter.general`.
- No use of `rateLimiter.general` was found in `app.ts`, `v1Routes.ts`, or route modules.

**Why this matters**

Health checks and endpoint combinations have no aggregate per-IP budget. Route-specific limits help, but attackers can distribute load across paths and methods, and unanticipated future routes may launch without a limiter.

**Required fix**

Mount a conservative general limiter at `/v1` before routes, then retain stricter endpoint-specific limits. Exempt or separately budget the health endpoint used by Docker. Add a test that every non-health route is covered by either general and/or explicit policies.

## API-SEC-006 — Medium — MFA setup does not require fresh authentication or current MFA proof

**Evidence**

- `src/features/mfa/api/mfaRoutes.ts:19-28` protects `/mfa/setup` with a normal backend access token and `sensitiveOperations` limiter only.
- It returns the TOTP secret, provisioning URL, and recovery codes.
- The route is only available when MFA is not already enabled, but a stolen valid access token can begin setup.

**Why this matters**

A stolen access token can initiate MFA enrollment and obtain a new secret/recovery codes, then attempt `/mfa/enable`. The attacker still needs a current TOTP generated from the newly obtained secret, which they possess. Enabling MFA revokes existing backend sessions and creates a new one, potentially helping an attacker lock out the legitimate user. The Firebase password/token security boundary still matters, but MFA enrollment should normally require fresh primary authentication or another strong proof.

**Required fix**

- Require a recent Firebase reauthentication assertion, password-derived challenge, device-bound proof, or short-lived “fresh auth” token for MFA setup/enable.
- If MFA is already enabled, require current MFA proof before replacing/resetting enrollment.
- Notify all registered devices/email channels when MFA setup starts and when it is enabled.
- Add explicit tests for stolen-access-token scenarios.

## API-SEC-007 — Medium — MFA KEK and other production env values lack strict validation

**Evidence**

- `src/config/env.ts:79` only requires `MFA_KEK` to be non-empty.
- Documentation instructs operators to use a 32-byte hex value, but the runtime accepts arbitrary short strings.
- `TRUST_PROXY`, Firebase emulator mode, request body limits, Sentry DSN, and credential configuration are not cross-validated against `NODE_ENV=production`.
- The deploy script rejects missing/placeholders but does not enforce exact KEK format/entropy.

**Why this matters**

A typo such as a short word becomes the AES key input after SHA-256 and is cryptographically much weaker than an actual 256-bit random KEK. Production may accidentally start in emulator mode, with unexpected proxy handling, or with oversized request limits.

**Required fix**

- Require `MFA_KEK` to be exactly 64 hex characters (or versioned base64 of 32 bytes).
- Fail startup in production if Firebase emulators are enabled, credentials/database URL are missing or inconsistent, `TRUST_PROXY` is not explicitly configured for the deployment, or body limits exceed an approved maximum.
- Parse byte-size env values rather than accepting arbitrary strings.
- Add production-config tests.

## API-SEC-008 — Medium — MFA/session transitions are not atomic and can strand users on partial failure

**Evidence**

- `MfaSessionService.enableMfaAndCreateSession` enables MFA, revokes all backend sessions, then creates a new session in separate operations.
- `disableMfaAndCreateSession` similarly disables MFA, revokes, and recreates separately.
- User deletion removes Firestore user/MFA docs first, then RTDB keys/push tokens separately.
- Session revocation deletes backend records, then revokes Firebase refresh tokens, then sends notification.

**Why this matters**

Network/Firebase partial failures can leave MFA enabled with no new backend session, MFA disabled but old sessions in an unexpected state, user data partly deleted, or sessions revoked without notification. Security transitions should fail predictably and be resumable/idempotent.

**Required fix**

- Model transitions as explicit idempotent workflows with operation IDs/status records.
- Perform same-database writes transactionally where possible.
- Make cleanup/revocation retryable and safe to rerun.
- Return a state that allows the client to recover by performing a fresh Firebase-authenticated session creation after MFA state changes.
- Add failure-injection tests between every step.

## API-SEC-009 — Medium — Client IP/rate-limit correctness depends on deployment-specific proxy assumptions

**Evidence**

- `app.ts:11` sets Express `trust proxy` from a boolean env value.
- `clientIp.ts` prefers non-local socket addresses, then manually reads the first `X-Forwarded-For` value only when the socket is localhost.
- Production example sets `TRUST_PROXY=true` and expects a local tunnel/proxy.

**Why this matters**

A boolean `true` trusts every proxy hop Express sees. The custom `getClientIp` implementation only trusts forwarded headers when the immediate address is local, which is safer in the documented topology but can produce `unknown` or the proxy address when deployed differently. Misconfiguration can collapse many users into one rate-limit bucket or trust spoofed forwarding headers.

**Required fix**

- Encode the exact trusted proxy topology (loopback/private subnet/hop count) rather than a broad boolean.
- Use `req.ip`/`req.ips` after a precise Express trust-proxy configuration instead of parallel custom semantics.
- Add startup documentation/tests for the deployed reverse proxy/tunnel.

## API-SEC-010 — Medium — Recovery verifier design is intentionally offline-resistant only to the strength of the mnemonic

**Evidence**

- The client derives a PBKDF2 verifier from the normalized BIP-39 mnemonic and random salt, then the server stores SHA-256 of that derived verifier.
- The recovery endpoint accepts the derived 256-bit verifier, not the mnemonic.

**Assessment**

This is substantially better than storing a plaintext seed or directly hashing it. A stolen database containing salt + verifier hash still permits offline guessing of low-entropy/custom phrases. Generated 256-bit BIP-39 phrases are safe; imported or user-modified phrases are not supported by the normal signup flow, but this invariant should remain explicit.

**Recommended fix**

- State clearly that only app-generated valid 24-word BIP-39 phrases are supported for account recovery.
- Consider server-side peppering of verifier hashes and version the verifier algorithm for future migration.
- Keep the client PBKDF2 cost benchmarked across target devices.

## API-SEC-011 — Medium — Encrypted-data APIs are not paginated and can create application-layer DoS

**Evidence**

- Up to 5,000 key records and 8 MB encrypted transfer size are allowed.
- The key-record GET returns all records; the mobile client fetches and decrypts each record sequentially.
- Each single record may contain up to 1,000,000 base64 characters.

**Why this matters**

Even within configured limits, a compromised account can accumulate data that causes large RTDB reads, response serialization, client memory use, and thousands of sequential decrypt/metadata operations. This is a resource-amplification and availability issue.

**Required fix**

- Add cursor pagination and bounded page size.
- Reduce per-record and total quotas to realistic product requirements.
- Return only changed records using revision timestamps/ETags where possible.
- Add server/client load tests at quota boundaries.

## API-ARCH-001 — Medium — Service facade classes add indirection without consistently defining domain boundaries

**Evidence**

`UserService`, `SessionService`, `MfaService`, and `AuthSessionService` are mostly static facades forwarding to functions. The project also mixes function modules, static classes, route modules, repositories, and application services.

**Why this matters**

The result is not a god-class problem—the largest production file is only ~161 lines—but consistency suffers. It can be unclear whether business invariants belong in a facade, application function, repository, or route. Static classes also make dependency substitution harder than explicit object construction.

**Recommended refactor**

Pick one simple pattern per layer:

- Route/controller: parsing, authentication context, response mapping only.
- Use-case function/service object: business transaction and invariants.
- Repository: persistence only.
- Pure domain validator/policy: no Firebase/network.

Avoid keeping forwarding-only static classes unless they provide a stable public API with meaningful composition.

## API-ARCH-002 — Low — Error logging classifies malformed JSON as an unhandled/server-style error

**Evidence**

`errorMiddleware` logs before checking `SyntaxError`/`entity.too.large`. Integration tests show malformed JSON logged at error level with stack traces even though the response is 400.

**Why this matters**

This creates noisy alerts and can obscure real server failures. It also makes test output unnecessarily noisy.

**Recommended fix**

Classify expected parser errors before selecting log severity. Log concise metadata at warn/info without a stack for routine 4xx input failures.

## API-ARCH-003 — Low — Maintenance cleanup starts one hour late and has no overlap guard

**Evidence**

- `startMaintenanceJobs` calls only `setInterval`; it does not run maintenance immediately.
- `runMaintenance` fires both jobs without awaiting a shared in-progress guard.

**Why this matters**

A restart can leave expired data for another hour, and a slow cleanup can overlap the next run. This becomes more important after cleanup is paginated.

**Recommended fix**

Run once at startup after Firebase initialization, add a mutex/in-progress flag, use bounded batches, and emit duration/outcome metrics.

## API-ARCH-004 — Low — Dead-code/dependency tooling is not fully clean

**Evidence**

- `npx knip` reported unlisted `@jest/globals` in `tests/passphraseStorage.test.ts` and unused export `stopMaintenanceJobs`.

**Recommended fix**

Add the test dependency or remove the import, and either use/export `stopMaintenanceJobs` for graceful shutdown/testing or make it non-exported. Add Knip to CI after the baseline is clean.

## API-OPS-001 — Low — Container hardening is good but can be tightened

**Positive baseline**

The runtime uses a non-root user, local host binding, PID/CPU/memory limits, read-only secrets mount, and a slim base image.

**Recommended additions**

- Set `read_only: true` and provide a small `tmpfs` for required temporary files.
- Drop all Linux capabilities and set `security_opt: ["no-new-privileges:true"]`.
- Pin the base image by digest and use automated rebuilds for security patches.
- Add an explicit init process or verify Node handles signals/child processes adequately.

---

# Positive findings

The following controls are strong and should be retained:

- **Firebase authentication:** ID tokens are verified with revocation checking (`verifyIdToken(..., true)`).
- **Opaque sessions:** 32-byte random access tokens and refresh-token secrets; only SHA-256 hashes are stored.
- **Refresh rotation:** token IDs support lookup, full token hashes are timing-safely compared, used/revoked tokens trigger family revocation, and rotation occurs transactionally.
- **Session families:** device-aware families, revocation, stale-device cleanup, access-token validation against family state, and MFA policy are well separated.
- **MFA secret protection:** TOTP secrets are encrypted with AES-256-GCM; recovery codes are random, hashed, one-time, and consumed transactionally.
- **MFA rate limits:** wrong MFA attempts have a dedicated small limit and successful requests are skipped appropriately.
- **Recovery:** challenge/token endpoints are rate-limited, errors are generic, verifier hashes are timing-safely compared, and only encrypted DEK-seed material is returned.
- **Validation:** encrypted payloads have strict object, base64, hex, IV/tag/salt length, item-count, and total-size checks.
- **Authorization:** user identity comes from verified Firebase/session tokens; user data operations consistently use the authenticated user ID.
- **Direct database denial:** Firestore and RTDB rules deny all client access; only Firebase Admin should access data.
- **Logging:** structured logger aggressively redacts identifiers, tokens, secrets, encrypted fields, IPs, and recovery values; production Error stacks are omitted by the redactor.
- **Error responses:** unexpected 5xx errors are generic and include request IDs; stack traces are not returned.
- **Security headers/CORS:** nosniff/frame-deny headers and an origin allowlist are present. CORS is not an authentication boundary, but the implementation is conservative.
- **Push-token ownership:** token/device/user assignments are normalized and conditionally cleaned up to prevent one user deleting another user’s token mapping.
- **Deployment:** secrets are decoded to `0600`, the service is bound to loopback by default, the container runs as non-root, and direct production deploys are branch-constrained.
- **Testing:** 461 unit tests and 9 Firebase-emulator integration tests passed, covering session rotation/reuse, MFA lifecycle/recovery, auth middleware, encrypted key records, push tokens, error handling, and validators.
- **Dependencies:** `npm audit --omit=dev` reported zero production vulnerabilities in the backend dependency tree at review time.

---

# Recommended remediation order

## Phase 1 — Production abuse/scaling controls

1. Move rate limits to shared durable storage and mount a global limiter.
2. Enforce key quotas atomically on incremental writes.
3. Chunk every Firestore bulk operation below 500 writes.
4. Paginate key records and reduce realistic quotas.

## Phase 2 — Authentication/recovery hardening

1. Replace deterministic fake recovery salts with an HMAC keyed by a separate enumeration pepper.
2. Require fresh primary authentication for MFA setup/enrollment.
3. Strictly validate `MFA_KEK` and production env invariants.
4. Make MFA enable/disable, revocation, deletion, and cleanup workflows idempotent/resumable.

## Phase 3 — Architecture/operations

1. Standardize route/use-case/repository layering and remove forwarding-only facades where they add no value.
2. Add graceful shutdown and maintenance-job overlap protection.
3. Tighten Docker runtime settings and pin images.
4. Clean Knip findings and add dependency/config/security checks to CI.

---

# Validation performed

- `npm run verify` — **passed**: TypeScript and **461/461** Jest unit tests across **62** suites.
- `npm run test:integration` — **passed**: **9/9** Firebase emulator integration tests across **7** suites.
- `npm audit --omit=dev` — **0** production dependency vulnerabilities.
- `npm audit` — 7 dev/transitive findings: 4 high, 3 moderate; mostly Firebase tooling dependency paths and should still be tracked.
- `npx knip` — found one unlisted test dependency and one unused export.
- Secret-name/history scan — no tracked production env files, service account JSON, private keys, or obvious MFA KEK values were found.

## Validation not performed

- No production Docker deployment or remote VPS inspection was run.
- No multi-instance/Redis/gateway rate-limit test was possible because no shared limiter exists.
- No Firebase/GCP IAM, indexes, TTL policies, billing limits, App Check, or console configuration review was possible from source.
- No external DAST, fuzzing, load test, or penetration test was run.

---

# Final verdict

The backend is well structured for its size and avoids the classic “god controller/service” problem. Security-critical concepts—sessions, MFA, recovery, user data, notifications, validation, and repositories—are separated enough to reason about, and the test suite is unusually comprehensive. The main deficiencies arise where in-memory/single-instance assumptions and unbounded Firebase operations meet production scale.

**Release recommendation:** acceptable for controlled single-instance use after reviewing the app-side critical issue, but address **API-SEC-001 through API-SEC-003** before scale-out or allowing large user datasets. Treat MFA fresh-auth and recovery anti-enumeration hardening as the next authentication priorities.