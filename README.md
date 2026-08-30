# Purrivacy Monorepo

Single repository for the Purrivacy product:

| Path | What it is |
| --- | --- |
| `apps/server` | TypeScript/Express backend API (`purrivacy-api`, hardened Docker deployment, shares the VPS with Pawify) |
| `apps/mobile` | Expo/React Native mobile client (`purrivacy`, local Gradle APK builds + GitHub Releases) |
| `packages/shared` | `@purrivacy/shared` — shared wire-contract types (encrypted payload envelope) consumed by both apps |

## Layout & conventions

- Each package keeps its own `package.json`, `.gitignore`, and lockfile. There are
  **no npm workspaces**: `@purrivacy/shared` is wired in via npm `file:` dependencies
  and symlinked into each app's `node_modules`.
- The root `package.json` is a thin delegation layer only — run everything from
  the repo root (`npm run server -- <script>`, `npm run mobile -- <script>`,
  `npm run verify`, `npm run test`, `npm run dev`, `npm run install:all`).
- Imports of shared code always use the package name — `import type { EncryptedPayload } from '@purrivacy/shared'`.
- Mobile resolves shared from TS source (Metro `react-native` field, vitest alias,
  tsconfig paths); the server consumes built `dist/` + declarations via
  lifecycle `pre*` hooks.

## CI/CD

- `Purrivacy API CI` (`server.yml`): typecheck, Jest, knip dead-code gate,
  production npm audit, Docker image build on PRs. On `main`, a release gate
  deploys **only when `apps/server/package.json` version is bumped** past the
  latest `server-v*` tag; deploys require the `production` environment approval.
- `Purrivacy Mobile CI` (`mobile.yml`): typecheck + tests + APK release reminder
  gate (APKs are built locally; the signing keystore never leaves the dev machine).

The Purrivacy and Pawify backends share one VPS but deploy as fully separate
Compose projects (`purrivacy` vs `pawify`) with isolated secrets and their own
release cadences; Purrivacy can optionally attach to Pawify's Redis for shared
rate limiting (see `apps/server/DEPLOYMENT.md`).

## Related docs

- `apps/server/README.md` — API docs, local development
- `apps/server/DEPLOYMENT.md` — VPS deployment notes
- `apps/mobile/README.md` — app docs, local builds
- `packages/shared/README.md` — shared package notes
