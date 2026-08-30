# Purrivacy Docker Deployment Notes

Purrivacy is deployed as a separate Docker Compose project from Pawify. It does not use Dapr. Redis is optional: the default deployment uses process-local rate limiting (`RATE_LIMIT_STORE=memory`); set `RATE_LIMIT_STORE=redis` with `REDIS_URL` (e.g. Upstash/Memorystore) to share rate-limit counters across replicas — see README → Configuration.

### Sharing Pawify's Redis on the same VPS

Purrivacy can reuse the Redis instance Pawify already runs (the `redis:7.4-alpine` service in Pawify's compose). Purrivacy accesses it directly via `ioredis` while Pawify goes through Dapr — both can coexist safely:

- **Key isolation is guaranteed by prefix.** Purrivacy writes only `purrivacy:rl:*` keys; Pawify's Dapr state/lock keys use their own `statestore||*` namespace. Neither can read, overwrite, or be mistaken for the other's keys.

- **Networking:** Pawify's Redis is only `expose`d on its compose network (not published to the host). Purrivacy attaches to it automatically at deploy time: set `PURRIVACY_SHARED_REDIS_NETWORK=pawify_pawify-net` (verify the exact name with `docker network ls | grep pawify` on the VPS) alongside `RATE_LIMIT_STORE=redis`. `scripts/deploy_purrivacy_docker.sh` then generates a compose override attaching purrivacy to that external network, verifies the network exists before deploying, and **fails the deploy** if Redis is unreachable from inside the container. No manual VPS files needed — the attachment is regenerated on every deploy and removed when you stop setting the variable.

- **`REDIS_URL`:** `redis://:<REDIS_PASSWORD>@redis:6379` — same `REDIS_PASSWORD` as Pawify's env, hostname `redis` resolves through the shared network. **If the password contains URL-special characters (`@`, `+`, `:`, `/`, `%`), it must be percent-encoded** (e.g. `@` → `%40`, `+` → `%2B`) or the URL parser will read the wrong host; the deploy-time connectivity check catches this loudly.

- **Capacity note:** Pawify's Redis runs `maxmemory≈128mb` with `allkeys-lru`. Purrivacy's rate-limit keys are tiny and TTL-bounded (15–60 min windows), so their footprint is negligible, but under sustained memory pressure LRU eviction can drop counters (momentarily more lenient limits) and Purrivacy bursts can, in principle, evict Pawify state keys. If cross-service eviction is unacceptable, give Redis more `maxmemory` headroom or run a dedicated instance for Purrivacy.

## Container Hardening

The production service runs with:

- Base image pinned by digest (`node:22-bookworm-slim@sha256:...`) — bump the digest deliberately when patching, and enable automated base-image rebuilds (e.g. Dependabot/Renovate on the Dockerfile).
- `read_only: true` root filesystem with a small tmpfs at `/tmp`.
- All Linux capabilities dropped (`cap_drop: [ALL]`) and `no-new-privileges:true`.
- `init: true` (tini) for PID-1 signal handling and zombie reaping; the image `CMD` runs `node` directly so `SIGTERM` reaches the app's graceful-shutdown path (HTTP close, maintenance stop, rate-limit store close, Sentry flush).
- Non-root `nodeapp` user, loopback-only host binding, memory/CPU/PID limits, read-only secrets mount (pre-existing).

## Host Route

Your VPS-level tunnel or reverse proxy should keep pointing at:

```text
http://127.0.0.1:3002
```

Purrivacy listens on port `3002` inside the container and Docker maps `127.0.0.1:3002 -> purrivacy:3002`.

## VPS Secrets

For GitHub Actions deploys, store the file contents in GitHub environment secrets and the workflow writes them to the VPS on each deploy.

Configure these GitHub environment secrets in `production`:

- `PURRIVACY_ENV_FILE_B64`: base64 of `.env.prod`.
- `PURRIVACY_FIREBASE_SERVICE_ACCOUNT_JSON_B64`: base64 of `firebase-service-account.json`.

Create the base64 values locally:

```bash
base64 -w 0 .env.prod
base64 -w 0 secrets/prod/firebase-service-account.json
```

The workflow decodes them to:

```text
/root/purrivacy-secrets/.env
/root/purrivacy-secrets/firebase-service-account.json
```

The `.env` file should come from `.env.prod.example` and must include real values for:

- `AUTH_EMAIL_DOMAIN`
- `MFA_KEK`
- `GOOGLE_APPLICATION_CREDENTIALS=/var/purrivacy/secrets/firebase-service-account.json` or `FIREBASE_SERVICE_ACCOUNT_JSON`
- Firebase/Sentry values used by production

Recommended permissions:

```bash
chmod 700 /root/purrivacy-secrets
chmod 600 /root/purrivacy-secrets/*
```

## GitHub Actions Deploy

The workflow is `.github/workflows/deploy.yml`.

Pull requests into `main` run:

```text
npm ci
npm run build
docker build
```

Pushes to `main` build and push a GHCR image, then deploy production. Manual workflow runs from `main` do the same.

Docker builds use Buildx with the GitHub Actions cache, so repeated PR and deploy builds can reuse unchanged Docker layers while still producing an image for the exact commit being checked or deployed.

Trunk-based flow:

- Work from `feature/<short-name>`, `fix/<short-name>`, or `hotfix/<short-name>` branches.
- Open pull requests into `main`.
- Keep `main` protected and production-ready.
- There is no `develop` or test deploy branch for Purrivacy.

Configure these GitHub environment or repository secrets:

- `PURRIVACY_VPS_HOST`: VPS hostname or IP.
- `PURRIVACY_VPS_USER`: SSH user on the VPS.
- `PURRIVACY_VPS_SSH_KEY`: private SSH key for that user.
- `PURRIVACY_VPS_PORT`: optional SSH port. Defaults to `22` when empty.

Configure these GitHub repository variables if needed:

- `PURRIVACY_REPO_URL`: optional. Defaults to `https://github.com/<owner>/<repo>.git`.
- `PURRIVACY_SECRET_SOURCE_DIR`: optional. Defaults to `/root/purrivacy-secrets`.

For a private repository, prefer setting `PURRIVACY_REPO_URL` to an SSH URL such as `git@github.com:zig-zag-zig/Purrivacy.git` and install the matching deploy key on the VPS, because the VPS performs the clone/pull.

The workflow uses `GITHUB_TOKEN` to push and pull GHCR images, so repository workflow permissions must allow packages write access.

Docker is installed automatically by the GitHub Actions deploy helper if the VPS is missing Docker or the Compose plugin. Deploy this service through GitHub Actions; the VPS script is an implementation detail used by the workflow after CI has built and pushed a GHCR image.

## Health Check

```bash
cd /srv/purrivacy
docker compose --env-file .env.prod ps
curl http://127.0.0.1:3002/v1/health
```
