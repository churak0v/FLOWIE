# Private bouquet import storage

`server/services/bouquetImportStorage.js` stores the unchanged source photo for a bouquet-import job in an S3-compatible private bucket. It is deliberately isolated from the catalog/media bucket contract.

Required server environment variables:

- `FLOWIE_IMPORT_S3_BUCKET` — the explicitly approved private backup/import bucket; there is no fallback to generic media variables.
- `FLOWIE_IMPORT_S3_ENDPOINT` — HTTPS S3-compatible endpoint.
- `FLOWIE_IMPORT_S3_REGION` — signing region.
- `FLOWIE_IMPORT_S3_ACCESS_KEY_ID` and `FLOWIE_IMPORT_S3_SECRET_ACCESS_KEY` — scoped credentials.
- `FLOWIE_IMPORT_S3_SESSION_TOKEN` — optional temporary-credential token.

Optional bounds:

- `FLOWIE_IMPORT_S3_MAX_UPLOAD_BYTES` and `FLOWIE_IMPORT_S3_MAX_READ_BYTES` default to 25 MiB and cannot exceed 100 MiB.
- `FLOWIE_IMPORT_S3_TIMEOUT_MS` defaults to 30 seconds and cannot exceed 120 seconds.

Objects are created only below `flowie-import/`. `uploadOriginal` generates a dated key; Telegram ingestion can use `put({ key, body, contentType, metadata })` with `flowie-import/<importId>/<fileUniqueId>.jpg`. `get`, and its `readOriginal` alias, return bounded bytes. Keys reject traversal, backslashes, encoded slashes, empty segments, and unsafe characters. The adapter signs path-style PUT and GET requests with AWS Signature V4, sends no public ACL, preserves uploaded bytes, and intentionally provides no delete or list method. Bucket policy, lifecycle, retention, and existing objects remain operations-owned and are not changed by this module.

The existing SPEKA backup bucket can be supplied through `FLOWIE_IMPORT_S3_BUCKET` only after deployment credentials are made available to FLOWIE. Do not point this setting at the SPEKA catalog/photo bucket.
