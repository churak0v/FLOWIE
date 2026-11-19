#!/bin/sh
set -eu

APP_DIR=${FLOWIE_APP_DIR:-/srv/flowie/app}
BACKUP_DIR=${FLOWIE_BACKUP_DIR:-/srv/flowie/backups}
KEEP_DAYS=${FLOWIE_BACKUP_KEEP_DAYS:-30}
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
WORK_DIR="$BACKUP_DIR/.incomplete-$STAMP"
FINAL_DIR="$BACKUP_DIR/$STAMP"

case "$BACKUP_DIR" in
  /srv/flowie/backups|/srv/flowie/backups/*) ;;
  *) echo "Refusing unsafe backup directory: $BACKUP_DIR" >&2; exit 2 ;;
esac

umask 077
mkdir -p "$BACKUP_DIR" "$WORK_DIR"
trap 'rm -rf "$WORK_DIR"' EXIT HUP INT TERM

cd "$APP_DIR"
docker compose --env-file .env.production -f compose.production.yml exec -T db \
  sh -lc 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$WORK_DIR/database.dump"
docker compose --env-file .env.production -f compose.production.yml exec -T db \
  pg_restore --list < "$WORK_DIR/database.dump" > /dev/null

docker compose --env-file .env.production -f compose.production.yml exec -T api \
  tar -C /app/uploads -czf - . > "$WORK_DIR/uploads.tar.gz"
tar -tzf "$WORK_DIR/uploads.tar.gz" > /dev/null

(cd "$WORK_DIR" && sha256sum database.dump uploads.tar.gz > SHA256SUMS)
mv "$WORK_DIR" "$FINAL_DIR"
trap - EXIT HUP INT TERM

find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d \
  -name '20??????T??????Z' -mtime "+$KEEP_DAYS" -exec rm -rf -- {} +

echo "Backup created: $FINAL_DIR"
