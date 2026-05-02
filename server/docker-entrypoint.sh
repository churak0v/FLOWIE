#!/usr/bin/env sh
set -e

attempt=0
until node ./node_modules/prisma/build/index.js migrate deploy; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 20 ]; then
    echo "Prisma migrate deploy failed after ${attempt} attempts."
    exit 1
  fi
  echo "Prisma migrate deploy failed (attempt ${attempt}). Retrying in 2s..."
  sleep 2
done
exec node index.js
