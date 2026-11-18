#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
. "$SCRIPT_DIR/common.sh"

require_command docker
require_file "$ENV_FILE"
require_file "$COMPOSE_FILE"

if stat --version >/dev/null 2>&1; then
  mode=$(stat -c '%a' "$ENV_FILE")
else
  mode=$(stat -f '%Lp' "$ENV_FILE")
fi
case "$mode" in
  600|400) ;;
  *) echo "Refusing: $ENV_FILE permissions are $mode; expected 600 or 400." >&2; exit 1 ;;
esac

if grep -Eq '(^|=)(change-me|replace-with[^[:space:]]*)($|[[:space:]])' "$ENV_FILE"; then
  echo "Refusing: placeholder values remain in $ENV_FILE." >&2
  exit 1
fi

if ! grep -Eq '^RELEASE_TAG=[0-9a-f]{40}$' "$ENV_FILE"; then
  echo "Refusing: RELEASE_TAG must be a full 40-character Git SHA." >&2
  exit 1
fi

release_tag=$(sed -n 's/^RELEASE_TAG=//p' "$ENV_FILE" | tail -1)
if command -v git >/dev/null 2>&1 && git -C "$PROJECT_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  head_tag=$(git -C "$PROJECT_DIR" rev-parse HEAD)
  if [ "$head_tag" != "$release_tag" ]; then
    echo "Refusing: RELEASE_TAG ($release_tag) does not match checkout HEAD ($head_tag)." >&2
    exit 1
  fi
  if [ -n "$(git -C "$PROJECT_DIR" status --porcelain --untracked-files=normal -- ':!.env.production')" ]; then
    echo "Refusing: release checkout contains tracked or untracked changes." >&2
    exit 1
  fi
fi

if grep -Eq '^DEV_ADMIN_ENABLED=(true|1|yes)$' "$ENV_FILE"; then
  echo "Refusing: development admin access must not be enabled in production." >&2
  exit 1
fi

if ! grep -Eq '^PUBLIC_SITE_URL=https://' "$ENV_FILE"; then
  echo "Refusing: PUBLIC_SITE_URL must use HTTPS." >&2
  exit 1
fi

tls_dir=$(sed -n 's/^TLS_CERT_DIR=//p' "$ENV_FILE" | tail -1)
require_file "$tls_dir/fullchain.pem"
require_file "$tls_dir/privkey.pem"

compose config --quiet
echo "Preflight passed. No containers were changed."
