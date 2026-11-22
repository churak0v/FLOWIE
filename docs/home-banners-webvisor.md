# FLOWIE editable banners and Yandex Webvisor

Admin URL: https://admin.flowie.art/profile/banners
Three database-backed banners: mother, birthday, premium. Upload photos,
edit captions and internal links, sort and enable/disable without deployments.
Initial photos are existing site files; upload campaign-specific originals.
First create and populate a thematic collection before linking directly to it.

Public banners endpoint: GET /api/home-banners. Homepage caches for 60s and
retains fast bundled fallback. Banner clicks send home_banner_click with bannerId.

To enable Webvisor, update the site AND enable it in Yandex Metrica UI:
Settings > Counter: Webvisor, clickmap, scrollmap, form analytics ON.
Settings > Webvisor: enable session recording; Record all fields OFF.
Verify that checkout inputs and private pages are hidden in recordings.
Privacy policy updated; site owner should review disclosure/consent obligations.

Deploy together with static-responsive-media PR #2 only after tests:
node server/tests/homeBanners.test.js
npm ci; npm run lint; npm run build; npm run build:admin
Back up PostgreSQL and uploads OFF the VPS before any production deployment.
Prisma migration seeds three banner rows; deploy.sh restarts edge to refresh
Nginx IPs after recreating upstream Docker containers.
Do not resume VK advertising until images, checkout and payments are checked.
Changing first banner imagery may cause an extra obsolete default hero preload
until a future dynamic preload optimization; inspect actual mobile Waterfall.
