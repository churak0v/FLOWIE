# FLOWIE production deployment runbook

This package is a reviewable deployment candidate. It has not been deployed and is not production-approved until a controlled real order completes successfully.

## Confirmed local facts

- The saved project copy references `https://flowie.churakov.tech` and `@flowieapp_bot`; current DNS, server ownership and Telegram BotFather settings still need independent confirmation.
- The current local stack is development-only: web/API/admin use host ports 6212/6211/6213, development admin access is enabled, the public URL is localhost, Alfa Bank is in test mode, and Telegram tokens are placeholders.
- The application exposes `/api/health`, stores uploads in `/app/uploads`, trusts one reverse proxy, and sets secure cookies when `NODE_ENV=production`.

## Decisions and access required before launch

1. SSH/root or equivalent access to the production Linux host, Docker Engine with Compose v2, firewall control, enough disk for images plus at least two full backups, and at least 4 GB of free RAM if images are built on-host.
2. Confirmation that `flowie.churakov.tech` remains the storefront domain and a decision on the admin hostname. `admin.flowie.churakov.tech` is only a proposal.
3. DNS control for both names and a certificate whose SANs include both. Place `fullchain.pem` and `privkey.pem` in the host directory named by `TLS_CERT_DIR`; certificate issuance/renewal is deliberately outside this stack.
4. Real production `BOT_TOKEN`, optional `ADMIN_BOT_TOKEN`, exact `ADMIN_TG_IDS`, a random `TELEGRAM_WEBHOOK_SECRET`, and confirmation of BotFather Mini App/menu URLs. `TELEGRAM_AUTO_SET_WEBHOOK` is forced off; register or change webhooks only as a separate reviewed operator action.
5. A new random PostgreSQL password and JWT secret. The password in `DATABASE_URL` must be URL-encoded and must represent the same bytes as `POSTGRES_PASSWORD`.
6. Alfa Bank access and activation are outside this deployment handoff. The safe default is `ALFA_BANK_ENABLED=false`; the stack supports a future reviewed activation with owner-supplied production credentials.
7. Demonstration auto-fulfilment must never run for real delivery. Application code now rejects it whenever `NODE_ENV=production`, and the production environment also leaves it disabled.
8. A named operator for the controlled order, refund/cancellation verification, Telegram notifications, admin processing, delivery status, and payment reconciliation.
9. `DELIVERY_TARIFF_RUB` must stay empty until the real tariff is confirmed; do not substitute zero. SMS authentication stays off until the auth handoff supplies `SMS_RU_API_ID`, optional `SMS_RU_SENDER`, and explicitly enables `SMS_AUTH_ENABLED`.
10. `AUTH_ALLOWED_ORIGINS` must list the exact HTTPS storefront/admin origins. HTTP and Socket.IO CORS allow those origins plus `PUBLIC_SITE_URL`; arbitrary origins are not reflected, and loopback is allowed only in development.

## Host preparation

Use a clean release checkout. Do not deploy from the current dirty developer working tree.

```sh
cp .env.production.example .env.production
chmod 600 .env.production
```

Fill every placeholder. Set `RELEASE_TAG` to the full Git SHA of the reviewed release. Ensure inbound TCP 80/443 are allowed and PostgreSQL/API/web/admin ports are not exposed by the firewall or Compose.

Static validation (no service changes):

```sh
./scripts/production/validate-package.sh
./scripts/production/preflight.sh
```

The package validator runs storefront/admin builds, Prisma schema validation, Telegram/admin and payment route tests with mocked bank HTTP responses, Compose validation, and both nginx syntax checks. It does not contact Alfa Bank or start the application stack.

SEO behavior and post-deploy checks are documented separately in `docs/seo.md`. Do not submit the sitemap or request indexing as part of an infrastructure rollout; first verify public HTML, 404s, canonical URLs and structured data on the authorized production domain.

On a clean builder with at least 4 GB of free RAM, also validate all production image builds without starting the stack:

```sh
BUILD_PRODUCTION_IMAGES=true ./scripts/production/validate-package.sh
```

## Backup and restore drill

Once the stack exists, create a backup before every migration:

```sh
BACKUP_DIR=/srv/flowie/backups ./scripts/production/backup.sh
```

Copy backups off-host, apply retention, and monitor both backup age and free space. A backup is not accepted until a restore drill has succeeded on an isolated host. Restore is intentionally guarded and destructive:

```sh
CONFIRM_RESTORE=RESTORE_FLOWIE_PRODUCTION \
  ./scripts/production/restore.sh /srv/flowie/backups/20261118T000000Z
```

## Launch

The deploy script performs preflight, an online DB/uploads backup when an existing stack is running, image builds, `prisma migrate deploy`, startup and container health waits:

```sh
BACKUP_DIR=/srv/flowie/backups ./scripts/production/deploy.sh
```

Then verify from outside the host:

```sh
curl --fail --show-error --silent https://flowie.churakov.tech/api/health
curl --fail --show-error --silent --head https://flowie.churakov.tech/
curl --fail --show-error --silent --head https://admin.flowie.churakov.tech/
```

Check the certificate chain and hostname, HTTP-to-HTTPS redirect, storefront loading in Telegram iOS/Android and a normal browser, admin denial for a non-admin Telegram account, approved admin access, upload persistence after an API container recreation, realtime chat reconnect, and logs without secrets.

Finally place one controlled low-value order and verify payment outcome/callback, exactly-once order creation, admin visibility, Telegram messages, status transitions, cancellation/refund path, and bank reconciliation. Until this passes, describe the system only as deployed for controlled verification, not production-ready.

## Rollback

Keep the prior three immutable image tags and their matching backups. For an application-only rollback where the migrated schema remains backward-compatible:

```sh
BACKUP_DIR=/srv/flowie/backups \
  ./scripts/production/rollback.sh PREVIOUS_FULL_GIT_SHA
```

If the schema is not backward-compatible, restore the backup captured immediately before that release while rolling back images:

```sh
BACKUP_DIR=/srv/flowie/backups \
  ./scripts/production/rollback.sh PREVIOUS_FULL_GIT_SHA /srv/flowie/backups/PRE_DEPLOY_TIMESTAMP
```

Database restore loses writes made after the selected backup. Stop the launch, record the incident window, and obtain business approval before choosing that path.

## Operational minimum

- Monitor public health, container restarts, TLS expiry, disk usage, backup age and failed payments.
- Test off-host backup restore regularly.
- Pin and review base-image updates; rebuild immutable release tags rather than editing running containers.
- Rotate any credential exposed in logs or chat. Never print `.env.production` or expanded Compose configuration into tickets.

The root and server Docker ignore files exclude real environment files, uploads, backups and local dependencies from build contexts. Keep those exclusions intact when adding new secret or runtime-data paths.
