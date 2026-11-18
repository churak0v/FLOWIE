#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
. "$SCRIPT_DIR/common.sh"

backup=${1:-}
if [ -z "$backup" ] || [ "${CONFIRM_RESTORE:-}" != "RESTORE_FLOWIE_PRODUCTION" ]; then
  echo "Usage: CONFIRM_RESTORE=RESTORE_FLOWIE_PRODUCTION $0 /absolute/path/to/backup" >&2
  exit 1
fi

case "$backup" in
  /*) ;;
  *) echo "Backup path must be absolute." >&2; exit 1 ;;
esac

require_file "$backup/database.dump"
require_file "$backup/uploads.tar.gz"
require_file "$backup/SHA256SUMS"
(cd "$backup" && sha256sum -c SHA256SUMS)

if ! service_is_running db || ! service_is_running api; then
  echo "Refusing: start the current db and api before restore so a safety backup can be made." >&2
  exit 1
fi

safety_backup=$("$SCRIPT_DIR/backup.sh")
echo "Safety backup created at $safety_backup"

compose stop api
compose exec -T db sh -c 'psql --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" --set ON_ERROR_STOP=1 -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"'
compose exec -T db sh -c 'pg_restore --exit-on-error --no-owner --no-acl --username="$POSTGRES_USER" --dbname="$POSTGRES_DB"' < "$backup/database.dump"
compose run -T --rm --no-deps --entrypoint sh api -c 'find /app/uploads -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +; tar -C /app/uploads -xzf -' < "$backup/uploads.tar.gz"
compose up -d --no-deps api
wait_for_healthy api 60
echo "Restore completed. Run application smoke tests before reopening traffic."
