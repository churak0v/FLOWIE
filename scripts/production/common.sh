#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PROJECT_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/../.." && pwd)
COMPOSE_FILE=${COMPOSE_FILE:-$PROJECT_DIR/compose.production.yml}
ENV_FILE=${ENV_FILE:-$PROJECT_DIR/.env.production}

compose() {
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

require_file() {
  if [ ! -f "$1" ]; then
    echo "Required file not found: $1" >&2
    exit 1
  fi
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Required command not found: $1" >&2
    exit 1
  fi
}

service_is_running() {
  [ -n "$(compose ps --status running -q "$1" 2>/dev/null || true)" ]
}

wait_for_healthy() {
  service=$1
  attempts=${2:-60}
  n=0
  while [ "$n" -lt "$attempts" ]; do
    container_id=$(compose ps -q "$service")
    if [ -n "$container_id" ]; then
      health=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container_id")
      if [ "$health" = healthy ] || [ "$health" = running ]; then
        return 0
      fi
      if [ "$health" = unhealthy ] || [ "$health" = exited ]; then
        echo "$service became $health" >&2
        return 1
      fi
    fi
    n=$((n + 1))
    sleep 2
  done
  echo "Timed out waiting for $service health" >&2
  return 1
}
