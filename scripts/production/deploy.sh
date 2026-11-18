#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
. "$SCRIPT_DIR/common.sh"

"$SCRIPT_DIR/preflight.sh"

if service_is_running db && service_is_running api; then
  backup_path=$("$SCRIPT_DIR/backup.sh")
  echo "Pre-deploy backup: $backup_path"
else
  echo "No running production stack found; treating this as an initial deployment."
fi

compose build --pull api
compose build --pull web
compose build --pull admin
compose --profile tools run --rm migrate
compose up -d --remove-orphans db api web admin edge

wait_for_healthy db 60
wait_for_healthy api 60
wait_for_healthy web 60
wait_for_healthy admin 60
wait_for_healthy edge 60

echo "Containers are healthy. Complete the HTTPS, Telegram, admin and controlled-order checks in docs/production-deployment.md."
