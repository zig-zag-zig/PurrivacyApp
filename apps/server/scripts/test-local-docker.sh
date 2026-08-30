#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
env_file="${PURRIVACY_DOCKER_ENV_FILE:-.env.local}"

cd "$repo_root"

if [[ ! -f "$env_file" ]]; then
  echo "Missing $env_file. Copy .env.local.example to $env_file first." >&2
  exit 2
fi

set -a
# shellcheck disable=SC1090
. "$env_file"
set +a

compose=(docker compose --env-file "$env_file")
health_url="http://${PURRIVACY_HOST_BIND_ADDRESS:-127.0.0.1}:${PURRIVACY_HOST_PORT:-3002}/v1/health"

cleanup() {
  echo
  echo "[docker-test] stopping Purrivacy local Docker stack"
  "${compose[@]}" down --remove-orphans >/dev/null 2>&1 || true
}

trap cleanup EXIT INT TERM

echo "[docker-test] starting Purrivacy local Docker stack"
"${compose[@]}" up -d --build

echo "[docker-test] waiting for $health_url"
deadline=$((SECONDS + 90))
until curl -fsS "$health_url" >/dev/null; do
  if (( SECONDS >= deadline )); then
    echo "[docker-test] timed out waiting for Purrivacy health check" >&2
    "${compose[@]}" ps >&2 || true
    "${compose[@]}" logs --tail=100 purrivacy >&2 || true
    exit 1
  fi
  sleep 2
done

echo "[docker-test] Purrivacy local Docker smoke test passed"
