# FLOWIE hybrid catalog search contract

Server route file: `server/routes/search.js`. Main application mounts it at `/api/search`; the catalog operation is `POST /api/search/catalog`.

The feature is first-party catalog search with an optional OpenAI embedding signal. Semantic search is disabled by default and no external request is made unless it is explicitly enabled **and** `OPENAI_API_KEY` is present.

## Environment

- `CATALOG_EMBEDDINGS_ENABLED=false` — must be exactly `true` to enable provider calls.
- `OPENAI_API_KEY` — optional server-only secret; never returned or logged.
- `CATALOG_EMBEDDING_MODEL=text-embedding-3-small` — stored with every vector.
- `CATALOG_EMBEDDING_DIMENSIONS=512` — allowed range 16–3072; stored with every vector.
- `CATALOG_EMBEDDING_TIMEOUT_MS=2500` — provider timeout, bounded to 500–10000 ms. Increase for reindexing if the network cannot complete a batch within this time.
- `CATALOG_SEARCH_MIN_SIMILARITY=0.25` — optional cosine threshold, bounded to 0–1.
- `CATALOG_REINDEX_MAX_PRODUCTS=2000` — CLI safety budget, bounded to 1–2000.
- `CATALOG_REINDEX_BATCH_SIZE=20` — CLI request batch, bounded to 1–50.

The implementation uses OpenAI `POST /v1/embeddings` with `encoding_format="float"`, the configured model and dimensions. No SDK package is required. Official API reference: <https://developers.openai.com/api/reference/resources/embeddings/methods/create>.

Vectors are stored as PostgreSQL `DOUBLE PRECISION[]` through Prisma `Float[]`. Cosine similarity is calculated in the server process over the filtered catalog, so this release does not require or enable the `pgvector` extension. `ProductEmbedding` records `productId`, `contentHash`, `documentVersion`, model and dimensions; the indexer removes orphaned/inactive rows.

## Request

```json
{
  "query": "нежный букет из роз до 5000",
  "minPrice": null,
  "maxPrice": null,
  "collection": "romantic",
  "scenario": null,
  "limit": 20
}
```

- `query` is required, 1–160 normalized characters after privacy redaction.
- `limit` is 1–100, default 20.
- prices are integer RUB from 0 to 1,000,000.
- `collection` and `scenario` accept an ID or slug and are strict filters, not semantic hints.
- only known fields are accepted.
- email addresses and phone-like strings are replaced before any provider call.

Price phrases are deterministic: `до5000`, `от3000`, `от3000до5000` and spaced thousands are parsed into filters. When body filters and text filters coexist, the stricter intersection is applied. Prices use the public effective product price `max(0, price - discount)`.

## Response

```json
{
  "productIds": [17, 4, 29],
  "mode": "hybrid",
  "appliedFilters": { "minPrice": null, "maxPrice": 5000 },
  "indexReady": true
}
```

- `hybrid` means the current query used both lexical and cosine signals.
- `lexical` is explicit fallback when semantic search is disabled, the provider fails, the query has no semantic text, or any filtered candidate has a missing/stale/malformed vector.
- `indexReady` is false when semantic search is disabled or the applicable index is incomplete/stale. A provider failure can return `mode=lexical` with `indexReady=true`, because the stored index itself is current.
- only active, non-upsell catalog products are candidates. Collection/scenario and price filters run before ranking.
- at most 2000 filtered products use in-memory cosine ranking. Above that budget the endpoint runs lexical ranking over the full filtered set instead of silently truncating the catalog. The response never returns attributes invented by the model.

The embedding document contains only public product fields: name, description, composition, color, and active collection/scenario titles. It never includes users, recipients, orders, chats, addresses, or payment data.

## Indexing

Run from `server/` after explicitly enabling the feature and setting a key:

```sh
npm run reindex:embeddings
```

The command computes a versioned content hash, skips unchanged rows, replaces rows whose hash/model/dimensions/vector are stale, and removes rows for inactive/deleted/non-catalog products. It refuses to start provider work when the active product budget is exceeded. Successful rows are persisted incrementally; a later batch failure leaves prior successes valid and remaining old rows visibly stale, forcing lexical fallback rather than mixing vector versions. The bounded cache stores only query vectors; live product availability, price and collection membership are read on every search.

No production indexing or quality claim is part of this change. Relevance must be evaluated on the real catalog after the owner supplies a key and explicitly runs the command; provider usage is billable according to the OpenAI account’s current terms.
