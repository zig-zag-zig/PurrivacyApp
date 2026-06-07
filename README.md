# Purrivacy App

Purrivacy is a mobile app for keeping OpenPGP keys and encrypted messages manageable on your own device. It is built for people who want practical encryption workflows without treating key management like a command-line chore.

The app pairs with the Purrivacy API, but sensitive key material is encrypted before it is stored or synced.

## What You Can Do

- Generate, import, inspect, and manage OpenPGP public and private keys.
- Encrypt text for one or more recipients.
- Decrypt OpenPGP messages with private-key passphrase support.
- Sign messages and verify signatures.
- Share selected text into the app on Android and iOS and let Purrivacy route it to import, decrypt, or encrypt.
- Protect account access with Firebase authentication, MFA, recovery seeds, biometrics, and local session locking.
- Receive data-only push refreshes and check GitHub Releases for APK updates in sideload builds.

## Privacy And Security Model

- User records are encrypted before backend storage.
- Private keys are never synced as plaintext.
- The data-encryption key is protected by password-derived and recovery-seed-derived material.
- Biometric unlock uses Expo SecureStore and Expo LocalAuthentication.
- Large sensitive local values are encrypted before being stored in Expo SQLite; SecureStore only keeps the small encryption key and small sensitive values.
- Local locking clears cached secrets while preserving valid backend refresh sessions.
- MFA supports authenticator apps, recovery codes, trusted sessions, and extra checks for sensitive actions.

This is application-level protection, not magic. Keep device lock, backups, Firebase settings, signing keys, and backend access locked down too.

## Tech Stack

- Expo SDK 56
- React Native 0.85
- React 19
- TypeScript
- Firebase Authentication
- OpenPGP runtime bundled through the app
- Expo SecureStore, LocalAuthentication, SQLite, Sharing, Notifications, and Task Manager
- Native Android update installer for sideloaded APK updates

## Related Repositories

- [Purrivacy](https://github.com/zig-zag-zig/Purrivacy) - backend API

## Local Development

Install dependencies:

```bash
npm install
```

Create `.env` from the example and point it at your own backend/Firebase setup:

```bash
cp .env.example .env
```

Common values:

```env
EXPO_PUBLIC_API_BASE_URL=https://your-api.example.com/
EXPO_PUBLIC_AUTH_EMAIL_DOMAIN=example.com
EXPO_PUBLIC_API_VERSION=v1
EXPO_PUBLIC_UPDATE_GITHUB_REPO_URL=https://github.com/owner/repo
EXPO_PUBLIC_UPDATE_GITHUB_TOKEN=
```

`EXPO_PUBLIC_*` values are bundled into the client. Do not put private secrets there.

Start the development server:

```bash
npm start
```

Run a native Android development build:

```bash
npm run android
```

Expo Go is not enough for Android update installs or inbound sharing. Use a native development build for the full experience.

## NPM Scripts

Run the app locally:

```bash
npm start
npm run android
npm run ios
```

Check environment injection without starting or building the app:

```bash
npm run env:check:development
npm run env:check:production
npm run env:check:e2e
```

Run the fast local quality gate:

```bash
npm run verify
```

`verify` runs TypeScript checks and the Vitest suite. Android build scripts run this first and stop immediately if it fails.

Run Expo dependency/tooling checks:

```bash
npm run doctor
```

Safely align Expo-managed package versions, then re-run maintenance checks and tests:

```bash
npm run deps:update
```

`deps:update` may change `package.json` or `package-lock.json`; use it when updating packages, not as part of every build.

## Android Builds

Development/debug builds install with the launcher name `Purrivacy Dev`, while production release builds install as `Purrivacy`. Their separate Android package names allow both to be installed side by side.

Build a debug APK:

```bash
npm run build:debug
```

Build and install a debug APK on the main Android profile only:

```bash
npm run build:debug:install
```

Build a production release APK:

```bash
npm run build:release
```

Build and install a production release APK on the main Android profile only:

```bash
npm run build:release:install
```

Install variants use `adb install --user 0`, so they install only into Android's main user/profile.

Use `--clean` when you need a fresh Expo prebuild and Gradle clean:

```bash
npm run build:debug -- --clean
npm run build:debug:install -- --clean
npm run build:release -- --clean
npm run build:release:install -- --clean
```

Use `--dry-run` to preview the commands, selected environment, clean forwarding, APK path, and install steps without running prebuild, Gradle, or ADB:

```bash
npm run build:release -- --dry-run
npm run build:release:install -- --clean --dry-run
```

Dry runs are for checking script behavior before a real build or install. They are not a substitute for `verify`, `doctor`, or a real APK build.

Use one version bump flag when building a new APK version:

```bash
npm run build:release -- --bump-patch
npm run build:release -- --bump-minor
npm run build:release -- --bump-major
```

Patch bumps are for fixes, minor bumps are for normal feature releases, and major bumps are for intentionally larger compatibility/version changes. The build script updates `package.json`, `package-lock.json` when present, `app.json` `expo.version`, and `app.json` `expo.android.versionCode` before Expo prebuild and Gradle run. Combine with `--dry-run` to preview the version change without writing files:

```bash
npm run build:release -- --bump-patch --dry-run
```

Android native files are generated through Expo prebuild and project scripts. Make persistent native changes in the tracked scripts/templates, not directly in ignored `android/` output.

## E2E Testing

Run local Maestro e2e tests against the local backend and Firebase emulators:

```bash
npm run e2e
```

Run only the smoke flow:

```bash
npm run e2e:smoke
```

Forward flags after `--`:

```bash
npm run e2e -- --clean
npm run e2e:smoke -- --clean
npm run e2e -- --dry-run
npm run e2e -- --clean --dry-run
```

`e2e` and `e2e:smoke` run `verify`, build and install the e2e APK, start the local backend/Firebase emulator stack, then run Maestro. Dry-run mode previews the e2e APK build/install path and skips Maestro.

Local e2e runs always target an Android emulator because the e2e APK uses emulator-only `10.0.2.2` service addresses. The runner starts the `PurrivacyPawifyE2E` AVD when no emulator is already running and refuses connected physical devices. Set `PURRIVACY_E2E_AVD=YourAvdName` to use a different AVD, `PURRIVACY_E2E_HEADLESS=true` to start it without a window, or `PURRIVACY_E2E_KEEP_EMULATOR=true` to leave an emulator started by the runner open after tests.

Normal debug and release installs may target a physical phone; only the local e2e runner is emulator-only.

Maestro runs each flow separately so its steps remain visible, continues through flow failures, and prints passed and failed flow totals with their names at the end.

PurrivacyApp e2e uses backend port `5000` and Firebase Auth emulator port `9099`.

## Testing

Run individual checks when you want a tighter loop:

```bash
npm test
npm run typecheck
```

Use `npm run verify` before pushing app logic changes, and use `npm run doctor` after package or Expo SDK changes.

## Project Layout

```text
src/app/        App shell and global state
src/api/        API client, request helpers, and session handling
src/components/ Shared UI components
src/config/     Environment and Firebase setup
src/features/   Feature modules
src/hooks/      Shared React hooks
src/services/   Cross-feature services
src/styles/     Theme and shared styles
scripts/        Build, environment, and native-template scripts
assets/         App icons and bundled runtime assets
```

## Release Notes For Maintainers

- Keep `.env`, Firebase service files, signing credentials, and release tokens out of git.
- Restrict Firebase API keys in Google Cloud/Firebase where possible.
- Back up Android signing credentials in an encrypted vault.
- Review app identifiers, Firebase config, Android signing config, and backend URL before publishing.
- Do not ship private GitHub tokens in public APKs.

## License

This project is licensed under the 0BSD license.
