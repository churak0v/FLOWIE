# FLOWIE emergency ingress candidate — 25 November 2026

Status: activated and verified on 25 November 2026. The FLOWIE origin remains on
its existing VM; only public ingress and DNS were switched.

## Decision

Keep the application, PostgreSQL, uploads and payments on the current FLOWIE
VM. Temporarily terminate public TLS on the existing SPEKA Caddy host and proxy
encrypted traffic to the existing FLOWIE edge by IP. This is an emergency route,
not a full migration and not a permanent architecture.

Do not activate until the owner confirms all of the following:

1. `https://speka.tech` opens from the same mobile network that cannot open
   FLOWIE. A desktop/Happ test is not a substitute.
2. REG.RU access can change the A records for `flowie.art` and
   `admin.flowie.art`. `www.flowie.art` currently has no record and is out of
   scope.
3. A short maintenance window and explicit permission cover changes to the
   FLOWIE edge, SPEKA Caddy and public DNS.
4. Current configuration files and DNS values are saved for exact rollback.

## Why the origin patch is mandatory

The FLOWIE edge rate-limits by `$binary_remote_addr`, while Express uses
`trust proxy = 1`. A naive reverse proxy makes every buyer appear to come from
the SPEKA address and shares a 20 requests/second, burst-60 bucket. The scoped
real-IP patch trusts `X-Forwarded-For` only from the exact SPEKA public address
`129.101.123.117`. Direct callers remain untrusted.

The live nginx image advertises `--with-http_realip_module`. Caddy automatically
sets the forwarded headers and upgrades WebSockets. It does not cache responses;
authenticated, payment and admin APIs therefore remain uncached. Request bodies
are passed through and the origin retains its 25 MiB limit.

## Candidate files

- `Caddyfile.snippet`: two explicit TLS virtual hosts. The upstream is the IP,
  preventing a loop after DNS changes. `tls_server_name` preserves certificate
  verification separately for storefront and admin.
- `production-edge-realip.patch`: minimal origin change before the existing
  per-IP rate-limit zone.

The snippet appended to the current SPEKA Caddyfile passed:

```sh
caddy validate --adapter caddyfile --config -
```

with Caddy 2.6.2. The validation did not request certificates, reload Caddy or
write server state.

## Activation sequence after explicit approval

1. Save checksums and restricted backups of the current FLOWIE edge template,
   live SPEKA Caddyfile and authoritative DNS A values. Do not display private
   keys or environment files.
2. Apply `production-edge-realip.patch` to a clean FLOWIE release candidate.
   Build only the edge artifact, run nginx syntax validation, then recreate only
   `flowie-prod-edge-1`. Confirm direct root, health, admin, WebSocket handshake,
   upload limit and that two test source networks produce distinct effective
   client IP hashes/rate-limit buckets. Do not log raw client addresses.
3. Append `Caddyfile.snippet` to `/etc/caddy/Caddyfile` on SPEKA. Run
   `caddy validate`, then `systemctl reload caddy`; do not restart the host.
4. Before DNS cutover, test proxy routing locally on SPEKA without weakening TLS.
   The public certificate cannot be fully verified until the names point to the
   proxy. Do not copy the origin private key: let Caddy obtain new certificates.
5. Change only these authoritative A records:

   ```text
   flowie.art        A 129.101.123.117
   admin.flowie.art  A 129.101.123.117
   ```

   The authoritative TTL is 3600 seconds. Leave `www.flowie.art` absent.
6. Watch Caddy certificate issuance. HTTP-01/TLS-ALPN must reach SPEKA after DNS
   propagation; until issuance completes browsers can fail TLS. If a valid
   certificate is not issued within the maintenance window, roll back DNS.
7. Verify from the previously failing mobile network plus an independent probe:
   root, `/api/health`, catalog/product, cart, checkout pre-payment, admin login,
   WebSocket connection, upload, bank callback route reachability and no new
   429/5xx. A real payment still needs separate authorization.
8. Monitor both hosts for at least 30 minutes: Caddy memory/FDs, SPEKA disk,
   FLOWIE edge 429/5xx, WebSocket disconnects and origin latency. Do not enable
   verbose access logging on the 95%-full SPEKA filesystem.

## Rollback

Rollback is safe while the original FLOWIE VM remains unchanged behind the
proxy:

1. Restore the two DNS A records to `168.113.209.147`.
2. Wait at least the authoritative TTL and verify multiple resolvers.
3. Remove only the two FLOWIE site blocks from SPEKA Caddy, validate and reload.
4. Remove only the three real-IP directives from the FLOWIE edge candidate and
   recreate only the edge container after nginx validation.
5. Verify direct root, health, admin, WebSocket and 429/5xx. Retain incident logs
   and timestamps, but no raw customer IPs.

If the upstream provider path is still broken for the affected mobile network,
DNS rollback restores the original architecture but also restores that outage.
Therefore keep the proxy active until the provider fix is independently verified
or replace it with a separate, adequately provisioned ingress VM. The current
SPEKA host is acceptable only as a short emergency bridge: its root filesystem
is 95% full and it already hosts SPEKA/OpenClaw.

## Активация 25 ноября: статус оркестратора

Владелец подтвердил доступность SPEKA на том же телефоне и разрешил переключение.
Origin real-IP и SPEKA Caddy применены агентом, резервные копии сохранены.
REG.RU: обе A-записи изменены на 129.101.123.117 и опубликованы на authoritative
NS. Caddy получил доверенные Let's Encrypt сертификаты для `flowie.art` и
`admin.flowie.art`. Реальный TTL=3600 секунд; в интерфейсе REG.RU это минимальное
разрешённое значение. Предыдущая оценка 300 была ошибочна.

Владелец подтвердил загрузку сайта на ранее неработавшей мобильной сети. Чистый
mobile Chromium с валидным TLS прошёл главную, каталог, товар, корзину и checkout
до оплаты; заказ и платёж не создавались. Все пять FLOWIE-контейнеров healthy,
restart count 0. Rollback не выполнялся: аварийный ingress остаётся активным до
подтверждённого исправления исходного маршрута либо переноса на отдельный ingress.
