#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
. "$SCRIPT_DIR/common.sh"

previous_tag=${1:-}
if [ -z "$previous_tag" ] || ! printf '%s' "$previous_tag" | grep -Eq '^[0-9a-f]{40}$'; then
  echo "Usage: $0 PREVIOUS_FULL_GIT_SHA [OPTIONAL_ABSOLUTE_BACKUP_PATH]" >&2
  exit 1
fi

for image in api web admin; do
  if ! docker image inspect "flowie-$image:$previous_tag" >/dev/null 2>&1; then
    echo "Required rollback image is missing: flowie-$image:$previous_tag" >&2
    exit 1
  fi
done

current_backup=$("$SCRIPT_DIR/backup.sh")
echo "Pre-rollback backup: $current_backup"

if [ -n "${2:-}" ]; then
  CONFIRM_RESTORE=RESTORE_FLOWIE_PRODUCTION "$SCRIPT_DIR/restore.sh" "$2"
fi

export RELEASE_TAG=$previous_tag
compose up -d --no-build --remove-orphans api web admin edge
wait_for_healthy api 60
wait_for_healthy web 60
wait_for_healthy admin 60
wait_for_healthy edge 60
echo "Application images rolled back to $previous_tag. Verify schema compatibility and run smoke tests."
