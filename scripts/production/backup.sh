#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
. "$SCRIPT_DIR/common.sh"

require_file "$ENV_FILE"
if ! service_is_running db || ! service_is_running api; then
  echo "Refusing: db and api must both be running for a consistent online backup." >&2
  exit 1
fi

umask 077
timestamp=$(date -u +%Y%m%dT%H%M%SZ)
backup_root=${BACKUP_DIR:-$PROJECT_DIR/backups}
target=$backup_root/$timestamp
mkdir -p "$target"

compose exec -T db sh -c 'pg_dump --format=custom --no-owner --no-acl --username="$POSTGRES_USER" "$POSTGRES_DB"' > "$target/database.dump"
compose exec -T api tar -C /app/uploads -czf - . > "$target/uploads.tar.gz"

sha256sum "$target/database.dump" "$target/uploads.tar.gz" > "$target/SHA256SUMS"
chmod 600 "$target/database.dump" "$target/uploads.tar.gz" "$target/SHA256SUMS"
echo "$target"
