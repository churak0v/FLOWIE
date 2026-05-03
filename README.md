# FLOWIE

Telegram Mini App for private wishlist gifting: a delivery-style marketplace where creators keep recipient addresses private and buyers purchase real gifts through a safer checkout flow.

## Local Run

Copy environment examples and fill real secrets:

```bash
cp .env.example .env
cp server/.env.example server/.env
```

Start the full stack:

```bash
docker compose up -d --build
```

Default local endpoints:

- Storefront: http://localhost:6112
- Admin: http://localhost:6113
- API health: http://localhost:6111/api/health
- PostgreSQL: localhost:56431

## Development

Install dependencies:

```bash
npm ci
cd server && npm ci
```

Run frontend builds:

```bash
npm run build
npm run build:admin
```

Run lint:

```bash
npm run lint
```

Validate Prisma schema:

```bash
cd server
node ./node_modules/prisma/build/index.js validate --schema prisma/schema.prisma
```

## Notes

- `.env` files, dependencies, build output, uploads, local DB snapshots, and bundled local toolchains are intentionally ignored by git.
- Docker entrypoint runs `prisma migrate deploy` before starting the API.
- Admin bootstrap uses `ADMIN_TG_IDS` with comma-separated Telegram user IDs.
