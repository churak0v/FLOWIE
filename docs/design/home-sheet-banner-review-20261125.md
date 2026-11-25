# FLOWIE: hero, foreground sheet and banner preview

Preview only. Visual changes await owner review. Actual iPhone safe-area behaviour remains to be checked on device; desktop 390×844 emulation does not reproduce Safari chrome or non-zero safe-area values.

Hero is fixed and constrained to the app width; rounded foreground surface scrolls above it. Existing env(safe-area-inset-*) variables are preserved. Price selectors have overlapping lower bounds and ascending prices.

## Banner assets

- `public/banners/review/paper-ribbon-background.webp`: 1200px-wide compressed decorative background generated with the built-in image_gen tool.
- `public/banners/review/basket-card.webp`, `basket-detail.webp`: unchanged Product81 public derivatives of user-uploaded original photos. These are two angles of the same bouquet, not independently verified reference/fulfilled-order evidence. Product81 is an inactive draft; the banner links to catalog, not that draft.
- Price banner reads the actual selected catalog product name/photo/price, without synthetic pricing.

## Final generation prompt

Use case: ads-marketing. Generate a refined editorial background asset for FLOWIE, a modern flower delivery app. Wide 3:2 horizontal composition, tactile blush pink folded gift-wrap paper, a single soft burgundy satin ribbon sweeping gracefully near the far right and lower edge, warm soft studio daylight, subtle paper grain and shadows, contemporary premium but friendly art direction. Upper left and centre left must be very clean pale blush negative space for dark live HTML heading. Lower centre and right must remain sufficiently quiet for two real product photographs which will be overlaid separately in HTML. No bouquets, no flowers, no people, no phones, no cards, no logos, no text, no lettering. This is only decorative campaign background, never product evidence.
