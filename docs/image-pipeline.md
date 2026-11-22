# FLOWIE responsive images — review and deployment

## Scope
- Store original uploaded JPEG/PNG/WebP unchanged in the existing Docker upload volume.
- At upload time generate six immutable responsive variants per original:
  320/640/1280 widths in AVIF (quality 52) and WebP (quality 82).
- Browser uses <picture> + srcset + sizes for product cards and galleries; external
  URLs and static hero assets continue to work unchanged.
- A resumable, single-image-at-a-time backfill handles historical uploads.
- No schema migration and no DB change. Variants are served as ordinary static files
  from /uploads/ and respect the existing long-lived image cache.
- A failed encoder cannot erase an uploaded original. During a backfill rollout,
  a temporarily missing variant causes one failed image request and a client retry
  using the original. Finish backfill before returning paid traffic.

## Dependency
The server uses pinned Sharp 0.34.5, installed as an additional isolated Docker
build layer after npm ci, leaving the existing checked-in package-lock unchanged.
For local testing only:
  npm install --prefix server --no-save --no-package-lock sharp@0.34.5

## Verification before a production deployment
  npm ci
  npm run lint
  npm run build
  npm run build:admin
  npm install --prefix server --no-save --no-package-lock sharp@0.34.5
  node server/scripts/testImageVariants.js

## Production
1. MERGE reviewed branch only after local tests succeed.
2. Export a verified OFF-VPS PostgreSQL dump AND a copy of the flowie_uploads volume.
3. Use the existing scripts/production/deploy.sh from the project root. It builds
   the pinned API and frontend images and waits for health checks.
4. Convert old uploads with the following commands, from the directory containing
   compose.production.yml and .env.production:

  docker compose --env-file .env.production -f compose.production.yml exec -T api node scripts/backfillImageVariants.js --dry-run
  docker compose --env-file .env.production -f compose.production.yml exec -T api node scripts/backfillImageVariants.js

5. Verify GET /api/health, home, catalog, product detail, admin, delivery and
   payment flow. Check image URLs and response headers in browser DevTools:
   @320.avif / @640.avif / @1280.avif or corresponding WebP, correct Content-Type
   and no broken images. On Safari and Android confirm mobile formatting.
6. Rerun mobile PageSpeed and compare LCP and bytes transferred with baseline.
7. Only after successful checks resume VK ads.

## Rollback and notes
- Revert the frontend release using the project's existing rollback procedure.
- Never delete original files or the /uploads/ volume when reverting.
- Repeated backfills skip already-generated, nonempty variants.
- This changes image delivery, not VPS SSH/TLS/network reliability.
