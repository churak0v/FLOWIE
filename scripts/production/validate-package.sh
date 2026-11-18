#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PROJECT_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/../.." && pwd)
cd "$PROJECT_DIR"

VALIDATOR_IMAGE=${VALIDATOR_IMAGE:-nginxinc/nginx-unprivileged:1.27-alpine}
BUILD_PRODUCTION_IMAGES=${BUILD_PRODUCTION_IMAGES:-false}

sh -n scripts/production/*.sh
docker compose --env-file .env.production.example -f compose.production.yml config --quiet
npm run build
npm run build:admin
(
  cd server
  DATABASE_URL=postgresql://validation:validation@db:5432/validation \
    node ./node_modules/prisma/build/index.js validate --schema prisma/schema.prisma
  node --test tests/*.test.js
)

if ! docker image inspect "$VALIDATOR_IMAGE" >/dev/null 2>&1; then
  docker pull "$VALIDATOR_IMAGE" >/dev/null
fi

validator_dir=$(mktemp -d "$PROJECT_DIR/.flowie-validation.XXXXXX")
cleanup() {
  rm -rf -- "$validator_dir"
}
trap cleanup EXIT HUP INT TERM

sed \
  -e 's/${FLOWIE_DOMAIN}/flowie.example/g' \
  -e 's/${FLOWIE_ADMIN_DOMAIN}/admin.flowie.example/g' \
  nginx/production-edge.conf.template > "$validator_dir/edge.conf"
openssl req -x509 -newkey rsa:2048 -nodes -days 1 \
  -subj '/CN=flowie.example' \
  -keyout "$validator_dir/privkey.pem" \
  -out "$validator_dir/fullchain.pem" >/dev/null 2>&1
chmod 644 "$validator_dir/privkey.pem" "$validator_dir/fullchain.pem"

docker run --rm --network none \
  -v "$PROJECT_DIR/nginx/production-app.conf:/etc/nginx/conf.d/default.conf:ro" \
  "$VALIDATOR_IMAGE" nginx -t

docker run --rm --network none \
  --add-host api:127.0.0.1 \
  -v "$PROJECT_DIR/nginx/default.conf:/etc/nginx/conf.d/default.conf:ro" \
  "$VALIDATOR_IMAGE" nginx -t

docker run --rm --network none \
  --add-host api:127.0.0.1 \
  -v "$PROJECT_DIR/nginx/admin.conf:/etc/nginx/conf.d/default.conf:ro" \
  "$VALIDATOR_IMAGE" nginx -t

docker run --rm --network none \
  --add-host api:127.0.0.1 \
  --add-host web:127.0.0.1 \
  --add-host admin:127.0.0.1 \
  -v "$validator_dir/edge.conf:/etc/nginx/conf.d/default.conf:ro" \
  -v "$validator_dir:/etc/nginx/certs:ro" \
  "$VALIDATOR_IMAGE" nginx -t

if [ "$BUILD_PRODUCTION_IMAGES" = true ]; then
  docker compose --env-file .env.production.example -f compose.production.yml build api
  docker compose --env-file .env.production.example -f compose.production.yml build web
  docker compose --env-file .env.production.example -f compose.production.yml build admin
fi

echo "FLOWIE production package validation passed. No stack was started."
