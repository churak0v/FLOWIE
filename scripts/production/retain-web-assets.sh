#!/usr/bin/env sh
set -eu
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
. "$SCRIPT_DIR/common.sh"
# Hashed public JS/CSS must outlive a release: an already-open SPA can request
# a lazy chunk from its original build after the new image has replaced it.
if [ "$#" -eq 0 ]; then
  set -- "$(docker inspect --format '{{.Config.Image}}' flowie-prod-web-1)"
fi
retain_tmp=$(mktemp -d)
retain_container=''
cleanup() {
  if [ -n "$retain_container" ]; then docker rm "$retain_container" >/dev/null 2>&1 || true; fi
  rm -rf "$retain_tmp"
}
trap cleanup EXIT HUP INT TERM
mkdir -p "$PROJECT_DIR/public/assets"
for image in "$@"; do
  retain_container=$(docker create "$image")
  mkdir -p "$retain_tmp/assets"
  docker cp "$retain_container:/usr/share/nginx/html/assets/." "$retain_tmp/assets/"
  docker rm "$retain_container" >/dev/null
  retain_container=''
  for file in "$retain_tmp"/assets/*.js "$retain_tmp"/assets/*.css; do
    [ -f "$file" ] || continue
    target="$PROJECT_DIR/public/assets/$(basename "$file")"
    [ -e "$target" ] || cp "$file" "$target"
  done
  printf 'Retained hashed web assets from %s\n' "$image"
done
