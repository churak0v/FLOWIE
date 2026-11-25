# FLOWIE: Telegram import and bouquet economics

Existing order bot; webhook: `https://flowie.art/api/bouquet-import/webhook`.
Import is limited to explicitly configured numeric Telegram chat/user IDs. Adelina:
`1780687976` (`@adel0903`, independently checked through Telegram getChat).

## Florist flow

1. Send photos in as many Telegram albums as necessary. The first photo opens an
   import automatically.
2. Write composition in the caption or reply to a specific photo. Unattached notes
   remain unassigned rather than being attached to an arbitrary bouquet.
3. In default sync mode, each stored photo is picked up automatically. No upload
   completion confirmation is required; more photos may arrive while analysis runs.
   `/import_retry` retries failed/stale downloads. Legacy Batch mode retains the
   60-second idle question and explicit confirmation. New inline action buttons are not sent.
4. A durable worker sends ordinary OpenAI Responses requests for stored photos,
   with two photos processed concurrently by default. Exact-byte
   duplicates cost one image request. Albums are transport groups, not bouquets.
   A second bounded visual comparison groups different angles of the same physical
   arrangement, with a high-confidence threshold and explicit manual correction.
5. The bot sends a ready notification to the uploading chat. The bottom buttons
   **Посмотреть результат** and **Дальше** open and navigate product cards;
   `/review` and `/next` remain supported. Errors also generate a notice.
6. Press **Изменить состав** and write normal text such as
   `Роза Пинк Флойд 9 шт, эвкалипт 2 ветки`, then **Подтвердить состав**.
   **Изменить название**, **Добавить фото**, and **Объединить карточки** operate on
   the current card. The bot displays photos as an album and hides technical IDs
   and commands. Old slash commands remain accepted for compatibility.

Imports create drafts. With `FLOWIE_IMPORT_MATERIALIZE_PRODUCTS=true`, grouped cards
also become inactive products in the existing admin, with local WebP image galleries.
The selling price remains unset (database zero) and products stay hidden until reviewed.
Confirmed composition and manual names sync from Telegram to these product drafts.
Every bouquet is a normal repeatable product once published; the florist controls
availability. No “соберём похожий” classification is introduced.

## Procurement

Authenticated API `/api/admin/bouquet-economics`: price ingestion/listing, recipe
create/edit/read/confirm and live quote. Price rows retain supplier, SKU, unit,
effective date and source. Only confirmed prices are used, and supplier selection
is explicit. Missing or stale prices remain missing. Margin, markup, contribution,
and break-even CAC are distinct; costs and purchase prices never enter public APIs.
Supplier price files will be parsed separately when supplied by the owner.

## Operations

Required environment is in compose.production.yml and bouquet-import-storage.md.
`FLOWIE_BOUQUET_IMPORT_ENABLED` mounts the webhook, and
`FLOWIE_IMPORT_AI_MODE=sync` selects automatic ordinary requests as photos arrive.
`FLOWIE_IMPORT_AI_CONCURRENCY` defaults to 2 and is capped at 3.
Legacy Batch submission requires both mode `batch` and
`BOUQUET_IMPORT_AI_BATCH_ENABLED=true`. `OPENAI_API_KEY` and backup S3 credentials are server-only.

Originals stay private under `flowie-import/` in the explicitly approved backup
bucket `speka-production-backups-20261116`. No bucket policy, lifecycle, media bucket,
or existing SPEKA objects are changed. Normalized 768px JPEGs go to OpenAI; original
photos are preserved. HEIC conversion depends on the installed sharp/libvips codecs;
normal Telegram photos arrive as JPEG and avoid this compatibility issue.

Each photo's response and token usage are persisted as it finishes. Interrupted or
uncertain requests are locked for manual reconciliation instead of being submitted
again automatically. Legacy Batch completion can take up to 24 hours. Partial results and
failed conversions are explicit states. Prisma's additive migration must precede
API recreation. Existing frontend/admin images can remain running.

## Fast-mode verification — 25 November 2026

- The original eight-photo Batch was cancelled with zero completed requests.
- All eight original photos were processed successfully through ordinary Responses
  requests via the Netherlands relay; processing took 18.35 seconds.
- Eight private drafts/recipes were saved. Ready notification delivery to the
  uploader was confirmed after completion.
- Continuous intake retains `COLLECTING`, uses hash-based result identities, and
  processes only newly stored photos. Exact duplicates reuse existing responses.
- Token usage is recorded per response (first eight photos: 2,873 input and 1,196
  output tokens); exact composition remains subject to human confirmation.

## Deployment verification — 25 November 2026

- API release `636e97ab125e49c22b06e6b5d683d69a6f22af08` deployed on `flowie-prod`.
  `API_RELEASE_TAG` is pinned separately; web/admin remain on `219cd708…`.
- Applied behavior analytics and bouquet import additive migrations (23 total).
  Pre-release backup: `/srv/flowie/app/backups/20261125T155642Z`.
- Public health returns 200. Unsigned webhook returns 403; signed non-message probe
  returns 200. Private procurement API without authentication returns 401.
- Existing `@flowieadmin_bot` webhook changed to the `flowie.art` URL, one connection,
  no dropped pending updates. Telegram reported zero pending updates and no error.
- Real S3 PUT/GET readback succeeded for a 38-byte import connectivity probe in the
  approved backup bucket. Anonymous HEAD returned 403. No SPEKA media objects touched.
- Owner created a dedicated restricted `FLOWIE bouquet import` key. It passes
  authentication; the older saved keys return HTTP 401. The new key is stored
  only in the protected server environment. Owner's API billing UI showed $5.95.
- Direct requests from FLOWIE return `unsupported_country_region_territory`.
  Production uses `OPENAI_API_BASE_URL=https://speka.tech/flowie-openai` for Batch
  and embeddings. Caddy snippet: `ops/caddy/flowie-openai.caddy`. It accepts only
  the FLOWIE VPS IP and required OpenAI paths, forwarding HTTPS to api.openai.com.
  Both model access and Batch listing from the live FLOWIE container returned 200;
  external access to the relay returned 403, and SPEKA health remained 200.
- Full automated server suite including relay coverage: 185 passed, 3 infrastructure
  tests skipped. A real florist photo → AI → review flow still needs a first
  finalized archive; live verification above does not claim that flow passed.

## First live import and delayed Telegram delivery

The first eight-photo archive exposed an ordering race: Telegram delivered the
finish callback while older photo updates were awaiting retries. All eight updates
were recovered without resending photos, saved to the private import prefix, and
submitted in one Batch. Pending updates were acknowledged only after durable save.

Pre-confirmation photos arriving late are accepted by their Telegram message time;
duplicate retries remain idempotent. Finalized uploads enter analysis only after
15 seconds without file changes and after Telegram's pending update count reaches
zero. Background notification delivery uses a persistent lease/retry record and
merges the latest review state instead of overwriting the review cursor.
