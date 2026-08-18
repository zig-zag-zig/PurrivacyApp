# Dependency Health

Status of Expo SDK / React Native dependency alignment, remaining doctor findings,
the SDK 57 upgrade outcome, and the production audit triage.

Last updated: after the SDK 57 upgrade (Hermes V1 memory-regression lane, APP-SEC-012).

## Current status

- Expo SDK **57** (`expo@~57.0.14`), React Native **0.86.2**, React 19.2.3.
- Upgraded via the canonical path: `npx expo install expo@^57 --fix` + `npx expo install --fix`,
  then `npm install`. All Expo-managed packages are aligned to the SDK 57 expected versions
  (`expo install --check` is clean). Key moves: all `expo-*` to `~57.0.x`, `react-native`
  0.85.3 → 0.86.2, `react-native-gesture-handler` → `~2.32.0`.
  `react-native-screens` stayed on `~4.26.0` (the SDK 57 version map keeps this line —
  the plan's guess of ~4.27/4.28 did not materialize), as did
  `react-native-safe-area-context` `~5.7.0` and `react-native-webview` 13.16.1.
- `npm run verify` (tsc --noEmit + vitest) passes with the upgraded set: **853/853 tests**
  (74 files) with **zero source changes required** — no API breakage in `expo-file-system`
  (new `File`/`Directory`/`Paths` API unchanged), `expo-clipboard`, `expo-secure-store`,
  `expo-local-authentication`, or react-navigation peers.
- `npm run doctor`: **21/21 checks pass**. The Hermes V1 memory-regression check is gone —
  RN 0.86.2 ships Hermes `250829098.0.16` (first fixed version). `expo install --check` is
  clean. The doctor gate can now be enforced in CI.

### Upgrade note: `sdkVersion` pin in app.json

`app.json` hardcodes `"sdkVersion": "56.0.0"`, which overrides the SDK derived from the
installed `expo` package in `@expo/config`. After `expo@^57` was installed, `expo install
--fix`/`--check` still resolved the project as SDK 56 and reported "Dependencies are up to
date" (a silent no-op). The pin was bumped to `"57.0.0"`; only then did `expo install --fix`
align the remaining packages. Keep this pin in sync on every future SDK bump.

## Remaining doctor findings

None. All 21 expo-doctor checks pass, including:
- SDK package version alignment (Expo-managed packages match SDK 57 expected versions),
- Hermes V1 regression check (fixed by RN 0.86.2 / Hermes `250829098.0.16`),
- native module / config validation, `expo install --check`.

## SDK 57 upgrade follow-ups

Done in this lane: package/lockfile alignment, app.json `sdkVersion` pin, source-level
compatibility (none needed), doctor 21/21, verify 853/853.

Still outstanding (device lane, run separately):
1. **Native regeneration** — android/ and ios/ are generated output; regenerate via the
   repo's prebuild flow (config plugins unchanged, so `app.config.js` needed no edits),
   then rebuild the debug APK (`npm run build:debug`) to validate the dev client.
2. **Runtime validation** — Maestro E2E suite (`npm run e2e:smoke`), release build
   (`npm run build:release`). Exercise Hermes-memory-sensitive flows (large key stores,
   crypto batch operations) since that is the regression being fixed. Watch
   `react-native-quick-crypto` and `@sentry/react-native` native behavior on RN 0.86,
   and `expo-task-manager` / `expo-notifications` background behavior.
3. **Rollback** — the SDK 56 baseline commit (this lane's parent, 673b5d5) is tagged as
   the rollback point; `git revert` the upgrade commit if native regeneration reveals
   issues.

## Production audit triage (`npm audit --omit=dev`)

Post-upgrade: **15 high** (same count as the SDK 56 aligned baseline; composition
unchanged except `react-native-screens` which left the report on SDK 56 alignment).
No new findings introduced by the upgrade. Verdicts:

| Finding | Where it lives | Verdict |
| --- | --- | --- |
| `react-native` (0.86.2) | RN core | **build-toolchain-chain** — flagged via `@react-native/community-cli-plugin` (→ vulnerable `metro`) and a circular `@react-native/virtualized-lists` ↔ `react-native` chain; **no direct advisory on RN core**. The SDK 56 doc's claim that "SDK 57 fixes this" was wrong: 0.86.2 is still flagged and the only `fixAvailable` is a nonsensical downgrade to 0.72.17. Accepted; revisit when upstream narrows the advisory ranges. |
| `@react-native/virtualized-lists` | RN runtime pkg (FlatList) | **build-toolchain-chain** — flagged only for depending on vulnerable `react-native` (circular with the row above); no direct advisory. Accepted. |
| `@react-native/community-cli-plugin` | RN CLI (dev/build) | **build-toolchain-only** — flagged for depending on vulnerable `metro`. |
| `nanoid` (3.3.12) | `@react-navigation/routers@7.6.0` (runtime id generation) + `postcss` (build) | **runtime-reachable in theory, not exploitable in practice** — advisories cover generators called with size 0/negative; react-navigation calls `nanoid()` with default size. Fix is nanoid 5 (ESM-only, breaking for CJS react-navigation) → override high-risk. Accepted, unchanged by SDK 57. |
| `expo` | expo package | **build-toolchain-only** — flagged solely for depending on `@expo/cli`/`@expo/metro`; not in app bundle. |
| `@expo/cli` | Expo CLI (dev/build) | **build-toolchain-only** |
| `@expo/metro` | Bundler (dev/build) | **build-toolchain-only** |
| `@expo/metro-config` | Bundler config (dev/build) | **build-toolchain-only** |
| `metro` | Bundler (dev/build) | **build-toolchain-only** |
| `metro-config` | Bundler config (dev/build) | **build-toolchain-only** |
| `metro-transform-worker` | Bundler worker (dev/build) | **build-toolchain-only** |
| `image-size` | metro image sizing (dev/build) | **build-toolchain-only** — DoS in ICNS/JXL/HEIF parsers, never reached at app runtime |
| `js-yaml` (4.3.0) | `@expo/cli` → `@expo/xcpretty` (dev/build) + firebase-tools/knip (dev) | **build-toolchain-only** — CVE-2026-59870 not backported to 4.x |
| `brace-expansion` (5.0.7) | `expo-updates` → `glob@13` → `minimatch@10` (asset CLI, not app runtime) + `@expo/config` → `glob` | **build-toolchain-only** |
| `postcss` (8.5.15) | `@expo/metro-config` CSS pipeline (dev/build) + vite/vitest (dev) | **build-toolchain-only** |

### Overrides decision

Unchanged: no new `overrides` were added. The only runtime-reachable finding remains
`nanoid` (accepted, see above); every other finding is build-toolchain/dev only and does
not ship in the app bundle. The existing overrides (`tar`, `uuid`, `@opentelemetry/core`,
`@hono/node-server`) are unchanged and still suppress the audit findings they target.
`npm audit fix --force` was deliberately NOT run (would major-bump transitive build deps
for zero runtime benefit); non-breaking fixes exist for some toolchain findings
(`brace-expansion`, `js-yaml`, `postcss`) but were left untouched to keep the SDK 57
lockfile exactly as `expo install --fix` produced it — revisit if the toolchain findings
start to matter.

## CI

The repository has **no CI configuration** (no `.github/workflows`, no GitLab/Azure/
Bitrise/CircleCI/Travis config). Per the remediation plan, no CI was invented. When CI
is introduced, add a job running `npm run doctor` (requires the `.env.development` keys
per `scripts/with-env.cjs` — the check now passes 21/21 and can be a hard gate) and
`npm audit --omit=dev` with the triage above as the accepted-findings baseline.
