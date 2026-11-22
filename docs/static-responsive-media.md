# FLOWIE static responsive images and first-screen optimization

- Docker web and admin builds generate AVIF and WebP for every JPG, PNG and WebP within public/.
- Output widths: 320, 640, 1280, 1920 pixels. Original files remain unchanged.
- Product images from /uploads/ keep their existing independent pipeline and backfill.
- Browser picture/srcset/sizes chooses the mobile-appropriate image; unsupported formats fall back to original.
- Static URLs use VITE_BUILD_SHA (RELEASE_TAG) to avoid stale cache after a redeploy.
- Vite builds a high-priority AVIF preload for the first image in public/config/home.json.
- External image URLs and MP4 videos remain unchanged. The first hero video is metadata-preloaded; later videos preload none.

## Verify on a Mac before merging
Use the existing Sharp installed under server/node_modules:
  NODE_PATH="$PWD/server/node_modules" node scripts/testStaticImageVariants.cjs
  NODE_PATH="$PWD/server/node_modules" node scripts/generateStaticImageVariants.cjs
Then npm ci, npm run lint, npm run build, npm run build:admin.
The output under public/ is ignored by Git and should not be committed.
Production Docker installs Sharp in the build image and generates media automatically.

## Production rollout
- Verify off-VPS database and uploads backups, then run existing deploy.sh.
- Backfill uploaded photos using node scripts/backfillImageVariants.js in the API container.
- Check /hero/*.avif and /uploads/*.avif in Network (200 response, correct content-type).
- Test real mobile catalogue, image appearance, order/payment path, and PageSpeed before ads.
- Image optimization cannot resolve provider SSH or TLS outages.
