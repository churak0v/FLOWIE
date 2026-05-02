import WebApp from '@twa-dev/sdk';

function setCssPxVar(name, value) {
    try {
        const n = Number(value);
        if (!Number.isFinite(n)) return;
        document.documentElement.style.setProperty(name, `${n}px`);
    } catch {
        // ignore
    }
}

function readCssPxVar(name) {
    try {
        const raw = getComputedStyle(document.documentElement).getPropertyValue(name);
        const n = Number.parseFloat(String(raw || ''));
        return Number.isFinite(n) ? n : null;
    } catch {
        return null;
    }
}

function syncTelegramCssVars() {
    const docEl = document.documentElement;
    if (!docEl) return;

    const platform = (() => {
        try {
            return String(WebApp?.platform || '').toLowerCase();
        } catch {
            return '';
        }
    })();

    const inTelegram = (() => {
        // `telegram-web-app.js` can be loaded in regular browsers too (platform stays "unknown").
        // Telegram Mini Apps always pass `tgWebApp*` params in the URL hash (tgWebAppVersion/platform/data).
        // Use those params first; fall back to platform/initData/UA as pragmatic signals.
        try {
            const hash = String(window.location?.hash || '');
            if (/tgwebapp(version|platform|data)=/i.test(hash)) return true;
        } catch {
            // ignore
        }

        try {
            if (platform && platform !== 'unknown') return true;
        } catch {
            // ignore
        }

        try {
            const initData = String(WebApp?.initData || '');
            if (initData) return true;
        } catch {
            // ignore
        }

        try {
            return /telegram/i.test(String(navigator.userAgent || ''));
        } catch {
            return false;
        }
    })();

    const readOr0 = (name) => {
        const v = readCssPxVar(name);
        return Number.isFinite(v) ? v : 0;
    };

    // Viewport.
    try {
        if (WebApp?.viewportHeight != null) setCssPxVar('--tg-viewport-height', WebApp.viewportHeight);
        if (WebApp?.viewportStableHeight != null) setCssPxVar('--tg-viewport-stable-height', WebApp.viewportStableHeight);
    } catch {
        // ignore
    }

    // Cache these for derived insets (top/bottom/left/right) below.
    let safeObj = null;
    let contentObj = null;

    // Insets (Telegram provides JS API; CSS vars may not exist in all clients, so we mirror them).
    try {
        const safe = WebApp?.safeAreaInset || WebApp?.safeAreaInsets || null;
        const content = WebApp?.contentSafeAreaInset || WebApp?.contentSafeAreaInsets || null;
        safeObj = safe;
        contentObj = content;

        const applyInsets = (prefix, inset) => {
            if (!inset) return;
            setCssPxVar(`${prefix}-top`, inset.top);
            setCssPxVar(`${prefix}-right`, inset.right);
            setCssPxVar(`${prefix}-bottom`, inset.bottom);
            setCssPxVar(`${prefix}-left`, inset.left);
        };

        applyInsets('--tg-safe-area-inset', safe);
        applyInsets('--tg-content-safe-area-inset', content);
    } catch {
        // ignore
    }

    // Remove legacy JS overrides to avoid conflicts; rely on CSS (with env() fallback) only.
    try {
        docEl.style.removeProperty('--app-inset-top-js');
        docEl.style.removeProperty('--app-inset-right-js');
        docEl.style.removeProperty('--app-inset-bottom-js');
        docEl.style.removeProperty('--app-inset-left-js');
        docEl.style.removeProperty('--app-nav-inset-bottom-js');
        docEl.style.removeProperty('--app-tg-header-fallback');
    } catch {
        // ignore
    }
}

export function telegramReady() {
    try {
        WebApp.ready();
    } catch {
        // no-op
    }

    // Expand to stable height in Telegram (improves layout and safe-area correctness).
    try {
        WebApp.expand();
    } catch {
        // no-op
    }

    // Keep CSS vars in sync even if Telegram doesn't inject them.
    syncTelegramCssVars();
    // Some clients populate safe-area/viewport data asynchronously after `ready()`/`expand()`.
    // Do a few delayed syncs to avoid a "first paint" under Telegram UI.
    try {
        setTimeout(syncTelegramCssVars, 0);
        setTimeout(syncTelegramCssVars, 80);
        setTimeout(syncTelegramCssVars, 250);
    } catch {
        // ignore
    }
    try {
        const handler = () => syncTelegramCssVars();
        WebApp.onEvent('viewportChanged', handler);
        // Some Telegram clients expose these events; ignore if unsupported.
        WebApp.onEvent('safeAreaChanged', handler);
        WebApp.onEvent('contentSafeAreaChanged', handler);
    } catch {
        // ignore
    }
}

export function getTelegramInitData() {
    try {
        const d = WebApp.initData || '';
        if (d) return d;
    } catch {
        // ignore
    }

    // Fallback: Telegram passes initData in URL hash as `tgWebAppData`.
    try {
        const hash = String(window.location?.hash || '');
        const raw = hash.startsWith('#') ? hash.slice(1) : hash;
        const params = new URLSearchParams(raw);
        const fromHash = params.get('tgWebAppData') || params.get('tgwebappdata') || '';
        return fromHash || '';
    } catch {
        return '';
    }
}

export function getTelegramStartParam() {
    try {
        const p = WebApp.initDataUnsafe?.start_param;
        if (p) return String(p);
    } catch {
        // ignore
    }

    // Fallback: Telegram may pass start param in URL hash.
    try {
        const hash = String(window.location?.hash || '');
        const raw = hash.startsWith('#') ? hash.slice(1) : hash;
        const params = new URLSearchParams(raw);
        const fromHash = params.get('tgWebAppStartParam') || params.get('tgwebappstartparam') || '';
        if (fromHash) return fromHash;
    } catch {
        // ignore
    }

    // Fallback: plain query params (useful for web debugging).
    try {
        const search = String(window.location?.search || '');
        const params = new URLSearchParams(search);
        const fromQuery = params.get('startapp') || params.get('start') || params.get('ref') || '';
        return fromQuery || '';
    } catch {
        return '';
    }
}

export function isTelegramWebApp() {
    try {
        const hash = String(window.location?.hash || '');
        if (/tgwebapp(version|platform|data)=/i.test(hash)) return true;
    } catch {
        // ignore
    }

    try {
        const platform = String(WebApp?.platform || '').toLowerCase();
        if (platform && platform !== 'unknown') return true;
    } catch {
        // ignore
    }

    try {
        if (String(WebApp?.initData || '')) return true;
    } catch {
        // ignore
    }

    try {
        return /telegram/i.test(String(navigator.userAgent || ''));
    } catch {
        return false;
    }
}

export async function requestLocation() {
    // Prefer Telegram's LocationManager (native prompt in the Telegram app).
    try {
        const mgr = WebApp.LocationManager;
        if (mgr?.init && mgr?.getLocation) {
            await new Promise((resolve) => {
                try {
                    mgr.init(() => resolve());
                } catch {
                    resolve();
                }
            });

            const loc = await new Promise((resolve) => {
                try {
                    mgr.getLocation((locationData) => resolve(locationData || null));
                } catch {
                    resolve(null);
                }
            });

            const lat = Number(loc?.latitude);
            const lon = Number(loc?.longitude);
            if (Number.isFinite(lat) && Number.isFinite(lon)) return { lat, lon };
        }
    } catch {
        // ignore
    }

    // Fallback: browser geolocation (works in regular mobile browsers).
    try {
        if (!('geolocation' in navigator)) return null;
        const coords = await new Promise((resolve) => {
            navigator.geolocation.getCurrentPosition(
                (pos) => resolve(pos?.coords || null),
                () => resolve(null),
                { enableHighAccuracy: true, timeout: 8000, maximumAge: 30_000 },
            );
        });
        const lat = Number(coords?.latitude);
        const lon = Number(coords?.longitude);
        if (Number.isFinite(lat) && Number.isFinite(lon)) return { lat, lon };
        return null;
    } catch {
        return null;
    }
}

// Safe helper for UI-only display (do not trust for auth).
export function getTelegramUserSafe() {
    try {
        const u = WebApp.initDataUnsafe?.user;
        if (!u?.id) return null;
        return {
            id: Number(u.id),
            firstName: u.first_name ? String(u.first_name) : '',
            lastName: u.last_name ? String(u.last_name) : '',
            username: u.username ? String(u.username) : '',
            photoUrl: u.photo_url ? String(u.photo_url) : '',
        };
    } catch {
        return null;
    }
}
