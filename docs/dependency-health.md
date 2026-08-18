# Dependency Health

Status of Expo SDK / React Native dependency alignment, remaining doctor findings,
the SDK 57 upgrade plan, and the production audit triage.

Last updated: after Phase 2 (dependency alignment lane, APP-SEC-012).

## Current status

- Expo SDK **56** (`expo@~56.0.20`), React Native **0.85.3**, React 19.2.3.
- All Expo-managed packages are aligned to the SDK 56 expected versions via the
  canonical workflow (`npm run deps:update` = `expo install --fix` + doctor + verify).
  Aligned in this lane: `expo` (+9 patch releases: constants, dev-client, file-system,
  local-authentication, notifications, sharing, splash-screen, task-manager, updates)
  and `react-native-screens` 4.25.2 → `~4.26.0`.
- `npm run verify` (tsc --noEmit + vitest) passes with the aligned set: **826/826 tests**.
- `npm run doctor`: **21/22 checks pass**. The single remaining failure is the Hermes V1
  memory-regression check, which **cannot be fixed on SDK 56** (see below).

## Remaining doctor findings

### 1. Hermes V1 memory regression (expo-doctor check "Expo SDK versions affected by Hermes V1 regressions")

- Detected: Hermes V1 `250829098.0.10` (shipped with React Native 0.85.3).
- All Hermes V1 versions `250829098.0.15` and earlier are affected; `250829098.0.16`
  is the first fixed version and ships with **React Native 0.86.2+** / **Expo SDK 57**.
- This is a runtime engine regression (JS heap growth / memory pressure on Android
  Hermes), not a build-tooling issue. It cannot be resolved by any package-level
  override on SDK 56; the fix requires the SDK 57 upgrade.
- Everything else doctor checks (SDK package alignment, native module versions,
  config validation, etc.) passes.

## SDK 57 upgrade plan

Out of scope for this lane (separate future effort). The upgrade should cover:

1. **Packages** — run `npx expo install expo@^57.0.9 --fix` (doctor's own advice), then
   `npm run deps:update` to align all Expo-managed packages to SDK 57 expected versions.
   Expect the full `expo-*` set, `react-native-screens` (~4.27/4.28 line),
   `react-native-safe-area-context`, `expo-dev-client`, and `expo-updates` to move.
2. **React Native version** — SDK 57 pins RN 0.86.x; this is the step that actually
   brings Hermes V1 `0.16` (fixes the remaining doctor finding). RN 0.85 → 0.86 is a
   minor bump; review `react-native` release notes for Android/iOS breaking changes
   (e.g., edge-to-edge enforcement on Android 16, New Architecture defaults).
3. **Native regeneration** — android/ and ios/ are generated from `scripts/*-template/`
   and the config plugins. After the SDK bump, regenerate natives via the repo's
   prebuild flow, update `app.config.js` if SDK 57 changes any plugin options, and
   rebuild the debug APK (`npm run build:debug`) to validate the dev client.
4. **Risk areas** — verify in order: `npm run verify` (tsc + 826 vitest tests),
   `npm run doctor` (must reach 22/22), debug build, Maestro E2E suite
   (`npm run e2e:smoke`), and the release build (`npm run build:release`). Specifically
   exercise Hermes-memory-sensitive flows (large key stores, crypto batch operations)
   since that is the regression being fixed. Watch for: `react-native-quick-crypto`
   and `@sentry/react-native` compatibility with RN 0.86, and any
   `expo-task-manager` / `expo-notifications` background behavior changes.
5. **Rollback** — keep a tagged commit of the SDK 56 baseline (this state) so the
   upgrade can be reverted cleanly; `git revert` the upgrade commit if native
   regeneration reveals issues that block the release.

## Production audit triage (`npm audit --omit=dev`)

Baseline at lane start: **16 high**. After alignment: **15 high** (react-native-screens
fixed by alignment). No new findings introduced. Verdicts:

| Finding | Where it lives | Verdict |
| --- | --- | --- |
| `react-native-screens` | RN screens runtime pkg | **fixed-by-alignment** (4.25.2 → ~4.26.0; no longer reported) |
| `react-native` | RN core (0.85.3) | **runtime-reachable**; flagged via `@react-native/community-cli-plugin` + `@react-native/virtualized-lists` chain; only fix is RN 0.86.2+ (SDK 57). No override possible. |
| `@react-native/virtualized-lists` | RN core runtime pkg (FlatList) | **runtime-reachable**; same root cause as `react-native`; fixed by SDK 57. |
| `nanoid` (3.3.12) | `@react-navigation/routers` (runtime id generation) | **runtime-reachable in theory, not exploitable in practice** — advisories cover generators called with size 0/negative; react-navigation calls `nanoid()` with default size. Fix is nanoid 5 (ESM-only, breaking for CJS react-navigation) → override would be high-risk. Accepted, tracked to SDK 57 (react-navigation 8 may drop nanoid). |
| `expo` | expo package | **build-toolchain-only** — flagged solely for depending on `@expo/cli`/`@expo/metro`; not in app bundle. |
| `@expo/cli` | Expo CLI (dev/build) | **build-toolchain-only** |
| `@expo/metro` | Bundler (dev/build) | **build-toolchain-only** |
| `@expo/metro-config` | Bundler config (dev/build) | **build-toolchain-only** |
| `metro` | Bundler (dev/build) | **build-toolchain-only** |
| `metro-config` | Bundler config (dev/build) | **build-toolchain-only** |
| `metro-transform-worker` | Bundler worker (dev/build) | **build-toolchain-only** |
| `@react-native/community-cli-plugin` | RN CLI (dev/build) | **build-toolchain-only** |
| `image-size` | metro image sizing (dev/build) | **build-toolchain-only** — DoS in ICNS/JXL/HEIF parsers, never reached at app runtime |
| `js-yaml` (4.3.0) | `@expo/xcpretty` inside `@expo/cli` (dev/build) | **build-toolchain-only** — CVE-2026-59870 not backported to 4.x |
| `brace-expansion` (5.0.7) | `expo-updates` → `glob@13` → `minimatch@10` (asset CLI, not app runtime) | **build-toolchain-only** |
| `postcss` (8.5.15) | `@expo/metro-config` CSS pipeline (dev/build) | **build-toolchain-only** |

### Overrides decision

No new `overrides` were added. The only runtime-reachable findings are (a) `react-native` /
`@react-native/virtualized-lists`, which cannot be overridden (RN core pins them) and are
fixed by SDK 57, and (b) `nanoid`, where an override to a fixed major (5.x) is ESM-only
and would break `@react-navigation` — not low-risk. All other findings are build-toolchain
only and do not ship in the app bundle. The existing overrides (`tar`, `uuid`,
`@opentelemetry/core`, `@hono/node-server`) are unchanged and already suppress the
audit findings they target. `npm audit fix --force` was deliberately NOT run (would
major-bump transitive build deps for zero runtime benefit).

## CI

The repository has **no CI configuration** (no `.github/workflows`, no GitLab/Azure/
Bitrise/CircleCI/Travis config). Per the remediation plan, no CI was invented. When CI
is introduced, add a job running `npm run doctor` (note: requires the `.env.development`
keys per `scripts/with-env.cjs`) and `npm audit --omit=dev` with the triage above as the
accepted-findings baseline. Until the SDK 57 upgrade, `npm run doctor` exits non-zero on
the Hermes check — gate on it only after SDK 57, or treat the Hermes check as a known
non-blocking warning in the meantime.
