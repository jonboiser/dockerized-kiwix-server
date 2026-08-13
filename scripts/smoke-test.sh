#!/usr/bin/env bash

set -Eeuo pipefail

readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly REPO_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"

IMAGE_NAME="${IMAGE_NAME:-localhost/dockerized-kiwix-server:smoke-test}"
CONTAINER_NAME="${CONTAINER_NAME:-kiwix-smoke-test-$$}"
HOST_PORT="${HOST_PORT:-8080}"
STARTUP_TIMEOUT="${STARTUP_TIMEOUT:-30}"
TUNNEL_TIMEOUT="${TUNNEL_TIMEOUT:-30}"
CLOUDFLARED_BIN="${CLOUDFLARED_BIN:-cloudflared}"
ZIM_FILE="${ZIM_FILE:-}"
KEEP_OPEN=false

container_started=false
tunnel_pid=""
work_dir=""

usage() {
  cat <<'EOF'
Usage: scripts/smoke-test.sh [options]

Build the current Dockerfile with Podman, serve one small ZIM, expose Kiwix
through a Cloudflare quick tunnel, and verify local and public content.

Options:
  --zim PATH       Use PATH instead of the smallest ZIM in ./zims.
  --port PORT      Bind Kiwix to this localhost port (default: 8080).
  --keep-open      Keep the container and tunnel open until Ctrl-C.
  -h, --help       Show this help.

Environment overrides:
  IMAGE_NAME, CONTAINER_NAME, HOST_PORT, STARTUP_TIMEOUT, TUNNEL_TIMEOUT,
  CLOUDFLARED_BIN, ZIM_FILE
EOF
}

log() {
  printf '[smoke-test] %s\n' "$*"
}

fail() {
  printf '[smoke-test] ERROR: %s\n' "$*" >&2
  exit 1
}

cleanup() {
  local exit_code=$?
  set +e

  if [[ -n "$tunnel_pid" ]] && kill -0 "$tunnel_pid" 2>/dev/null; then
    log "Stopping tunnel"
    kill "$tunnel_pid" 2>/dev/null
    wait "$tunnel_pid" 2>/dev/null
  fi

  if [[ "$container_started" == true ]]; then
    log "Removing container $CONTAINER_NAME"
    podman rm --force "$CONTAINER_NAME" >/dev/null 2>&1
  fi

  if [[ -n "$work_dir" && -d "$work_dir" ]]; then
    rm -f -- "$work_dir/local-index.html" "$work_dir/public-content.html" \
      "$work_dir/tunnel.log"
    rmdir -- "$work_dir" 2>/dev/null
  fi

  return "$exit_code"
}

trap cleanup EXIT
trap 'exit 130' INT TERM

smallest_zim() {
  local candidate candidate_size
  local smallest=""
  local smallest_size=""
  local -a zim_files=()

  shopt -s nullglob
  zim_files=("$REPO_ROOT"/zims/*.zim)
  shopt -u nullglob

  for candidate in "${zim_files[@]}"; do
    candidate_size="$(stat --format='%s' "$candidate")"
    if [[ -z "$smallest_size" || "$candidate_size" -lt "$smallest_size" ]]; then
      smallest="$candidate"
      smallest_size="$candidate_size"
    fi
  done

  [[ -n "$smallest" ]] || fail "No .zim files found in $REPO_ROOT/zims"
  printf '%s\n' "$smallest"
}

wait_for_http() {
  local url=$1
  local output_file=$2
  local timeout=$3
  local deadline=$((SECONDS + timeout))

  while (( SECONDS < deadline )); do
    if curl --fail --silent --show-error --location --max-time 10 \
      --output "$output_file" "$url" 2>/dev/null; then
      return 0
    fi
    sleep 1
  done

  return 1
}

wait_for_kiwix() {
  local url=$1
  local output_file=$2
  local timeout=$3
  local deadline=$((SECONDS + timeout))

  while (( SECONDS < deadline )); do
    if curl --fail --silent --show-error --location --max-time 10 \
      --output "$output_file" "$url" 2>/dev/null; then
      return 0
    fi

    if [[ "$(podman inspect --format '{{.State.Running}}' \
      "$CONTAINER_NAME" 2>/dev/null || true)" != true ]]; then
      return 1
    fi

    sleep 1
  done

  return 1
}

while (( $# > 0 )); do
  case "$1" in
    --zim)
      (( $# >= 2 )) || fail "--zim requires a path"
      ZIM_FILE=$2
      shift 2
      ;;
    --port)
      (( $# >= 2 )) || fail "--port requires a value"
      HOST_PORT=$2
      shift 2
      ;;
    --keep-open)
      KEEP_OPEN=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      usage >&2
      fail "Unknown option: $1"
      ;;
  esac
done

command -v podman >/dev/null || fail "podman is required"
command -v curl >/dev/null || fail "curl is required"
command -v "$CLOUDFLARED_BIN" >/dev/null || \
  fail "cloudflared is required (set CLOUDFLARED_BIN to its path)"

[[ "$HOST_PORT" =~ ^[0-9]+$ ]] && (( HOST_PORT >= 1 && HOST_PORT <= 65535 )) || \
  fail "Invalid port: $HOST_PORT"
[[ "$STARTUP_TIMEOUT" =~ ^[1-9][0-9]*$ ]] || fail "Invalid STARTUP_TIMEOUT"
[[ "$TUNNEL_TIMEOUT" =~ ^[1-9][0-9]*$ ]] || fail "Invalid TUNNEL_TIMEOUT"

if [[ -z "$ZIM_FILE" ]]; then
  ZIM_FILE="$(smallest_zim)"
elif [[ "$ZIM_FILE" != /* ]]; then
  ZIM_FILE="$PWD/$ZIM_FILE"
fi

[[ -f "$ZIM_FILE" ]] || fail "ZIM file not found: $ZIM_FILE"
[[ "$ZIM_FILE" == *.zim ]] || fail "Expected a .zim file: $ZIM_FILE"

readonly ZIM_BASENAME="$(basename -- "$ZIM_FILE")"
readonly BOOK_NAME="${ZIM_BASENAME%.zim}"
readonly LOCAL_URL="http://127.0.0.1:$HOST_PORT"

work_dir="$(mktemp -d "${TMPDIR:-/tmp}/kiwix-smoke-test.XXXXXX")"

log "Building $IMAGE_NAME from $REPO_ROOT/Dockerfile"
podman build --tag "$IMAGE_NAME" "$REPO_ROOT"

log "Starting $CONTAINER_NAME with $ZIM_BASENAME"
podman run --detach \
  --name "$CONTAINER_NAME" \
  --volume "$ZIM_FILE:/zims/$ZIM_BASENAME:ro" \
  --publish "127.0.0.1:$HOST_PORT:8080" \
  "$IMAGE_NAME" >/dev/null
container_started=true

log "Waiting for $LOCAL_URL"
if ! wait_for_kiwix "$LOCAL_URL/" "$work_dir/local-index.html" \
  "$STARTUP_TIMEOUT"; then
  podman logs "$CONTAINER_NAME" >&2 || true
  fail "Kiwix did not become ready within ${STARTUP_TIMEOUT}s"
fi

if ! grep -q 'Welcome to Kiwix Server' "$work_dir/local-index.html"; then
  fail "Local endpoint did not return the Kiwix landing page"
fi

log "Starting Cloudflare quick tunnel"
"$CLOUDFLARED_BIN" tunnel --no-autoupdate --url "$LOCAL_URL" \
  >"$work_dir/tunnel.log" 2>&1 &
tunnel_pid=$!

public_url=""
deadline=$((SECONDS + TUNNEL_TIMEOUT))
while (( SECONDS < deadline )); do
  if ! kill -0 "$tunnel_pid" 2>/dev/null; then
    cat "$work_dir/tunnel.log" >&2
    fail "Tunnel process exited before publishing a URL"
  fi

  public_url="$(grep -Eo 'https://[a-z0-9-]+\.trycloudflare\.com' \
    "$work_dir/tunnel.log" | tail -n 1 || true)"
  [[ -z "$public_url" ]] || break
  sleep 1
done

if [[ -z "$public_url" ]]; then
  cat "$work_dir/tunnel.log" >&2
  fail "Tunnel URL was not available within ${TUNNEL_TIMEOUT}s"
fi

readonly PUBLIC_CONTENT_URL="$public_url/content/$BOOK_NAME"
log "Public URL: $public_url"
log "Verifying $PUBLIC_CONTENT_URL"

if ! wait_for_http "$PUBLIC_CONTENT_URL" "$work_dir/public-content.html" \
  "$TUNNEL_TIMEOUT"; then
  cat "$work_dir/tunnel.log" >&2
  fail "ZIM content was not reachable through the tunnel"
fi

if [[ ! -s "$work_dir/public-content.html" ]]; then
  fail "Public ZIM response was empty"
fi

log "PASS: local Kiwix and tunneled ZIM content returned HTTP 2xx"

if [[ "$KEEP_OPEN" == true ]]; then
  log "Container and tunnel will remain open until Ctrl-C"
  while kill -0 "$tunnel_pid" 2>/dev/null; do
    sleep 1
  done
  fail "Tunnel process exited unexpectedly"
fi
