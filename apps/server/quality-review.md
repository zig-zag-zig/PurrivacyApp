# Deep Code-Quality Review — `refactor/security-remediation` (PR #15)

**Review date:** 2026-08-18 · **Scope:** diff vs `origin/main` (109 files, +5987/−816) · **Authorship:** 8 lanes (W1–W8)
**Lens:** code quality only (DRY/YAGNI/KISS/coupling/test-quality/drift). Security semantics ALREADY signed off — explicitly NOT re-reviewed.
**Note:** report written incrementally; sections appended as investigation proceeds.

---

## 1. Executive assessment

**The refactor is high-quality.** Module discipline held across 8 independently-authored lanes: no god files were created, every new module is small and single-purpose, and tests assert real behavior (not just call counts). There are **no correctness-critical quality issues**. The honest headline: most of the "obvious" refactor targets were evaluated and found to be *already fine* — the two MFA state machines are unified through one runner, the rate-limit store layer is a legitimate strategy pattern with two real implementations, and the hinted DRY extraction (see HQ-03) is **not justified**.

What *is* real: one operational footgun (redis URL silently defaults instead of failing fast, contradicting this PR's own fail-fast philosophy), one visible multi-author drift (error classes scattered across three locations, including one living in a `*Types.ts` file), one stale doc line, and one maintainability nicety (`env.ts` import-time side effects make its 333-line test rely on `jest.resetModules`). None are urgent; all are cheap.

**Evaluated & cleared (no action):** `skipResponse`/`skipSuccessfulRequests` combos (3 real consumers); `RateLimitStore` interface generality (2 real impls + config selection); test mocking depth (meaningful assertions).

## 2. Hotspot verdicts

| File | Lines | Verdict | Rationale |
|---|---:|---|---|
| `src/config/env.ts` | 356 | **split-later** | Cohesive but mixes 3 concerns (generic parsers / domain validators / import-time assembly+side-effects). Import-time execution forces `jest.resetModules()` re-import in its 333-line test. Extract pure parsers+validators; keep thin assembly. Not urgent. |
| `src/features/user/infrastructure/UserKeyRepository.ts` | 252 | **leave-as-is** | 3 RTDB transaction callbacks look repetitive but each encodes distinct semantics (quota / not-found / delete) + the SDK stale-null quirk. Complexity is inherent, not accidental. |
| `src/features/mfa/application/MfaSessionService.ts` | 244 | **leave-as-is** | Already well-factored: both state machines delegate to one `runTransition`. Earlier "two state machines" worry is resolved by the shared runner. Compensation block is dense but cohesive. |
| `src/features/user/infrastructure/userKeys/userKeyRecordSet.ts` | 190 | **leave-as-is** | Clean pure-function domain module (sanitize/convert/cursor/paginate). Good example of the target pattern. |
| `src/api/rate-limit/createRateLimiter.ts` | 175 | **leave-as-is** | Each section is a distinct rate-limit concern. writeHead monkey-patch is inherent. Module-level `fallbackStore` singleton is a minor cosmetic note (acceptable). |
| `src/features/mfa/application/mfaSetupNonce.ts` | 158 | **leave-as-is** | Cohesive. Cross-file DRY with mfaTransitionStore/recovery-codes is the real finding (HQ-03), not this file. |

**Hotspot summary:** none need splitting *now*. Only `env.ts` earns a future split, and it's a maintainability nicety, not a correctness issue. The codebase's module discipline held up across 8 lanes.


## 3. HIGH-VALUE findings

| ID | Sev | Cat | Location | Description | Fix | Effort |
|---|---|---|---|---|---|---|
| HQ-01 | HIGH-VALUE | footgun / consistency | `rateLimitStoreFactory.ts:23` | `RATE_LIMIT_STORE=redis` with no `REDIS_URL` silently defaults to `redis://127.0.0.1:6379` instead of failing fast. `env.ts` fail-fast validates emulator/creds/TRUST_PROXY/Sentry/body-limits but not this — a misconfig surfaces at first request (as 503s via fail-closed), not at startup. Contradicts the fail-fast philosophy this PR introduced. | Add a startup invariant: `rateLimitStore==='redis'` requires `REDIS_URL` (throw in `validateProductionEnvironment`, or at parse time). | S |
| HQ-02 | HIGH-VALUE | multi-author drift / cohesion | `rateLimitTypes.ts:29`, `mfaErrors.ts:21,31` vs `utils/errors.ts` | Error classes split across **3 locations**. W2/W6 put domain errors in the central `utils/errors.ts`; W1 put `RateLimitUnavailableError` in a **types** file; W5 put nonce errors in `mfaErrors.ts`. An error class living in `*Types.ts` is the worst offender. | Consolidate domain errors in `utils/errors.ts`; at minimum move `RateLimitUnavailableError` out of the types module. Pick one rule (central vs feature-dir) and apply it. | S |
| HQ-03 | HIGH-VALUE *(decision)* | DRY — **do NOT extract** | `mfaSetupNonce.ts` / `mfaTransitionStore.ts` | The "hash-keyed TTL'd Firestore doc" pattern *looks* duplicated, but the two real instances have divergent semantics: nonce = single-use + transactional consume + flat record; transition = multi-step map + encrypted results + non-transactional complete. Recovery codes are a third, different shape (array on the user doc). A shared store would need enough options/branches to be worse than the duplication. | **Do nothing.** Record this decision so a future "let's DRY this up" pass doesn't regress it. | S (decision) |

## 4. MEDIUM findings

| ID | Sev | Cat | Location | Description | Fix | Effort |
|---|---|---|---|---|---|---|
| MQ-01 | MEDIUM | maintainability | `env.ts` (356 lines) | Import-time side effects force `jest.resetModules()` + `require()` for every env test (see `env.test.ts:40`). File mixes 3 concerns: generic parsers, domain validators, and assembly+validation. Largest file in `src/`. | Extract pure parse/validate helpers to `envParsers.ts` (no side effects, directly testable); keep a thin `env.ts` that assembles + runs prod validation. | M |
| MQ-02 | MEDIUM | docs drift | `DEPLOYMENT.md:3` | "It does not use Dapr or Redis." contradicts the new optional `RATE_LIMIT_STORE=redis` (README documents it; `.env.*.example` include it). | Soften to "does not **require** Redis; optionally uses it for shared rate limiting." | S |
| MQ-03 | MEDIUM | consistency | TTL constants | Session lifetimes centralized in `core/constants`, but `MFA_TRANSITION_TTL_MS` / `MFA_SETUP_NONCE_TTL_MS` / `FRESH_SESSION_WINDOW_MS` live inline in their feature files. Defensible (TTL near use) but inconsistent. | Optional: leave as-is, or move to `core/constants` for one source of truth. Low value. | S (optional) |

## 5. NITPICKS

| ID | Sev | Cat | Location | Description | Fix | Effort |
|---|---|---|---|---|---|---|
| NQ-01 | NITPICK | YAGNI (acceptable) | `transitionRunner.ts` | Generic runner has exactly 1 caller + 1 store impl. Isolated in `core/` and independently tested (124-line test), so the cost is low — but it *would* be premature if no second transition type ever appears. | Leave. Revisit only if a 2nd workflow emerges. | — |
| NQ-02 | NITPICK | DRY (optional) | `UserKeyRepository.ts` add/update/delete | The 3 RTDB transaction callbacks share a skeleton (pre-check + stale-null branch + committed-check). Extractable, but each encodes distinct semantics and the SDK null-quirk is subtle. | Leave, or extract a small `runRecordSetTransaction` helper at the risk of obscuring RTDB behavior. | S (opt) |
| NQ-03 | NITPICK | style drift | `mfaSetupNonce.ts:24-25` | `MFA_SETUP_NONCE_TTL_MS` exported but `FRESH_SESSION_WINDOW_MS` not — export inconsistency driven by test need. | Fine as-is; cosmetic. | — |
| NQ-04 | NITPICK | test weight | `redisRateLimitStore.test.ts` | Full `ioredis` mock is heavy, but justified (no Redis in unit env) and it asserts script/key/arg correctness. | Leave. | — |

## 6. Implementation slicing & the 80/20

**The 80/20 (≈30 min, one pass):** HQ-01 + HQ-02 + MQ-02. These remove the only footgun, the most visible drift, and the only stale doc line. All are low-risk and behavior-neutral except HQ-01 (which *adds* a desired fail-fast). HQ-03 is a zero-code decision to record.

**Batch A — quick wins (recommended, single simplify pass):**
1. HQ-01: startup invariant "redis store requires REDIS_URL" (env.ts).
2. HQ-02: consolidate error classes → move `RateLimitUnavailableError` out of `rateLimitTypes.ts`; align mfa nonce errors + domain errors under one convention.
3. MQ-02: fix the DEPLOYMENT.md Redis sentence.

**Batch B — optional, separate pass (lower urgency):**
4. MQ-01: split `env.ts` into pure `envParsers.ts` + thin assembly; update `env.test.ts` to call helpers directly (drops most `resetModules` churn).

**Explicitly NOT doing (documented to prevent churn):** HQ-03 store extraction, NQ-01 runner generalization, NQ-02 transaction helper, MQ-03 TTL centralization. These were evaluated and either rejected or deferred; treating them as "leave" is the correct call.

## 7. Pre-existing FYI (max 5 lines)

1. `AuthError` constructor arg order is `(message, details, statusCode)` — reversed relative to `AppError(message, statusCode, details)`. Pre-existing, mildly confusing; leave.
2. `errorMiddleware` parser-error classification (API-ARCH-002) is clean and well-tested — good.
3. Logger redaction is thorough; no secrets leaked into error paths.
4. `tests/passphraseStorage.test.ts` was correctly deleted (referenced removed APIs, never ran).
5. Coverage thresholds are enforced in CI — keep.
