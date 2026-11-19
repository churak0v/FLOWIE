#!/bin/sh
set -eu

APP_DIR=${FLOWIE_APP_DIR:-/srv/flowie/app}
cd "$APP_DIR"

compose() {
  docker compose --env-file .env.production -f compose.production.yml "$@"
}

failed=0
for service in db api web admin edge; do
  container_id=$(compose ps -q "$service")
  if [ -z "$container_id" ]; then
    echo "Missing container: $service" >&2
    compose up -d "$service"
    failed=1
    continue
  fi
  health=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container_id")
  if [ "$health" != healthy ] && [ "$health" != running ]; then
    echo "Recovering unhealthy service: $service ($health)" >&2
    compose restart "$service"
    failed=1
  fi
done

for url in https://flowie.art/api/health https://flowie.art/ https://admin.flowie.art/; do
  if ! curl --fail --silent --show-error --max-time 15 --retry 2 "$url" > /dev/null; then
    echo "HTTPS check failed: $url" >&2
    failed=1
  fi
done

exit "$failed"
