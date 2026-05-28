# Purrivacy App

Purrivacy is a mobile app for keeping OpenPGP keys and encrypted messages manageable on your own device. It is built for people who want practical encryption workflows without treating key management like a command-line chore.

The app pairs with the Purrivacy API, but sensitive key material is encrypted before it is stored or synced.

## What You Can Do

- Generate, import, inspect, and manage OpenPGP public and private keys.
- Encrypt text for one or more recipients.
- Decrypt OpenPGP messages with private-key passphrase support.
- Sign messages and verify signatures.
- Share selected text into the app on Android and let Purrivacy route it to import, decrypt, or encrypt.
- Protect account access with Firebase authentication, MFA, recovery seeds, biometrics, and local session locking.
- Receive data-only push refreshes and check GitHub Releases for APK updates in sideload builds.

## Privacy And Security Model

- User records are encrypted before backend storage.
- Private keys are never synced as plaintext.
- The data-encryption key is protected by password-derived and recovery-seed-derived material.
- Biometric unlock uses Android native secure storage and Android Keystore-backed keys.
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
- Native Android secure-storage helpers
- Expo Notifications and Task Manager

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

Expo Go is not enough for this project because the app uses custom native modules.

## Build

Local debug APK:

```bash
npm run build:debug:local
```

Local release APK:

```bash
npm run build:release:local
```

Cloud release build:

```bash
npm run build:release:cloud
```

Android native files are generated through Expo prebuild and project scripts. Make persistent native changes in the tracked scripts/templates, not directly in ignored `android/` output.

## Testing

Run the app test suite:

```bash
npm test
```

Run TypeScript checks:

```bash
npx tsc --noEmit
```

For native Android template changes, regenerate Android and compile Kotlin:

```bash
node scripts/with-env.cjs development -- npx expo prebuild --platform android
cd android
./gradlew -q :app:compileDebugKotlin
```

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
- Review app identifiers, Firebase config, EAS config, and backend URL before publishing.
- Do not ship private GitHub tokens in public APKs.

## License

This project is licensed under the 0BSD license.
