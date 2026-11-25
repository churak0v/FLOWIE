# Safari edge and hero correction

User's iPhone screenshots revealed a persistent gray top chrome extension on Home and a bottom extension across routes. Desktop emulation did not expose this Safari UI behavior.

The large edge-attached fixed Home hero had an explicit gray background. A second fixed full-viewport body pseudo-element supplied another opaque canvas. WebKit's fixed/sticky color extension mechanism is documented by its engineer at https://bugs.webkit.org/show_bug.cgi?id=301756#c2.

Correction:
- Restore large hero: 55svh + 48px (vh fallback), replacing the short 40dvh/max360px hero.
- Use an absolute hero translated within the document by a capped, requestAnimationFrame scroll handler. This keeps the background visible behind the rising sheet without declaring a fixed/sticky viewport layer.
- Honor reduced motion and clean up listeners/frames.
- Remove the fixed body pseudo-element; preserve real safe-area env values and document scrolling.
- Float the bottom nav 8px plus the real bottom safe-area above the viewport edge, with no opaque full-width backing strip.
- Use a white theme-color fallback for browsers that support it.

Available-browser verification at CSS390x844: hero height512px; at scroll337.8px hero top0 and sheet top146.7px; no full-width fixed element touches a viewport edge; no horizontal overflow. Actual iPhone Safari chrome still requires device confirmation; desktop screenshots cannot establish that outcome.

40 storefront tests passed. No API or database changes in this hotfix.
