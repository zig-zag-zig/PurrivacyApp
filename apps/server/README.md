# Purrivacy Backend

Purrivacy Backend is the TypeScript/Express API for the Purrivacy app. It handles Firebase-backed user data, application sessions, MFA, account recovery, and Expo push token management.

## Features

- Firebase Admin integration for Auth, Firestore, and Realtime Database
- Versioned REST API under `/v1`
- App-managed access and refresh sessions
- Session revocation, token rotation, and sign-out flows
- TOTP MFA with trusted sessions and recovery codes
- Encrypted user data and key update endpoints
- Expo push token registration and cleanup
- Request logging, request IDs, rate limits, and centralized error responses

## Tech Stack

- Node.js
- TypeScript
- Express
- Firebase Admin SDK
- Expo Server SDK
- OTPAuth

## Related Repositories

- [PurrivacyApp](https://github.com/zig-zag-zig/PurrivacyApp) - Expo/React Native mobile client for this API

## Getting Started

Install dependencies:

```bash
npm install
```

Create your local environment file:

```bash
cp .env.local.example .env
```

Update `.env` with your Firebase and runtime settings. For a bare Node run, point Firebase at a host path instead of the Docker container path. At minimum, provide:

```env
AUTH_EMAIL_DOMAIN=purr.ivacy
MFA_KEK=replace-with-openssl-rand-hex-32
GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/firebase-admin.json
```

You can generate a local MFA key-encryption key with:

```bash
openssl rand -hex 32
```

Start the development server:

```bash
npm run dev
```

With the example env file, the API runs at `http://localhost:3002`. Without `PORT`, the app default is `5000`.

## Docker

Purrivacy can run as its own small Docker Compose project. Keep it separate from Pawify so each app can deploy, restart, roll back, and tune memory without affecting the other one.

For first-time local Docker setup:

```bash
cp .env.local.example .env.local
mkdir -p secrets/local
```

Edit `.env.local` with your local Firebase/runtime values and set `MFA_KEK` to the output of `openssl rand -hex 32`.

Put the Firebase service account here:

```text
secrets/local/firebase-service-account.json
```

Allow the non-root container to read the mounted credential file:

```bash
chmod 755 secrets/local && chmod 644 secrets/local/firebase-service-account.json
```

Then run:

```bash
docker compose --env-file .env.local up -d --build --wait
curl http://127.0.0.1:3002/v1/health
```

For local development with hot reload, use the dev override instead. This mounts `src/` and runs `nodemon` with `ts-node` so code changes restart the server automatically:

```bash
docker compose --env-file .env.local -f docker-compose.yml -f docker-compose.dev.yml up -d --build --wait
curl http://127.0.0.1:3002/v1/health
```

If file changes are not detected inside the container (common on macOS and Windows Docker Desktop), add `CHOKIDAR_USEPOLLING=true` to the `environment` section in `docker-compose.dev.yml`.

If you are running the Purrivacy mobile app on a connected Android device or emulator, forward the backend port so the app can reach the host Docker service:

```bash
adb reverse tcp:3002 tcp:3002
```

Then the app can call http://127.0.0.1:3002 through the reverse proxy.

To run a local Docker smoke test that always stops the stack afterward, even on failure or Ctrl+C:

```bash
npm run test:docker:local
```

Purrivacy local Docker binds `127.0.0.1:3002`. Pawify local Docker uses a different local port, so both backend containers can run at the same time.

To stop local Docker:

```bash
docker compose --env-file .env.local down
```

To stop a hot-reload dev session:

```bash
docker compose --env-file .env.local -f docker-compose.yml -f docker-compose.dev.yml down
```

## Docker Logs

Follow recent local logs:

```bash
docker compose --env-file .env.local logs -f --tail=100 purrivacy
```

Show available logs from the last 14 days:

```bash
docker compose --env-file .env.local logs --since=336h purrivacy
```

For production, use the same commands with `.env.prod`. Docker's disk-efficient `local` logging driver rotates compressed logs in 2 MB chunks, keeps `30` files, and removes the oldest file when the limit is reached. This caps logs at roughly 60 MB before compression. Docker's built-in file drivers cannot guarantee 14 days of retention: `--since=336h` shows any retained logs from that period, but high log volume can rotate them sooner.

For the VPS, create ignored files:

```text
/root/purrivacy-secrets/.env
/root/purrivacy-secrets/firebase-service-account.json
```

The `.env` file should match `.env.prod.example`, with real values for `MFA_KEK`, Firebase, Sentry, and `AUTH_EMAIL_DOMAIN`. Keep:

```env
PURRIVACY_HOST_BIND_ADDRESS=127.0.0.1
PURRIVACY_HOST_PORT=3002
PORT=3002
GOOGLE_APPLICATION_CREDENTIALS=/var/purrivacy/secrets/firebase-service-account.json
```

The normal deploy path is GitHub Actions: pull requests into `main` run CI, and pushes to `main` build a GHCR image and deploy production. The VPS pulls the prebuilt image instead of building it locally.

Configure GitHub secrets:

```text
PURRIVACY_VPS_HOST
PURRIVACY_VPS_USER
PURRIVACY_VPS_SSH_KEY
PURRIVACY_VPS_PORT
PURRIVACY_ENV_FILE_B64
PURRIVACY_FIREBASE_SERVICE_ACCOUNT_JSON_B64
```

Configure GitHub variables if needed:

```text
PURRIVACY_REPO_URL
PURRIVACY_SECRET_SOURCE_DIR
```

Create the base64 secret values locally with `base64 -w 0 .env.prod` and `base64 -w 0 secrets/prod/firebase-service-account.json`. Docker is installed automatically by the GitHub Actions deploy helper if the VPS is missing Docker or the Compose plugin.

After Docker is healthy, the VPS tunnel can keep pointing at `http://127.0.0.1:3002`.

## Environment Variables

| Variable | Required | Description |
| --- | --- | --- |
| `PORT` | No | Server port. Defaults to `5000`. |
| `NODE_ENV` | No | Runtime environment. Defaults to `development`. Production enables strict startup validation (see below). |
| `LOG_LEVEL` | No | Logger level. Defaults to `info`. |
| `TRUST_PROXY` | Yes* | Express `trust proxy` configuration: `true`/`false`, `loopback`, a hop count (`1`, `2`), or comma-separated trusted subnets (`10.0.0.0/8, 127.0.0.1`). Defaults to `false`; **required to be explicitly set in production**. Prefer `loopback` for the documented single-tunnel deployment. |
| `RATE_LIMIT_STORE` | No | Rate limit store: `memory` (default, process-local) or `redis` (shared across replicas). Use `redis` before running multiple instances. |
| `REDIS_URL` | No | Redis connection URL, required when `RATE_LIMIT_STORE=redis`. |
| `RATE_LIMIT_FAIL_CLOSED` | No | When a configured shared store is unavailable: `true` rejects requests on security-critical limiters (503), `false` falls back to a local memory store. Defaults to `true` in production. |
| `ALLOWED_ORIGINS` | No | Comma-separated list of allowed origins for deployments that use CORS at the edge/app layer. |
| `AUTH_EMAIL_DOMAIN` | Yes | Email domain used by the app authentication flow. |
| `GOOGLE_APPLICATION_CREDENTIALS` | Yes* | Absolute path to a Firebase service account JSON file. |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Yes* | Inline Firebase service account JSON. Useful for hosted environments. |
| `FIREBASE_DATABASE_URL` | Yes* | Firebase Realtime Database URL. **Required in production.** |
| `MFA_KEK` | Yes | Hex key used to protect MFA secrets. Exactly 64 hex characters (`openssl rand -hex 32`); **strictly enforced in production**. |
| `RECOVERY_ENUMERATION_PEPPER` | Yes* | Secret used to key fake recovery salts so account existence is not distinguishable. 64 hex characters, distinct from `MFA_KEK` and `RECOVERY_VERIFIER_PEPPER`. **Required in production**; derived per-environment development values are used elsewhere. |
| `RECOVERY_VERIFIER_PEPPER` | Yes* | Secret used to pepper stored recovery verifier hashes (versioned `v1:` format). 64 hex characters, distinct from `MFA_KEK` and `RECOVERY_ENUMERATION_PEPPER`. **Required in production**; derived per-environment development values are used elsewhere. |
| `REQUEST_JSON_LIMIT` | No | JSON body size limit (byte-size string, e.g. `10mb`). Defaults to `10mb`; capped at `15mb` in production. |
| `REQUEST_FORM_LIMIT` | No | URL-encoded form body size limit. Defaults to `1mb`; capped at `2mb` in production. |

`GOOGLE_APPLICATION_CREDENTIALS` or `FIREBASE_SERVICE_ACCOUNT_JSON` must be set. Do not commit Firebase credentials or production secrets.

### Production startup validation

When `NODE_ENV=production`, the server refuses to start unless: `MFA_KEK` and both recovery peppers are exactly 64 hex characters and mutually distinct; `FIREBASE_USE_EMULATOR` is disabled; at least one Firebase service-account source is present and valid; `FIREBASE_DATABASE_URL` is set; `TRUST_PROXY` is explicitly configured; body size limits parse and stay within the caps above; and `SENTRY_DSN` is set whenever `SENTRY_ENABLED=true`.

## Scripts

```bash
npm run dev      # Start the TypeScript dev server
npm test         # Run the Jest test suite
npm run typecheck # Run TypeScript without emitting files
npm run build    # Compile TypeScript into lib/
npm start        # Run the compiled production server
```

## Branching And Releases

Purrivacy uses trunk-based development:

- `main` is the protected production branch.
- Pull requests into `main` run CI.
- Merging or pushing to `main` builds a GHCR image and deploys production.

Working branches:

- `feature/<short-name>` for new behavior.
- `fix/<short-name>` for normal bug fixes.
- `hotfix/<short-name>` for urgent production fixes.

Normal flow:

```bash
git switch main
git pull --ff-only origin main
git switch -c feature/<short-name>
```

Open pull requests from `feature/*` or `fix/*` into `main`. When merged, GitHub Actions runs CI, builds the Docker image, and deploys production.

Hotfix flow:

```bash
git switch main
git pull --ff-only origin main
git switch -c hotfix/<short-name>
```

Open the hotfix pull request into `main`. Once merged, it deploys through the same production pipeline.

There is no `develop` or test deploy branch for Purrivacy.

## API Overview

All current routes are available under `/v1`.

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/v1/health` | Health check |
| `POST` | `/v1/user` | Create a user record after Firebase auth |
| `GET` | `/v1/user` | Read the current encrypted user record |
| `GET` | `/v1/user/key-records` | Read encrypted key records |
| `POST` | `/v1/user/key-records` | Create one encrypted key record |
| `PUT` | `/v1/user/key-records/:recordId` | Update one encrypted key record |
| `DELETE` | `/v1/user/key-records/:recordId` | Delete one encrypted key record |
| `POST` | `/v1/user/change-password` | Update encrypted DEK password data |
| `DELETE` | `/v1/user` | Delete the current user |
| `POST` | `/v1/user/save-push-token` | Register an Expo push token |
| `POST` | `/v1/user/delete-push-token` | Delete an Expo push token |
| `POST` | `/v1/auth/session` | Create an app session from Firebase auth |
| `POST` | `/v1/auth/session/refresh` | Refresh an app session |
| `POST` | `/v1/auth/session/mfa-setup-nonce` | Mint a short-lived, single-use nonce proving fresh authentication (required before MFA setup) |
| `POST` | `/v1/auth/recovery/challenge` | Request account recovery challenge data |
| `POST` | `/v1/auth/recovery/token` | Create a recovery access token |
| `POST` | `/v1/auth/revoke-all-sessions` | Revoke all sessions for the current user |
| `POST` | `/v1/auth/sign-out` | Revoke the current refresh-token family |
| `POST` | `/v1/mfa/setup` | Start MFA setup (requires a fresh-auth nonce from `/v1/auth/session/mfa-setup-nonce`) |
| `POST` | `/v1/mfa/enable` | Verify and enable MFA |
| `POST` | `/v1/mfa/disable` | Disable MFA |
| `POST` | `/v1/mfa/session/trust` | Update MFA trust for the current session family |
| `POST` | `/v1/mfa/recovery-codes/regenerate` | Regenerate MFA recovery codes |
| `GET` | `/v1/mfa/recovery-codes/remaining` | Get remaining recovery code count |

Authenticated endpoints expect a Bearer token in the `Authorization` header. Device-aware session and push-token flows may also require `X-Device-ID`.

## MFA enrollment flow (fresh-authentication requirement)

MFA setup returns the TOTP secret and recovery codes, so a stolen long-lived session token must not be able to start enrollment. MFA enrollment is therefore a two-step flow:

1. `POST /v1/auth/session/mfa-setup-nonce` mints a **short-lived (5 minute), single-use nonce** bound to the current user and session family. Minting requires **fresh primary authentication**: either the session family was created by a Firebase-authenticated login within the last 10 minutes, or — if the account already has MFA enabled — a valid current TOTP/recovery code is provided in the request body (`mfaCode`). Otherwise the server returns `401` and the client must perform a fresh Firebase sign-in.
2. `POST /v1/mfa/setup` with `{ "nonce": "..." }` verifies and atomically consumes the nonce (stored server-side only as a SHA-256 hash), then issues the TOTP secret and recovery codes. Replaying, reusing, or presenting an expired or cross-session nonce returns `401`.

All registered devices receive a best-effort push notification when a nonce is minted, so unexpected enrollment attempts are visible to the account owner.

## Account Recovery

Recovery uses a client-derived PBKDF2 verifier from a **BIP-39 mnemonic**: only app-generated 24-word BIP-39 phrases are supported for account recovery. The server stores only `sha256(verifier)` — never the mnemonic or verifier itself — and the stored value is additionally peppered server-side with `RECOVERY_VERIFIER_PEPPER` and versioned (`v1:<hmac>`); legacy unpeppered hashes continue to verify during migration. Challenge responses for non-existent accounts use a fake salt keyed by `RECOVERY_ENUMERATION_PEPPER`, so account existence is not observable through the challenge endpoint.

## Testing

Run the unit test suite:

```bash
npm test
```

Run the non-emitting TypeScript check:

```bash
npm run typecheck
```

Run the full backend verification, including Firebase emulator integration tests:

```bash
npm run verify
```

Run integration tests only (requires Firebase emulator):

```bash
npm run test:integration
```

Purrivacy Firebase emulator tests use `127.0.0.1:9099`, `127.0.0.1:8080`, and `127.0.0.1:9000`.

### Test inventory

**Unit tests** (`tests/*.test.ts`) — 17 files covering:

| Area | Tests |
|------|-------|
| [`CryptoUtils`](src/utils/cryptoUtils.ts) — encrypt/decrypt, sha256, timingSafeEqual, recovery codes, randomHex | `cryptoUtils.test.ts` |
| MFA code classification (`getMfaCodeKind`) | `mfaCodeFormats.test.ts` |
| RTDB key validation and encode/decode round-trip | `rtdbKeys.test.ts` |
| Firestore date parsing and validation | `firestoreDate.test.ts` |
| Username normalization and Firebase email mapping | `usernameIdentity.test.ts` |
| Notification kind classification and Expo push payloads | `notificationPayloads.test.ts` |
| Logger PII redaction and safeStringify edge cases | `loggerRedaction.test.ts` |
| HTTP error middleware — SyntaxError, entity.too.large, AppError subclasses, headersSent | `httpMiddleware.test.ts` |
| Rate limiter — window reset, count increment, headers, skipSuccessfulRequests | `createRateLimiter.test.ts` |
| Request context middleware — UUID generation, X-Request-ID passthrough, truncation | `requestMiddleware.test.ts` |
| Push token assignment type guards | `pushTokenGuards.test.ts` |
| Environment variable parsing functions | `envParsing.test.ts` |
| Request parsing and validation (existing) | `sessionRequests.test.ts` |
| Session token generation and MFA policy (existing) | `sessionSecurity.test.ts` |
| User key repository CRUD with fake RTDB (existing) | `userKeyRepository.test.ts` |
| Encrypted user data size limits (existing) | `encryptedUserDataValidator.test.ts` |
| Rate-limit key construction and client IP resolution (existing) | `rateLimitKeys.test.ts` |
| Async handler wrapper — error forwarding to next() | `asyncHandler.test.ts` |
| MFA error factory — sensitive/non-sensitive flag | `mfaErrors.test.ts` |

**Service layer tests** (`tests/*.test.ts`) — uses [`fakeFirestore`](tests/helpers/fakeFirestore.ts) and [`fakeRealtimeDatabase`](tests/helpers/fakeRealtimeDatabase.ts) mocks:

| Module | Tests |
|--------|-------|
| Refresh token rotation — expired, revoked, reuse detection, MFA required, success | `rotateRefreshToken.test.ts` |
| Auth middleware — firebase/session methods, missing bearer, token validation, user-not-found cleanup | `authMiddleware.test.ts` |
| MFA recovery codes — regeneration, consumption, auto-regeneration at threshold | `mfaRecoveryCodes.test.ts` |
| Session deletion — single and bulk user session cleanup | `sessionDeletion.test.ts` |
| User key records (integration, emulator) | `userKeyRecords.integration.test.ts` |

## Production Notes

- Run `npm run build` before deploying locally if needed; it runs tests and then compiles TypeScript.
- Docker images compile with `npm run build:unchecked` after GitHub Actions has already run `npm run build`.
- Set `NODE_ENV=production`.
- Production startup enforces strict configuration validation: 64-hex `MFA_KEK` and recovery peppers (mutually distinct), emulators disabled, Firebase credentials + database URL present, `TRUST_PROXY` explicitly set, body limits within caps, and `SENTRY_DSN` when Sentry is enabled.
- Set `TRUST_PROXY=loopback` when the app runs behind a single local tunnel/proxy, or list the exact trusted subnets. Avoid the broad `true` value.
- Rate limits are process-local by default. Before running multiple replicas, set `RATE_LIMIT_STORE=redis` with a shared `REDIS_URL`; security-critical limiters then reject requests (503) when Redis is unavailable (`RATE_LIMIT_FAIL_CLOSED=true`, the production default).
- Prefer environment-managed secrets over files in hosted environments.
- Rotate `MFA_KEK` carefully; existing encrypted MFA secrets depend on it.
- Keep Firebase service account permissions scoped to what the API needs.

## License

This project is licensed under the 0BSD license.
