import { lazy, Suspense, useEffect, useMemo } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Home } from './components/Home';
import { BottomNav } from './components/ui/BottomNav';
import { MiniCartBar } from './components/domain/MiniCartBar';
import { ActiveOrderFab } from './components/domain/ActiveOrderFab';
import { InsetsDebug } from './components/dev/InsetsDebug';
import { api } from './api';
import { getTelegramInitData, getTelegramStartParam, getTelegramUserSafe, isTelegramWebApp, requestWriteAccess } from './telegram';
import { AppStateProvider, useAppState } from './state/AppState';
import { extractAnalyticsAttribution, markAnalyticsReady, trackAnalytics } from './lib/analytics';

const lazyNamed = (loader, name) => lazy(() => loader().then((module) => ({ default: module[name] })));
const ProductDetails = lazyNamed(() => import('./components/ProductDetails'), 'ProductDetails');
const Cart = lazyNamed(() => import('./components/Cart'), 'Cart');
const Checkout = lazyNamed(() => import('./components/Checkout'), 'Checkout');
const Catalog = lazyNamed(() => import('./components/Catalog'), 'Catalog');
const Favorites = lazyNamed(() => import('./components/Favorites'), 'Favorites');
const Recipients = lazyNamed(() => import('./components/Recipients'), 'Recipients');
const Account = lazyNamed(() => import('./components/Account'), 'Account');
const RecipientProfile = lazyNamed(() => import('./components/RecipientProfile'), 'RecipientProfile');
const PaymentManual = lazyNamed(() => import('./components/PaymentManual'), 'PaymentManual');
const PrivacyPolicy = lazyNamed(() => import('./components/Legal'), 'PrivacyPolicy');
const DataProcessingConsent = lazyNamed(() => import('./components/Legal'), 'DataProcessingConsent');
const PublicOffer = lazyNamed(() => import('./components/Legal'), 'PublicOffer');
const WebmasterDashboard = lazyNamed(() => import('./components/webmaster/WebmasterDashboard'), 'WebmasterDashboard');

const REFERRAL_PROFILES = {
    vivienne: {
        id: 2002,
        name: 'Delivery recipient',
        handle: '@flowie.delivery',
        relation: 'Delivery contact',
        image: 'https://images.unsplash.com/photo-1526045612212-70caf35c14df?auto=format&fit=crop&w=900&q=80',
        askAddress: true,
    },
};

const REFERRAL_OPEN_PREFIX = 'flowie:referral-opened:';

function getReferralToken() {
    try {
        const params = new URLSearchParams(window.location?.search || '');
        const raw = params.get('ref') || params.get('creator') || params.get('profile') || getTelegramStartParam() || '';
        return String(raw).trim().toLowerCase().replace(/^creator[_-]?/, '').replace(/[^a-z0-9_-]/g, '');
    } catch {
        return '';
    }
}

function referralWasOpened(token) {
    try {
        return window.sessionStorage?.getItem(`${REFERRAL_OPEN_PREFIX}${token}`) === '1';
    } catch {
        return false;
    }
}

function markReferralOpened(token) {
    try {
        window.sessionStorage?.setItem(`${REFERRAL_OPEN_PREFIX}${token}`, '1');
    } catch {
        // ignore
    }
}

function AppRoutes() {
    const { state, selectors, actions } = useAppState();
    const location = useLocation();
    const navigate = useNavigate();
    const { pathname } = location;

    useEffect(() => {
        trackAnalytics('page_view', {
            meta: {
                path: pathname,
                ...extractAnalyticsAttribution(window.location, document.referrer),
            },
        }, { dedupeKey: pathname });
    }, [pathname]);

    // Load products from DB-backed API so the client vitrine reflects admin toggles (isActive).
    useEffect(() => {
        actions.loadProducts();
        actions.loadUpsells();
        actions.loadCollections();
    }, [actions]);

    useEffect(() => {
        if (!state.products.items.length || !state.cart.items.length) return;
        actions.pruneCartItems(state.products.items.map((p) => p.id));
    }, [actions, state.cart.items, state.products.items]);

    useEffect(() => {
        const token = getReferralToken();
        const profile = REFERRAL_PROFILES[token];
        if (!profile) return;

        const autoOpenAllowed = !referralWasOpened(token);
        const openReferralProfile = (to, { replace = false } = {}) => {
            markReferralOpened(token);
            navigate(to, { replace, state: { fromReferral: token } });
        };

        const existingProfiles = (state.recipients.items || []).filter((r) => String(r?.name || '').toLowerCase() === profile.name.toLowerCase());
        const exists = existingProfiles.sort((a, b) => {
            const bt = Date.parse(b?.updatedAt || b?.createdAt || '') || 0;
            const at = Date.parse(a?.updatedAt || a?.createdAt || '') || 0;
            if (bt !== at) return bt - at;
            return Number(b?.id || 0) - Number(a?.id || 0);
        })[0];
        if (exists) {
            if (state.recipients.selectedId !== exists.id) actions.selectRecipient(exists.id);
            if ((pathname === '/' && autoOpenAllowed) || pathname === `/recipients/${profile.id}`) {
                openReferralProfile(`/recipients/${encodeURIComponent(String(exists.id))}`, { replace: pathname !== '/' });
            }
            return;
        }

        if (!state.auth.me?.id) return;

        actions.addRecipient(profile).then((created) => {
            if (created?.id != null && ((pathname === '/' && autoOpenAllowed) || pathname === `/recipients/${profile.id}`)) {
                openReferralProfile(`/recipients/${encodeURIComponent(String(created.id))}`, { replace: pathname !== '/' });
            }
        }).catch(() => {});
    }, [actions, navigate, pathname, state.auth.me?.id, state.recipients.items, state.recipients.selectedId]);

    const productsById = useMemo(() => {
        const m = new Map();
        for (const p of state.products.items) m.set(String(p.id), p);
        return m;
    }, [state.products.items]);

    const sum = useMemo(() => {
        return (state.cart.items || []).reduce((acc, it) => acc + (productsById.get(String(it.productId))?.price || 0) * it.qty, 0);
    }, [productsById, state.cart.items]);

    const showMiniCart = pathname === '/' || pathname === '/catalog' || pathname === '/shop' || /^\/recipients\/\d+/.test(pathname);
    const miniCartBottom = /^\/recipients\/\d+/.test(pathname)
        ? 'calc(16px + var(--app-nav-inset-bottom))'
        : 'calc(72px + var(--app-nav-inset-bottom))';

    const showBottomNav = !pathname.startsWith('/admin') && !pathname.startsWith('/webmaster') && (
        pathname === '/' ||
        pathname === '/favorites' ||
        pathname === '/recipients' ||
        pathname === '/account' ||
        pathname === '/catalog' ||
        pathname === '/shop'
    );
    const showPaymentFab = Boolean(state.orders.activeOrderId) && pathname.startsWith('/pay/');

    // Keep active order in sync: auto-clear when payment window expires.
    useEffect(() => {
        const raw = state.orders.activeOrderExpiresAt;
        if (!raw) return;
        const expiresAt = new Date(raw).getTime();
        if (!Number.isFinite(expiresAt)) return;
        if (Date.now() > expiresAt) actions.clearActiveOrder();
    }, [actions, state.orders.activeOrderExpiresAt]);

    return (
        <>
            {/* No animated route stack: Telegram WebView + fixed UI behaves more predictably without transforms. */}
            <Suspense fallback={<div style={{ minHeight: '100dvh', background: 'var(--bg)' }} />}>
            <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/product/:id" element={<ProductDetails />} />
                <Route path="/cart" element={<Cart />} />
                <Route path="/checkout" element={<Checkout />} />
                <Route path="/catalog" element={<Catalog />} />
                <Route path="/shop" element={<Catalog />} />

                <Route path="/favorites" element={<Favorites />} />
                <Route path="/recipients" element={<Recipients />} />
                <Route path="/recipients/new" element={<Navigate to="/webmaster" replace />} />
                <Route path="/recipients/:id" element={<RecipientProfile />} />
                <Route path="/chat" element={<Navigate to="/account" replace />} />
                <Route path="/chat/:id" element={<Navigate to="/account" replace />} />
                <Route path="/inbox" element={<Navigate to="/account" replace />} />
                <Route path="/inbox/:id" element={<Navigate to="/account" replace />} />
                <Route path="/account" element={<Account />} />
                <Route path="/pay/:id" element={<PaymentManual />} />
                <Route path="/legal/privacy" element={<PrivacyPolicy />} />
                <Route path="/legal/consent" element={<DataProcessingConsent />} />
                <Route path="/legal/offer" element={<PublicOffer />} />
                <Route path="/webmaster/*" element={<WebmasterDashboard />} />

                <Route path="/success" element={<Navigate to="/" replace />} />
                <Route path="/recipient/:id" element={<Navigate to="/recipients" replace />} />
                <Route path="/admin/*" element={<Navigate to="/webmaster" replace />} />

                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            </Suspense>

            {showBottomNav ? <BottomNav /> : null}

            {showMiniCart ? <MiniCartBar count={selectors.cartCount} sum={sum} bottom={miniCartBottom} floating /> : null}

            {showPaymentFab ? <ActiveOrderFab /> : null}

        </>
    );
}

function AuthBootstrap() {
    const { actions } = useAppState();

    useEffect(() => {
        const bootstrapAuth = async () => {
            const telegramEnabled = import.meta.env.VITE_DISABLE_TELEGRAM_BOOTSTRAP !== 'true';
            const inTg = telegramEnabled && isTelegramWebApp();

            // Try existing session first.
            let me = null;
            try {
                const res = await api.getMe();
                me = res?.user || null;
            } catch (e) {
                if (e?.status !== 401) return;
            }

            const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

            // In Telegram we should prefer initData auth. Some clients populate initData shortly after ready/expand,
            // so do a few short retries before falling back.
            let initData = telegramEnabled ? getTelegramInitData() : '';
            if (inTg && !initData) {
                for (const ms of [0, 80, 200, 400, 700]) {
                    await sleep(ms);
                    initData = getTelegramInitData();
                    if (initData) break;
                }
            }

            // If we're in Telegram and either not logged in OR logged in as a guest (no telegramId),
            // upgrade the session to the Telegram-bound account.
            const tgUser = initData ? getTelegramUserSafe() : null;
            const shouldTelegramLogin =
                Boolean(initData) &&
                (!me ||
                    !me.telegramId ||
                    (tgUser?.id != null && String(me.telegramId || '') && String(me.telegramId) !== String(tgUser.id)));

            if (shouldTelegramLogin) {
                try {
                    await api.telegramLogin(initData);
                } catch (e) {
                    console.error('Telegram login failed:', e);
                    // If Telegram auth fails, do not automatically create a guest account inside Telegram.
                    // Better to keep the user unauthenticated than to split profiles across devices.
                }
            } else if (!me) {
                // Outside Telegram, create a revocable guest session so cart and checkout remain registration-free.
                try {
                    await api.guestLogin();
                } catch (e) {
                    console.error('Guest login failed:', e);
                }
            }

            await actions.loadMe();
            markAnalyticsReady();
        };

        bootstrapAuth();
    }, [actions]);

    return null;
}

function App() {

    useEffect(() => {
        if (import.meta.env.VITE_DISABLE_TELEGRAM_BOOTSTRAP === 'true') return;

        let cancelled = false;
        let sent = false;
        let attempts = 0;

        const sendRefOpen = async () => {
            if (cancelled || sent) return;
            attempts += 1;
            const startParam = getTelegramStartParam();
            if (startParam) {
                sent = true;
                try {
                    await api.trackEvent('ref_open', {
                        tag: startParam,
                        source: 'startapp',
                        path: window.location?.pathname || '/',
                        ...extractAnalyticsAttribution(window.location, document.referrer),
                    });
                } catch {
                    // ignore
                }

                try {
                    const tgUser = getTelegramUserSafe();
                    const key = `flowie:write-access-requested:${startParam}`;
                    const alreadyRequested = window.sessionStorage?.getItem(key) === '1';
                    if (!tgUser?.allowsWriteToPm && !alreadyRequested) {
                        window.sessionStorage?.setItem(key, '1');
                        const allowed = await requestWriteAccess();
                        await api.trackEvent('write_access_requested', {
                            tag: startParam,
                            source: 'startapp',
                            status: allowed ? 'allowed' : 'cancelled',
                        });
                    } else if (tgUser?.allowsWriteToPm) {
                        await api.trackEvent('write_access_requested', {
                            tag: startParam,
                            source: 'startapp',
                            status: 'allowed',
                            alreadyAllowed: true,
                        });
                    }
                } catch {
                    // ignore
                }
                return;
            }

            if (attempts < 5) {
                setTimeout(sendRefOpen, 160 * attempts);
            }
        };

        sendRefOpen();
        return () => {
            cancelled = true;
        };
    }, []);

    const showInsetsDebug = (() => {
        try {
            const s = String(window.location?.search || '');
            return /(?:\\?|&)debugInsets=1(?:&|$)/.test(s);
        } catch {
            return false;
        }
    })();

    return (
        <AppStateProvider>
            <AuthBootstrap />
            <BrowserRouter>
                {showInsetsDebug ? <InsetsDebug /> : null}
                <AppRoutes />
            </BrowserRouter>
        </AppStateProvider>
    );
}

export default App;
