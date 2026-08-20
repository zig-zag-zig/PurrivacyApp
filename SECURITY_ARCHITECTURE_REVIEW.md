# Purrivacy App Security and Architecture Review

**Review date:** 2026-08-18  
**Reviewed revision:** `1678768`  
**Scope:** React Native/Expo application code, generated-native templates/plugins, authentication and session flows, biometric handling, local secret storage, PGP execution, clipboard/reveal flows, update installation, dependencies, tests, and maintainability.

## Executive summary

The app has a substantially better security baseline than a typical mobile client. In particular, it uses authenticated encryption, a password/recovery-derived key hierarchy, opaque backend sessions, memory-only DEK caching, biometric-gated SecureStore entries, encrypted SQLite overflow storage, backup disabling, Firebase persistence through a SecureStore adapter, conservative logging redaction, direct-database deny rules, and a sizeable automated test suite. The feature-oriented folder layout is also broadly sound.

However, the review found one release-blocking local-secret issue and several important hardening gaps:

1. **Critical:** Android signup writes the recovery seed and account password to ordinary unencrypted `SharedPreferences` during an Activity restart.
2. **High:** The in-app APK updater downloads and opens an APK without verifying an application-controlled signature or digest.
3. **High:** Screen capture/recents protection is absent on Android, so seeds, private keys, decrypted text, recovery codes, and passphrases can be captured.
4. **High:** The UI says saved key passphrases are stored “on this device,” but they are embedded in the encrypted key records and therefore synchronized through the backend.
5. **High:** Sensitive clipboard contents live for three minutes and iOS receives no sensitivity metadata.
6. **Medium:** Biometric-only private-key reveal uses the generic LocalAuthentication prompt and allows device-credential fallback; the policy is not explicit enough for a cryptographic vault.
7. **Medium:** The Expo/React Native dependency set is out of alignment and affected by a known Hermes memory regression; `npm audit --omit=dev` also reports high-severity findings in the mobile tool/runtime dependency tree.

**Overall assessment:** strong intent and many good controls, but **not ready for a high-assurance release until the plaintext signup bridge is removed**. The updater trust model, screenshot protection, and passphrase-storage disclosure should be treated as next-priority security work.

## Severity summary

| Severity | Count | Recommendation |
|---|---:|---|
| Critical | 1 | Block release |
| High | 4 | Fix before the next production release |
| Medium | 9 | Schedule and test deliberately |
| Low | 4 | Improve during normal maintenance |

## Threat model used for this review

This review assumes attackers may have one or more of the following capabilities:

- Obtain a filesystem backup, rooted-device access, ADB/debug access, a crash dump, or a stolen unlocked device.
- Control another app on the device, including clipboard observers, accessibility services, screen-capture tools, overlays, or malicious autofill providers.
- Intercept or alter update metadata/assets through a compromised GitHub account/release process or a dependency/service compromise.
- Steal a backend refresh token, Firebase token, recovery phrase, or MFA recovery code.
- Send malformed or oversized inputs to the app/backend.
- Trigger races around session locking, biometric enrollment changes, key updates, and app background/foreground transitions.

Out of scope: a full formal cryptographic proof, reverse engineering a signed production APK, Firebase/Google Cloud console IAM review, GitHub organization/release-signing controls, device OS compromise resistance, and external penetration testing.

---

# Findings

## APP-SEC-001 — Critical — Signup recovery seed and password are written to plaintext SharedPreferences

**Evidence**

- `src/features/auth/pages/SignupScreen.tsx:91-92` passes the generated BIP-39 seed and account password to `restartActivity(...)`.
- `scripts/autofill-commit-template/AutofillCommitModule.kt:27-33` writes `seed`, `username`, and `password` using `getSharedPreferences(..., MODE_PRIVATE)` and `.putString(...)`.
- `scripts/autofill-commit-template/AutofillCommitModule.kt:65-79` clears the preferences only when JavaScript later consumes the pending signup state.
- The generated ignored file under `android/app/src/main/.../AutofillCommitModule.kt` contains the same implementation; the template is the canonical source.

**Why this matters**

`MODE_PRIVATE` controls other-app access under the normal Android sandbox; it does **not** encrypt the preference XML. Until the next app startup successfully consumes and clears it, the device stores the account password and the full recovery seed in plaintext at rest. A crash, force-stop, process kill, device seizure, root/ADB extraction, debug backup path, or failed restart can extend that exposure indefinitely. The recovery seed can recover the account and unwrap the DEK; the password controls Firebase authentication.

This bypasses the otherwise careful SecureStore/encrypted-SQLite design and is the most serious issue in the app.

**Required fix**

- Remove secret persistence from `SharedPreferences` entirely.
- Prefer eliminating the Activity restart. Navigate directly to seed verification and keep temporary signup secrets in process memory only.
- If a native restart is genuinely unavoidable, store one short-lived encrypted envelope using Android Keystore/SecureStore with `WHEN_UNLOCKED_THIS_DEVICE_ONLY`, include an expiry and one-time nonce, and delete it before returning the value to JavaScript. Do not use an account-wide long-lived key.
- Do not use route params for the password/seed either; place pending signup material in a dedicated ephemeral signup coordinator/context and zero/clear it on cancellation, backgrounding, timeout, and failure.
- Add a native/integration test asserting no password or mnemonic appears in ordinary preferences or files during signup.

## APP-SEC-002 — High — APK updates have no application-controlled authenticity verification

**Evidence**

- `app.json:33-40` permanently requests `REQUEST_INSTALL_PACKAGES`.
- `src/features/updates/services/appUpdateService.ts:170-203` downloads the selected GitHub release asset and immediately opens the package installer.
- No SHA-256 digest, detached signature, pinned release-signing key, provenance verification, or expected Android signing-certificate verification is performed before installation.

**Why this matters**

TLS and Android package-signature checks provide useful protection, and Android should reject an update signed by a different certificate over an existing install. Nevertheless, the app currently delegates the entire update trust decision to GitHub release metadata/assets and the platform installer. A compromised GitHub owner/token/release workflow, malicious asset replacement before publication, or user uninstall/reinstall path can result in installation of an attacker-controlled APK. The app also cannot distinguish a corrupted artifact from the intended release.

**Required fix**

- Publish a signed update manifest containing version, package ID, size, SHA-256, and asset URL.
- Verify the manifest with a public key pinned in the app; then stream-hash the downloaded APK and compare it before invoking the installer.
- Optionally inspect the APK signing certificate and require the expected certificate digest before opening the installer.
- Do not support a private GitHub token in `EXPO_PUBLIC_UPDATE_GITHUB_TOKEN`; anything `EXPO_PUBLIC_*` is recoverable from the APK.
- Consider removing in-app unknown-source installation from store builds and retaining it only in an explicitly sideloaded flavor.

## APP-SEC-003 — High — Sensitive screens are not protected from screenshots, recording, or Android recents snapshots

**Evidence**

- No `FLAG_SECURE`, `expo-screen-capture`, `setRecentsScreenshotEnabled(false)`, or equivalent protection was found in the canonical native scripts/templates or app code.
- Sensitive values are intentionally rendered by `SeedVerification`, `PrivateKeyRevealPanel`, `SecureTextDisplay`, recovery-code screens, and decrypt results.
- `scripts/native-security.js` adds an iOS background privacy cover, which is good, but there is no equivalent Android secure-window policy and no protection while the app is foregrounded.

**Why this matters**

Recovery seeds, private keys, decrypted content, MFA secrets/recovery codes, and generated passphrases can appear in screenshots, screen recordings, and task-switcher thumbnails. This is a common exfiltration path on lost devices and through malicious/over-privileged apps.

**Required fix**

- Apply Android `WindowManager.LayoutParams.FLAG_SECURE` at least while authenticated and on all secret-reveal/recovery/decrypt screens; for a vault app, enabling it globally is defensible.
- Add iOS screen-capture detection and obscure sensitive content while capture/mirroring is active. Keep the existing background cover.
- Add tests/manual verification for screenshots and recents on real Android and iOS devices.
- Consider `HIDE_OVERLAY_WINDOWS`/tapjacking mitigations for high-value confirmation screens where platform support permits.

## APP-SEC-004 — High — Passphrase-storage disclosure says “on this device,” but passphrases are synced to the backend

**Evidence**

- `src/features/security/components/PassphraseStorageConsentModal.tsx:35-38` says: “Autofill saved key passphrases on this device.”
- `src/features/settings/pages/SettingsScreen.tsx:144` similarly describes saved passphrases as device-local.
- `src/features/keys/services/keyRepository.ts:34-42` includes `privateKeyPassphrase` in the normalized key payload before encryption.
- Key records are encrypted with the account DEK and uploaded through `ApiClient`; the backend also stores a global `passphraseStorageEnabled` field and notifies other devices.

**Why this matters**

The backend sees ciphertext rather than plaintext, so this is not a server-side plaintext leak. It is still a material security and consent mismatch: enabling passphrase storage makes each passphrase part of the account-synced encrypted vault, available to other devices that can unwrap the DEK. Users are told it is device-only. This affects informed consent and expands the exposure from one device to all authenticated/recovered devices and server backups of ciphertext.

**Required fix**

Choose and document one model:

1. **Device-only:** store passphrases locally under a separate device-local key, never include `privateKeyPassphrase` in synced key records, and make per-device settings explicit; or
2. **End-to-end encrypted sync:** clearly say passphrases are encrypted and synchronized across the user’s devices, and explain that account password/recovery-seed compromise exposes them.

A separate passphrase-specific KEK and optional biometric gate would reduce coupling to the main DEK.

## APP-SEC-005 — High — Sensitive clipboard lifetime is too long and iOS lacks sensitivity metadata

**Evidence**

- `src/shared/hooks/useSecureCopy.ts:11` sets a fixed three-minute TTL for all copied values.
- The same helper copies recovery seeds, private keys, decrypted plaintext, generated passphrases, MFA secrets, and recovery codes.
- Android sets `ClipDescription.EXTRA_IS_SENSITIVE`, which is good; iOS falls back to `Clipboard.setStringAsync` without local-only/expiration metadata.
- The hook intentionally does not clear on unmount/background and only clears after returning active if the JS timer was suspended.

**Why this matters**

Three minutes is a long exposure window for root secrets. Clipboard content can be read by other apps under platform-dependent conditions, synchronized by ecosystem clipboard features, displayed in keyboard history, or captured before the delayed clear runs. Clearing by replacing the current clipboard can also erase unrelated content the user copied afterward.

**Required fix**

- Use sensitivity classes: e.g. 15–30 seconds for seed/private key/recovery codes/passphrases, longer only for ciphertext/public keys.
- On iOS, add a native clipboard implementation using local-only and expiration options where available.
- Clear only if the clipboard still contains the value or a fingerprint/marker written by this app.
- Offer explicit warnings/confirmation before copying private keys and recovery seeds.
- Prefer share/export flows to trusted destinations rather than clipboard for private keys.

## APP-SEC-006 — Medium — Biometric policy for private-key reveal is ambiguous and permits device-credential fallback

**Evidence**

- `src/features/security/services/biometricSecureStorage.ts:67-71` sets `disableDeviceFallback: false`.
- The generic `authenticateBiometric` path in `src/features/security/services/biometricSecureStorage.ts:185-191` is used for private-key reveal at `src/features/keys/components/KeyItem.tsx:138-158`.
- Expo LocalAuthentication defaults Android `biometricsSecurityLevel` to `weak` unless specified. The SecureStore DEK path is stronger on Android because Expo SecureStore checks `BIOMETRIC_STRONG`, but the standalone reveal prompt has a different policy.

**Why this matters**

The UI says “Unlock with biometrics,” while the implementation can fall back to device PIN/passcode. For private-key display, this should be a deliberate product/security decision. A generic prompt also proves recent device authentication but is not cryptographically bound to the specific private-key data being revealed.

**Required fix**

- Define policy explicitly: either rename it to “Use device authentication,” or require biometrics only with `disableDeviceFallback: true` and `biometricsSecurityLevel: 'strong'` on Android.
- Prefer retrieving a biometric-protected authorization/key handle from SecureStore rather than merely showing a standalone prompt.
- Split `authenticateBiometric` into named policies such as `authenticateForVaultUnlock` and `authenticateForSecretReveal`; avoid one generic method for different assurance levels.
- Add real-device tests for fingerprint/face changes, lockout, passcode fallback, cancellation, enrollment changes, and weak face unlock.

## APP-SEC-007 — Medium — Signup secrets also live in navigation/native bridge state longer than necessary

**Evidence**

- `src/app/navigation/types.ts:6-7` permits passwords and the seed as navigation parameters.
- `src/features/auth/pages/SignupSeedVerificationScreen.tsx:19-23` reads the password and seed from route params.
- The native bridge returns all three values to JavaScript after restart.

**Why this matters**

Even after fixing plaintext preferences, putting secrets into navigation state increases their lifetime and the number of objects retaining them. Navigation state can be inspected by debugging tools and may be serialized by future persistence changes.

**Required fix**

Create a short-lived signup-session object outside navigation state. Route only with a non-secret identifier, clear it on completion/cancel/background/timeout, and never persist it.

## APP-SEC-008 — Medium — Local inactivity lock is not a complete immediate background lock

**Evidence**

- `src/features/security/services/activityService.ts:3-32` uses a 15-minute timer and stores last-active timestamps in a JSON cache file.
- `src/features/auth/hooks/useAppInactivityLock.ts:46-50` does not lock when entering background; it waits until the app returns and then evaluates the elapsed time.
- The DEK remains in the process-level `dekCache` during short background intervals.

**Why this matters**

The privacy cover hides snapshots on iOS, but decrypted state and the DEK remain resident while backgrounded for up to 15 minutes. On compromised/rooted devices or via process-memory acquisition, this widens exposure. It also differs from user expectations for many vault apps.

**Required fix**

- Make lock policy configurable and consider immediate lock on background, or a short grace period measured with monotonic time.
- Clear decrypted React state and the in-memory DEK on memory warnings and security-relevant lifecycle events.
- Document that the current 15-minute lock is a UI/session lock, not guaranteed memory zeroization.

## APP-SEC-009 — Medium — Firebase/session auth state is not biometric-gated

**Evidence**

- `secureAuthStorage` persists Firebase auth state through `SecureStorageModule.setSensitiveValue`, which uses `WHEN_UNLOCKED_THIS_DEVICE_ONLY` but not `requireAuthentication`.
- Backend refresh sessions are likewise stored in the sensitive store without biometric authentication.
- Local lock clears the in-memory access token and DEK, which is good, but valid refresh credentials remain readable whenever the device is unlocked.

**Why this matters**

This design is reasonable for usability and allows biometric unlock to resume a valid session, but it should be recognized as a trust boundary: device-unlock compromise or malicious code running inside the app process can obtain refresh credentials without a biometric prompt. Biometrics protect the DEK, not the entire identity/session state.

**Required fix**

Document the model explicitly. Consider binding refresh-session retrieval to device authentication for a high-security mode, or shorten/restrict refresh-token lifetime and require a fresh Firebase credential after higher-risk transitions.

## APP-SEC-010 — Medium — Hidden WebView cryptography increases attack surface and type-safety risk

**Evidence**

- `src/components/HiddenPGPWebView.tsx` runs the bundled OpenPGP implementation inside a WebView and accepts dynamically injected operation payloads.
- `src/shared/hooks/useHiddenPgpExecutor.ts` serializes arbitrary `operation/data` into injected JavaScript.
- `originWhitelist={['*']}` is broader than necessary even though the source is inline HTML and file/universal access is disabled.
- `PGPExecutor` uses `string` and `any`, so operation/data/result mismatches are not statically checked.

**Why this matters**

The current WebView is fairly well isolated (`domStorageEnabled={false}`, file access disabled, mixed content blocked), but a WebView JS runtime handling private keys and passphrases is a high-value component. Broad operation types and an unrestricted origin policy make future regressions easier.

**Required fix**

- Replace `operation: string, data: any` with a discriminated union mapping each operation to request/response types.
- Set the narrowest feasible origin/navigation policy and reject every navigation/request.
- Add a strict CSP to the inline HTML.
- Evaluate moving OpenPGP execution to a maintained native/JSI implementation or isolated worker model if feasible; do not rewrite solely for aesthetics unless risk/maintenance justifies it.

## APP-SEC-011 — Medium — Local env/secrets files have overly broad filesystem permissions

**Evidence**

- `.env.production`, `.env.development`, `google-services*.json`, and backend `.env.*` files are mode `0664` on the reviewed workstation.
- `credentials.json` is correctly `0600` and is ignored.

**Why this matters**

The production app env currently contains a Sentry upload token and backend env files contain MFA/Firebase configuration. On multi-user systems or permissive group membership, group-readable files unnecessarily expose secrets.

**Required fix**

Set secret-bearing env files and credential files to `0600`, ensure parent directories are private, and add a repository script/check that rejects unsafe permissions in local release/deploy workflows.

## APP-SEC-012 — Medium — Dependency and Expo alignment requires prompt maintenance

**Evidence**

- `npm run doctor` failed two checks.
- Expo Doctor reported the installed Hermes V1 version is affected by a known memory regression and advised Expo SDK 57 / React Native 0.86.2 or later.
- Eleven Expo-managed packages are out of the versions expected by the installed SDK.
- `npm audit --omit=dev` reported 16 high findings in the mobile dependency tree, including direct `expo`, `react-native`, and `react-native-screens` paths. Many are build/toolchain transitive issues rather than directly reachable app code, but they still require triage.

**Required fix**

- First align the current SDK with `npx expo install --check`/the existing `npm run deps:update` workflow and verify native builds.
- Plan the SDK 57 upgrade to receive the Hermes fix.
- Record which audit advisories are build-only, runtime-reachable, overridden, or not applicable; do not accept a perpetually red audit without documentation.
- Add Expo Doctor and production dependency audit to CI.

## APP-ARCH-001 — Medium — Auth orchestration remains a de facto god subsystem

**Evidence**

- `AuthContext.tsx` is ~296 lines and coordinates many state variables and refs.
- `useAuthActions.ts` is ~453 lines with sign-in, sign-out, lock, account deletion, session creation, signup, cleanup, custom-token, and biometric flows.
- `AuthRuntimeRefs`/`AuthStateSetters` are large parameter bags; multiple flows mutate the same refs/state in different modules.

**Why this matters**

The code has already been split better than a single class, but the subsystem still has distributed state-machine behavior without a single explicit state model. It is difficult to prove that every error/cancellation race clears pending passwords, DEKs, Firebase state, session state, lock markers, and UI flags consistently.

**Recommended refactor**

- Define an explicit auth state machine/reducer with states such as bootstrapping, signed-out, Firebase-authenticated, MFA-pending, unlocking, authenticated, locally-locked, signing-out, and deleting.
- Move side effects behind small commands/services and test transition invariants.
- Keep UI context as a thin adapter over the state machine.
- Avoid replacing it with a huge framework; the goal is fewer mutable refs and clearer invariants, not abstraction for its own sake.

## APP-ARCH-002 — Medium — Several UI hooks/components are oversized and dependency-heavy

**Evidence**

Examples over ~400 lines include:

- `PassphraseBannerOverlay.tsx` (~502)
- `usePassphraseFieldController.ts` (~480)
- `AppUpdateModal.tsx` (~460)
- `KeySelectionModal.tsx` (~450)
- `KeyItem.tsx` (~430)
- `InputField.tsx` (~404)
- `SigninScreen.tsx` (~402)

**Why this matters**

Large size alone is not a defect, but these modules mix layout, platform quirks, timing workarounds, state transitions, validation, storage, and security decisions. The multiple suppressed exhaustive-deps warnings in passphrase hooks are a sign that closure behavior is becoming implicit.

**Recommended refactor**

Prioritize by change frequency and security impact:

1. Split `KeyItem` into reveal authorization, key mutation controls, and presentation.
2. Split passphrase banner orchestration into a reducer/state machine plus small effects.
3. Separate `InputField` core behavior from Android isolated-input/autofill adapters.
4. Keep modal visual components dumb; move update orchestration and state out of `AppUpdateModal`.

Do not split purely to meet a line-count target; split around stable responsibilities and test seams.

## APP-ARCH-003 — Low — Type safety is weakest at API, event, modal, and PGP boundaries

**Evidence**

Production code uses many `any` types in `api/runtime.ts`, request/response handling, `ModalContext`, notification parsing, MFA error handling, PGP execution, and several component props.

**Why this matters**

These are precisely the boundaries where malformed remote or native data arrives. Runtime validation exists in parts of the backend but is less systematic in the app.

**Recommended fix**

- Introduce shared DTO types and narrow runtime parsers/type guards for every backend response and notification payload.
- Use discriminated unions for modals, events, and PGP operations.
- Replace broad `catch (error: any)` with `unknown` plus centralized guards.

## APP-ARCH-004 — Low — The generic file-backed `storage` helper is untyped and easy to misuse

**Evidence**

- `src/utils/storage.ts` stores arbitrary `any` in a single JSON file in cache storage.
- Current production usage is mostly non-sensitive, but dev temp keys include real PGP private keys when `__DEV__` and the fixture count are enabled.

**Why this matters**

A generic API does not encode which values are safe for plaintext cache storage. Future callers can accidentally persist secrets. Concurrent writes also rewrite the entire file and have no schema/versioning per key.

**Recommended fix**

Replace it with named stores (`activityMetadataStore`, `pushTokenCache`, `devFixtureStore`, `popularityStore`) and explicit value types. Add “must not contain secrets” documentation/tests. Keep dev fixture keys obviously isolated from production builds.

## APP-ARCH-005 — Low — Dead-code tooling and canonical native-source ownership need cleanup

**Evidence**

- `npx knip --reporter compact` reported three unused script files, then crashed in the compact reporter.
- Android output is intentionally ignored; the real persistent native code is under `scripts/*-template` and config plugins, while developers can still accidentally inspect/edit generated `android/` files.

**Recommended fix**

- Fix Knip configuration/reporter usage and document intentional entry files.
- Add a generated-file banner or verification script that compares generated native modules with templates.
- Remove duplicate/obsolete script files only after confirming they are not config-plugin entry points.

## APP-QUALITY-001 — Low — ErrorBoundary imports monitoring utilities but does not capture the error itself

**Evidence**

`src/components/ErrorBoundary.tsx` imports `captureAppError` and `logger` but has no `componentDidCatch` implementation.

**Why this matters**

`Sentry.wrap` may capture many React errors, but the custom boundary should explicitly report its caught error and component stack, especially if wrapping/configuration changes.

**Recommended fix**

Implement `componentDidCatch(error, info)` with redacted context and a one-shot report. Avoid including props/state that may contain secrets.

---

# Positive findings

The following controls are well designed and should be retained:

- **Key hierarchy:** random 256-bit DEK, PBKDF2-SHA-256 with 600,000 iterations, unique salts, AES-256-GCM with 96-bit IV and 128-bit tag.
- **Recovery:** BIP-39 256-bit mnemonic generation, normalized verifier derivation, server stores only verifier hash and encrypted DEK seed payload.
- **Local sensitive storage:** SecureStore with `WHEN_UNLOCKED_THIS_DEVICE_ONLY`; large values are encrypted with AES-GCM in SQLite while the encryption key remains in SecureStore.
- **Biometric DEK:** DEK is stored with SecureStore `requireAuthentication: true`; biometric enrollment changes invalidate access.
- **Session lock:** DEK cache and in-memory access token are cleared on local lock, while refresh sessions remain available for controlled resume.
- **Backups:** Android backup is disabled in the canonical config plugin.
- **Clipboard on Android:** `EXTRA_IS_SENSITIVE` is set for native copies.
- **Autofill suppression:** sensitive isolated Android fields attempt to suppress autofill and accessibility text leakage.
- **WebView hardening:** file access, universal file access, DOM storage, mixed content, and multiple windows are disabled.
- **Direct database access:** Firestore and Realtime Database rules deny all client reads/writes.
- **Monitoring/logging:** application logger redacts secret-named fields; Sentry has PII disabled and strips user data.
- **Testing:** 604 app tests passed; security storage and session flows have meaningful unit coverage; Maestro flows include biometric unlock, MFA, recovery, session expiry, and crypto round trips.
- **Architecture:** feature-oriented modules, domain/services/state separation, reducers for complex screens, and dependency injection for selected circular-dependency boundaries are all good foundations.

---

# Recommended remediation order

## Phase 0 — Release blocker

1. Remove plaintext signup seed/password persistence from `AutofillCommitModule`.
2. Add regression tests and inspect a generated release build/data directory.
3. Rotate any test/real credentials if this code has been used on shared or compromised devices.

## Phase 1 — High-value security hardening

1. Add signed/digested APK update verification or remove in-app installation from production/store builds.
2. Add Android `FLAG_SECURE` and iOS capture handling.
3. Correct passphrase-storage behavior or consent text.
4. Shorten and classify clipboard TTLs; add a secure iOS clipboard implementation.
5. Make biometric policy explicit for vault unlock and private-key reveal.

## Phase 2 — Reliability and maintainability

1. Align Expo dependencies and upgrade past the Hermes regression.
2. Model auth as an explicit state machine/reducer.
3. Add typed PGP/API/event/modal boundaries.
4. Split the largest mixed-responsibility UI modules.
5. Replace the generic plaintext cache helper with named typed stores.

## Phase 3 — Assurance work

1. Real-device biometric matrix: Android strong/weak modalities, iOS Face ID/Touch ID, enrollment changes, lockouts, passcode fallback, cancellation, reboot, and secure-store invalidation.
2. Mobile security testing using OWASP MASVS/MSTG: backup extraction, rooted device, screenshots, overlays, accessibility, clipboard, deep links/share intents, proxy/TLS, and local database inspection.
3. Signed release-pipeline review covering EAS credentials, Android signing key custody, GitHub release permissions, Sentry upload token handling, and Firebase API-key restrictions.

---

# Validation performed

- `npm run verify` — **passed**: TypeScript and **604/604** Vitest tests across **58** files.
- `npm run doctor` — **failed** with two actionable maintenance findings: Hermes memory regression and 11 Expo package version mismatches.
- `npm audit --omit=dev` — **16 high** findings in the mobile production dependency tree; requires triage/upgrades.
- `npm audit` — 22 total findings: 18 high, 4 moderate.
- `npx knip --reporter compact` — reported unused files/dependency, then the compact reporter crashed; result is informative but not a clean quality gate.
- Secret-name and git-history scan — no tracked `.env.production`, `.env.development`, or `credentials.json`; Firebase client config is tracked as expected and must be restricted in Firebase/Google Cloud.

## Validation not performed

- No APK/AAB build or installation was run.
- No real-device biometric, screenshot, clipboard, rooted-device, or update-install penetration testing was run.
- No Firebase console, EAS account, GitHub organization, Sentry project, or cloud IAM review was possible from source alone.

---

# Final verdict

The app demonstrates serious security engineering effort and already contains many controls that should remain. The architecture is better than the line counts initially suggest: features, domain logic, services, hooks, and reducers are meaningfully separated. The central risks are not a wholesale absence of security; they are a few boundary violations and security-policy ambiguities that undermine the stronger design around them.

**Release recommendation:** block production release until **APP-SEC-001** is fixed and verified. Treat **APP-SEC-002 through APP-SEC-005** as required near-term work for a privacy/cryptographic vault application.