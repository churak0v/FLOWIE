# FLOWIE web catalog SEO

FLOWIE serves useful HTML for the existing public React routes without user-agent detection:

- `/` — active collections and active main products;
- `/catalog` — all active main products;
- `/catalog?collection=<slug>` and `/catalog?scenario=<slug>` — the collection/scenario selected by the current React application;
- `/product/:id` — one active main product;
- `/robots.txt` and `/sitemap.xml` — discovery documents generated from active database rows.

The HTML response contains visible catalog content, the same JavaScript application shell received by users, a self-referencing canonical, title, description, Open Graph metadata, and escaped JSON-LD. Product pages include `Product`, `Offer`, and `BreadcrumbList`; catalog pages include `ItemList` and breadcrumbs. There is no crawler-specific branch or dynamic rendering.

The static SPA shell is `noindex,nofollow`. This protects cart, checkout, account, recipients, payment, webmaster and other application routes. Public SEO routes replace that directive server-side with `index,follow`. Missing/inactive products and unknown collections return an actual HTTP 404 with `noindex`; renderer or database failures return 503.

`robots.txt` allows crawling so crawlers can see page-level `noindex` directives and advertises the absolute sitemap. The sitemap contains only canonical public URLs for active, non-upsell products and active collections, with database `updatedAt` values as `lastmod`.

## Architecture

The API loads the built React HTML shell from the internal web container at `SEO_APP_SHELL_URL=http://web:8080/_flowie_app_shell`, caches it for five minutes, inserts escaped public content into `#root`, and leaves the existing hashed scripts intact. When React starts, it replaces the progressive server content with the existing storefront UI. The internal shell path is blocked at the public edge.

In local Docker the equivalent URL is `http://web/_flowie_app_shell`. When running the API directly outside Docker, the renderer falls back to the repository `index.html` or an explicit `SEO_APP_SHELL_PATH`.

## Verification

```sh
node --test server/tests/seo.test.js
./scripts/production/validate-package.sh
```

Tests cover browser/crawler parity, real HTML content, canonical and Open Graph metadata, Product/Offer/Breadcrumb JSON-LD, XSS escaping, active-only sitemap entries, robots output, real 404 responses, private-route noindex defaults, and rejection of unauthenticated `POST /api/products`.

After an authorized deployment, validate a small URL sample with Google's Rich Results Test and URL Inspection before any sitemap submission. This handoff does not submit URLs or request indexing.

## Primary references

- [JavaScript SEO basics](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics)
- [Dynamic rendering is a workaround, not the recommended solution](https://developers.google.com/search/docs/crawling-indexing/javascript/dynamic-rendering)
- [Product structured data](https://developers.google.com/search/docs/appearance/structured-data/product-snippet)
- [Breadcrumb structured data](https://developers.google.com/search/docs/appearance/structured-data/breadcrumb)
- [Canonical URLs](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls)
- [Robots meta directives](https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag)
- [Build a sitemap](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)
- [Correct 404 behavior](https://developers.google.com/search/docs/crawling-indexing/troubleshoot-crawling-errors)

## AI discovery

`/llms.txt` is a public UTF-8 text discovery guide generated from active, non-upsell products. It links to canonical product pages rather than duplicating prices. Both Nginx layers forward this exact route to the API; public HTML advertises it with `rel="describedby"`. Do not add private orders, users, procurement prices, or unpublished products.

This follows the optional [llms.txt proposal](https://llmstxt.org/); it is not a ranking directive. [Google states](https://developers.google.com/search/docs/appearance/ai-features) that no special AI text files are required for its AI search features. Crawlable useful content and standard SEO remain necessary; rankings and citations are not guaranteed.
