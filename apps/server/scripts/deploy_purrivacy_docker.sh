#!/usr/bin/env bash
set -Eeuo pipefail

# Purrivacy Docker VPS deployment bootstrapper.
#
# Cloudflare Tunnel / reverse proxy is intentionally outside this Docker stack.
# Existing host route should point to:
#   production: http://127.0.0.1:3002

# This script is intentionally CI-shaped: GitHub Actions builds the app image,
# writes secrets to the VPS, then this script pulls that image and starts the
# single production Compose stack.

APP_DIR="/srv/purrivacy"
APP_USER="purrivacy"
REPO_URL="${PURRIVACY_REPO_URL:-https://github.com/zig-zag-zig/Purrivacy.git}"
REPO_BRANCH="${PURRIVACY_DEPLOY_BRANCH:-main}"
PROD_BRANCH="main"
COMPOSE_PROJECT="purrivacy"
SECRETS_SOURCE_DIR=""
PREBUILT_IMAGE="${PURRIVACY_DEPLOY_IMAGE:-}"
IMAGE_REGISTRY="${PURRIVACY_IMAGE_REGISTRY:-}"
IMAGE_REGISTRY_USER="${PURRIVACY_IMAGE_REGISTRY_USER:-}"
IMAGE_REGISTRY_TOKEN="${PURRIVACY_IMAGE_REGISTRY_TOKEN:-}"

log() { printf '\033[1;34m[INFO]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[WARN]\033[0m %s\n' "$*"; }
err() { printf '\033[1;31m[ERROR]\033[0m %s\n' "$*" >&2; }

usage() {
  cat <<USAGE
Usage: $0 [options]

Options:
  --repo-branch BRANCH          Git branch to checkout/pull. Default: ${REPO_BRANCH}.
  --repo-url URL                Git repo URL. Default: ${REPO_URL}.
  --prebuilt-image IMAGE        Required app image built by CI.
  --secrets-source-dir DIR      Read source files from DIR:
                                  DIR/.env.prod or DIR/.env
                                  DIR/firebase-service-account.json
  --help                        Show this help.

Environment variables:
  PURRIVACY_REPO_URL            Optional repo URL override.
  PURRIVACY_DEPLOY_BRANCH       Optional branch override.
  PURRIVACY_DEPLOY_IMAGE        Required prebuilt app image. Usually set by CI.
  PURRIVACY_IMAGE_REGISTRY      Optional registry for docker login, e.g. ghcr.io.
  PURRIVACY_IMAGE_REGISTRY_USER Optional registry username.
  PURRIVACY_IMAGE_REGISTRY_TOKEN
                                Optional registry token. Avoid printing this.
  PURRIVACY_SHARED_REDIS_NETWORK
                                Optional, read from the env file: external
                                Docker network to attach purrivacy to when
                                RATE_LIMIT_STORE=redis (e.g. pawify_pawify-net
                                to reuse Pawify's Redis on the same VPS).

Example:
  sudo ./scripts/deploy_purrivacy_docker.sh \\
    --repo-branch main \\
    --prebuilt-image ghcr.io/zig-zag-zig/purrivacy:sha-... \\
    --secrets-source-dir /root/purrivacy-secrets
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo-url) REPO_URL="$2"; shift 2 ;;
    --repo-branch|--branch) REPO_BRANCH="$2"; shift 2 ;;
    --prebuilt-image) PREBUILT_IMAGE="$2"; shift 2 ;;
    --secrets-source-dir) SECRETS_SOURCE_DIR="$2"; shift 2 ;;
    --help|-h) usage; exit 0 ;;
    *) err "Unknown option: $1"; usage; exit 2 ;;
  esac
done

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || { err "Missing required command: $1"; exit 1; }
}

as_root_or_sudo() {
  if [[ "${EUID}" -ne 0 ]]; then
    err "Run this script as root, for example with sudo."
    exit 1
  fi
}

sha_file() {
  if [[ -f "$1" ]]; then sha256sum "$1" | awk '{print $1}'; else echo ""; fi
}

copy_source_file() {
  local src="$1"
  local dest="$2"
  local mode="$3"
  local owner="$4"

  if [[ ! -f "$src" ]]; then
    err "Source file does not exist: $src"
    exit 1
  fi

  mkdir -p "$(dirname "$dest")"

  if [[ -f "$dest" && "$(sha_file "$src")" == "$(sha_file "$dest")" ]]; then
    log "unchanged from source: $dest"
    chmod "$mode" "$dest" || true
    chown "$owner" "$dest" || true
    return 0
  fi

  if [[ -f "$dest" ]]; then
    cp -a "$dest" "$dest.bak.$(date -u +%Y%m%dT%H%M%SZ)"
    log "updated from source with backup: $dest"
  else
    log "created from source: $dest"
  fi

  install -m "$mode" -o "${owner%%:*}" -g "${owner##*:}" "$src" "$dest"
}

read_env_value() {
  local file="$1"
  local key="$2"
  local line

  if [[ ! -f "$file" ]]; then
    return 0
  fi

  line="$(grep -m1 "^${key}=" "$file" || true)"
  if [[ -n "$line" ]]; then
    printf '%s\n' "${line#*=}"
  fi
}

replace_or_append_env() {
  local file="$1"
  local key="$2"
  local value="$3"

  if grep -q "^${key}=" "$file"; then
    sed -i "s|^${key}=.*|${key}=${value}|" "$file"
  else
    printf '%s=%s\n' "$key" "$value" >> "$file"
  fi
}

run_as_app_user() {
  if command -v sudo >/dev/null 2>&1; then
    sudo -u "$APP_USER" "$@"
  else
    "$@"
  fi
}

install_docker() {
  log "Installing Docker Engine and Compose plugin from Docker apt repository"
  export DEBIAN_FRONTEND=noninteractive
  rm -f /etc/apt/sources.list.d/docker.list /etc/apt/sources.list.d/docker.sources
  apt-get remove -y docker.io docker-doc docker-compose docker-compose-v2 podman-docker containerd runc >/dev/null 2>&1 || true
  apt-get update
  apt-get install -y ca-certificates curl gnupg git openssl
  install -m 0755 -d /etc/apt/keyrings

  local codename arch docker_os
  # shellcheck disable=SC1091
  . /etc/os-release

  case "${ID:-}" in
    ubuntu)
      docker_os="ubuntu"
      codename="${UBUNTU_CODENAME:-${VERSION_CODENAME:-}}"
      ;;
    debian)
      docker_os="debian"
      codename="${VERSION_CODENAME:-}"
      ;;
    *)
      case " ${ID_LIKE:-} " in
        *" ubuntu "*)
          docker_os="ubuntu"
          codename="${UBUNTU_CODENAME:-${VERSION_CODENAME:-}}"
          ;;
        *" debian "*)
          docker_os="debian"
          codename="${VERSION_CODENAME:-}"
          ;;
        *)
          err "Unsupported OS for Docker apt repo: ${PRETTY_NAME:-unknown}. Install Docker manually or update this script."
          exit 1
          ;;
      esac
      ;;
  esac

  if [[ -z "$codename" ]]; then
    err "Could not detect ${docker_os} codename for Docker apt repo."
    exit 1
  fi

  curl -fsSL "https://download.docker.com/linux/${docker_os}/gpg" -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc

  arch="$(dpkg --print-architecture)"
  cat > /etc/apt/sources.list.d/docker.sources <<EOF_REPO
Types: deb
URIs: https://download.docker.com/linux/${docker_os}
Suites: ${codename}
Components: stable
Architectures: ${arch}
Signed-By: /etc/apt/keyrings/docker.asc
EOF_REPO

  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
  systemctl enable --now containerd
}

validate_args() {
  if [[ -z "$REPO_BRANCH" ]]; then
    err "--repo-branch or PURRIVACY_DEPLOY_BRANCH is required."
    exit 2
  fi

  if [[ -z "$REPO_URL" ]]; then
    err "--repo-url or PURRIVACY_REPO_URL is required."
    exit 2
  fi

  if [[ "$REPO_BRANCH" != "$PROD_BRANCH" ]]; then
    err "Refusing production deploy from branch '$REPO_BRANCH'. Expected '$PROD_BRANCH'."
    exit 2
  fi

  if [[ -z "$PREBUILT_IMAGE" ]]; then
    err "--prebuilt-image or PURRIVACY_DEPLOY_IMAGE is required. Build the image in CI before deploying."
    exit 2
  fi

  if [[ -z "$SECRETS_SOURCE_DIR" ]]; then
    err "--secrets-source-dir is required."
    exit 2
  fi
}

prepare_user_and_dirs() {
  if ! id "$APP_USER" >/dev/null 2>&1; then
    log "Creating system user: $APP_USER"
    useradd --system --create-home --shell /usr/sbin/nologin "$APP_USER"
  fi

  if getent group docker >/dev/null 2>&1; then
    usermod -aG docker "$APP_USER"
  fi

  install -d -m 0750 -o "$APP_USER" -g "$APP_USER" "$APP_DIR"
}

sync_repo() {
  if [[ ! -d "$APP_DIR/.git" ]]; then
    log "Cloning $REPO_URL branch $REPO_BRANCH into $APP_DIR"
    rm -rf "$APP_DIR"
    install -d -m 0750 -o "$APP_USER" -g "$APP_USER" "$APP_DIR"
    run_as_app_user git clone --depth 1 --branch "$REPO_BRANCH" "$REPO_URL" "$APP_DIR"
  else
    log "Updating $APP_DIR to $REPO_BRANCH"
    run_as_app_user git -C "$APP_DIR" remote set-url origin "$REPO_URL"
    run_as_app_user git -C "$APP_DIR" fetch --depth 1 origin "$REPO_BRANCH"
    run_as_app_user git -C "$APP_DIR" checkout -B "$REPO_BRANCH" "origin/$REPO_BRANCH"
    run_as_app_user git -C "$APP_DIR" reset --hard "origin/$REPO_BRANCH"
  fi

  chown -R "$APP_USER:$APP_USER" "$APP_DIR"
}

ensure_runtime_files() {
  local owner="$APP_USER:$APP_USER"
  local env_file="$APP_DIR/.env.prod"
  local secrets_dir="$APP_DIR/secrets/prod"
  local env_source="$SECRETS_SOURCE_DIR/.env.prod"
  local firebase_source="$SECRETS_SOURCE_DIR/firebase-service-account.json"

  install -d -m 0755 -o "$APP_USER" -g "$APP_USER" "$APP_DIR/secrets" "$secrets_dir"

  if [[ ! -f "$env_source" && -f "$SECRETS_SOURCE_DIR/.env" ]]; then
    env_source="$SECRETS_SOURCE_DIR/.env"
  fi

  copy_source_file "$env_source" "$env_file" 0600 "$owner"
  copy_source_file "$firebase_source" "$secrets_dir/firebase-service-account.json" 0644 "$owner"

  replace_or_append_env "$env_file" COMPOSE_PROJECT_NAME "$COMPOSE_PROJECT"
  replace_or_append_env "$env_file" PURRIVACY_ENV_FILE .env.prod
  replace_or_append_env "$env_file" PURRIVACY_IMAGE "$PREBUILT_IMAGE"
  replace_or_append_env "$env_file" PURRIVACY_SECRETS_DIR ./secrets/prod
  replace_or_append_env "$env_file" PURRIVACY_HOST_BIND_ADDRESS 127.0.0.1
  replace_or_append_env "$env_file" PURRIVACY_HOST_PORT 3002
  replace_or_append_env "$env_file" PURRIVACY_LOG_MAX_SIZE 2m
  replace_or_append_env "$env_file" PURRIVACY_LOG_MAX_FILE 30
  replace_or_append_env "$env_file" PURRIVACY_LOG_COMPRESS true
  replace_or_append_env "$env_file" PURRIVACY_MEMORY_LIMIT 256m
  replace_or_append_env "$env_file" PURRIVACY_MEMORY_SWAP_LIMIT 384m
  replace_or_append_env "$env_file" PURRIVACY_MEMORY_RESERVATION 64m
  replace_or_append_env "$env_file" PURRIVACY_CPUS 0.5
  replace_or_append_env "$env_file" PURRIVACY_PIDS_LIMIT 128
  replace_or_append_env "$env_file" PURRIVACY_NODE_OPTIONS --max-old-space-size=128
  replace_or_append_env "$env_file" PORT 3002
  replace_or_append_env "$env_file" APP_ENV production
  replace_or_append_env "$env_file" NODE_ENV production
  replace_or_append_env "$env_file" GOOGLE_APPLICATION_CREDENTIALS /var/purrivacy/secrets/firebase-service-account.json

  chmod 0755 "$APP_DIR/secrets" "$secrets_dir" 2>/dev/null || true
  chmod 0644 "$secrets_dir/firebase-service-account.json" 2>/dev/null || true
  chown -R "$owner" "$APP_DIR/secrets" || true
}

validate_runtime_files() {
  local env_file="$APP_DIR/.env.prod"
  local firebase_path
  local firebase_json
  local mfa_kek
  local auth_email_domain

  if [[ ! -f "$env_file" ]]; then
    err "Missing env file: $env_file"
    exit 1
  fi

  auth_email_domain="$(read_env_value "$env_file" AUTH_EMAIL_DOMAIN)"
  mfa_kek="$(read_env_value "$env_file" MFA_KEK)"
  firebase_path="$(read_env_value "$env_file" GOOGLE_APPLICATION_CREDENTIALS)"
  firebase_json="$(read_env_value "$env_file" FIREBASE_SERVICE_ACCOUNT_JSON)"

  if [[ -z "$auth_email_domain" || "$auth_email_domain" == "purr.ivacy" ]]; then
    warn "AUTH_EMAIL_DOMAIN is currently '$auth_email_domain'. Confirm this is intentional."
  fi

  if [[ -z "$mfa_kek" || "$mfa_kek" == replace-with-* ]]; then
    err "MFA_KEK must be set in $env_file"
    exit 1
  fi

  if [[ -z "$firebase_json" ]]; then
    if [[ "$firebase_path" != "/var/purrivacy/secrets/firebase-service-account.json" ]]; then
      err "GOOGLE_APPLICATION_CREDENTIALS should be /var/purrivacy/secrets/firebase-service-account.json inside Docker"
      exit 1
    fi

    if [[ ! -f "$APP_DIR/secrets/prod/firebase-service-account.json" ]]; then
      err "Missing Firebase service account: $APP_DIR/secrets/prod/firebase-service-account.json"
      exit 1
    fi
  fi

  if [[ -n "$PREBUILT_IMAGE" ]]; then
    replace_or_append_env "$env_file" PURRIVACY_IMAGE "$PREBUILT_IMAGE"
    chown "$APP_USER:$APP_USER" "$env_file" || true
    chmod 0600 "$env_file" || true
  fi
}

docker_registry_login() {
  if [[ -z "$PREBUILT_IMAGE" || -z "$IMAGE_REGISTRY" ]]; then
    return 0
  fi

  if [[ -z "$IMAGE_REGISTRY_USER" || -z "$IMAGE_REGISTRY_TOKEN" ]]; then
    warn "Image registry token/user not provided; attempting docker pull with existing credentials."
    return 0
  fi

  log "Logging Docker in to $IMAGE_REGISTRY as $IMAGE_REGISTRY_USER"
  printf '%s\n' "$IMAGE_REGISTRY_TOKEN" | run_as_app_user docker login "$IMAGE_REGISTRY" -u "$IMAGE_REGISTRY_USER" --password-stdin >/dev/null
}

compose_cmd() {
  local files=("-f" "$APP_DIR/docker-compose.yml")
  if [[ -f "$APP_DIR/docker-compose.shared-redis.yml" ]]; then
    files+=("-f" "$APP_DIR/docker-compose.shared-redis.yml")
  fi
  run_as_app_user docker compose -p "$COMPOSE_PROJECT" --env-file "$APP_DIR/.env.prod" "${files[@]}" "$@"
}

# When RATE_LIMIT_STORE=redis and PURRIVACY_SHARED_REDIS_NETWORK is set (e.g.
# pawify_pawify-net to reuse another stack's Redis on this host), generate a
# compose override attaching purrivacy to that external network. The override
# is regenerated every deploy and removed when no longer applicable, so the
# attachment can never silently rot.
ensure_shared_redis_network() {
  local env_file="$APP_DIR/.env.prod"
  local override_file="$APP_DIR/docker-compose.shared-redis.yml"
  local store network

  store="$(read_env_value "$env_file" RATE_LIMIT_STORE)"
  network="$(read_env_value "$env_file" PURRIVACY_SHARED_REDIS_NETWORK)"

  if [[ "${store,,}" != "redis" ]]; then
    rm -f "$override_file"
    return 0
  fi

  if [[ -z "$network" ]]; then
    warn "RATE_LIMIT_STORE=redis without PURRIVACY_SHARED_REDIS_NETWORK: assuming REDIS_URL is reachable without an extra Docker network."
    rm -f "$override_file"
    return 0
  fi

  if ! docker network inspect "$network" >/dev/null 2>&1; then
    err "Docker network '$network' (PURRIVACY_SHARED_REDIS_NETWORK) does not exist on this host."
    err "Available networks:"
    docker network ls >&2 || true
    err "Set PURRIVACY_SHARED_REDIS_NETWORK to the correct external network name, or clear it if REDIS_URL does not need one."
    exit 1
  fi

  cat > "$override_file" <<'EOF_OVERRIDE'
# Generated by deploy_purrivacy_docker.sh — attaches purrivacy to the shared
# Redis network so REDIS_URL can reach the other stack's Redis instance.
services:
  purrivacy:
    networks:
      - default
      - shared-redis
networks:
  shared-redis:
    external: true
    name: ${PURRIVACY_SHARED_REDIS_NETWORK}
EOF_OVERRIDE
  chown "$APP_USER:$APP_USER" "$override_file"
  chmod 0600 "$override_file"
  log "Attached purrivacy to external Docker network '$network' for shared Redis"
}

# The app connects to Redis lazily, so the health check passes even when Redis
# is unreachable (critical endpoints would then fail closed with 503s). Verify
# real connectivity from inside the container so a bad REDIS_URL or network
# attachment fails the deploy loudly instead of degrading production.
verify_redis_connectivity() {
  local env_file="$APP_DIR/.env.prod"
  local store

  store="$(read_env_value "$env_file" RATE_LIMIT_STORE)"
  if [[ "${store,,}" != "redis" ]]; then
    return 0
  fi

  log "Verifying Redis connectivity from inside the purrivacy container"
  if ! compose_cmd exec -T purrivacy node -e "const Redis=require('ioredis');const c=new Redis(process.env.REDIS_URL,{lazyConnect:true,connectTimeout:5000,maxRetriesPerRequest:1,enableOfflineQueue:false});c.on('error',()=>{});c.connect().then(()=>c.quit()).then(()=>{console.log('redis connectivity verified');process.exit(0)}).catch(e=>{console.error('redis connectivity FAILED:',e.message);process.exit(1)})"; then
    err "Redis is configured (RATE_LIMIT_STORE=redis) but unreachable from the container."
    err "Check REDIS_URL (password must be percent-encoded if it contains URL-special characters) and PURRIVACY_SHARED_REDIS_NETWORK."
    compose_cmd logs --tail=50 purrivacy >&2 || true
    exit 1
  fi
}

wait_for_health() {
  local health_url="http://127.0.0.1:3002/v1/health"
  local deadline=$((SECONDS + 90))

  log "Waiting for Purrivacy health check: $health_url"
  until curl -fsS "$health_url" >/dev/null; do
    if (( SECONDS >= deadline )); then
      err "Purrivacy did not become healthy at $health_url"
      compose_cmd ps >&2 || true
      compose_cmd logs --tail=100 purrivacy >&2 || true
      exit 1
    fi
    sleep 2
  done

  log "Purrivacy health check succeeded"
}

stop_existing_stack() {
  log "Stopping existing $COMPOSE_PROJECT Compose stack if present"
  compose_cmd down --remove-orphans || true
}

start_stack() {
  log "Starting Purrivacy Docker stack"

  docker_registry_login
  compose_cmd config >/dev/null

  log "Pulling prebuilt image: $PREBUILT_IMAGE"
  compose_cmd pull purrivacy
  stop_existing_stack
  compose_cmd up -d --no-build

  compose_cmd ps
  wait_for_health
}

main() {
  validate_args
  as_root_or_sudo
  need_cmd git

  if ! command -v docker >/dev/null 2>&1 \
    || ! docker compose version >/dev/null 2>&1; then
    install_docker
  fi

  need_cmd docker
  need_cmd curl

  prepare_user_and_dirs
  sync_repo
  ensure_runtime_files
  ensure_shared_redis_network
  validate_runtime_files
  start_stack
  verify_redis_connectivity

  log "Purrivacy deployment complete."
}

main "$@"
