# SEO and attribution audit — 2026-11-26

## Attribution contract

The browser records one session attribution with this priority:

1. advertising click identifiers or explicit UTM parameters;
2. external referrer hostname, classified as `organic_search` for known search hosts and `referral` otherwise;
3. `direct_or_unknown`.

The collector never creates UTM values for untagged visits. It keeps the original bounded UTM fields separately, stores no referrer path or query, and the server hashes advertising click identifiers before persistence. Reports expose both normalized `channels` and sources while retaining original UTM campaign dimensions.

## Public SEO check

Live read-only requests to `https://flowie.art` on 2026-11-26 found:

- product `123`: HTTP 200, unique title and description, self-canonical, Product/Offer and Breadcrumb JSON-LD;
- catalog: HTTP 200, self-canonical and ItemList/Breadcrumb JSON-LD;
- inactive or unknown product behavior is covered by server tests as a real HTTP 404 with `noindex,nofollow`;
- sitemap and robots are public and the sitemap lists active canonical products and non-empty collections;
- private SPA fallbacks such as `/cart` are `noindex,nofollow`;
- blocker: `/` was served by the production edge as the static noindex app shell. This branch routes `/` to the existing catalog-backed SEO renderer, matching the other storefront ingress.

SPA navigation now updates title, description, robots and a single canonical link. Canonicals retain only supported collection/scenario selectors; campaign, click, customer and arbitrary query parameters are excluded.

References: [Google JavaScript SEO basics](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics), [Google ecommerce URL guidance](https://developers.google.com/search/docs/specialty/ecommerce/designing-a-url-structure-for-ecommerce-sites), [Google structured-data guidelines](https://developers.google.com/search/docs/appearance/structured-data/sd-policies).

## Flowwow physical dimensions

The saved owned-shop source exports were inspected separately. They contain source URL, price, image URLs, composition and availability, but **no product width or height**. The 1000×1000 values found in CDN paths and media manifests are image pixel dimensions, not bouquet dimensions.

The FLOWIE snapshots show `width` and `height` as null for imported Flowwow records. Some unrelated manually maintained FLOWIE products have physical dimensions, but that is not evidence for the imported SKUs. A direct anonymous re-fetch of a Flowwow product page returned HTTP 403, so it supplied no additional verified dimension data.

Conclusion: no physical dimensions can be safely backfilled from the current manifests. No product dimensions were mutated.
