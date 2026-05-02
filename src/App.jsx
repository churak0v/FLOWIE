import { useEffect, useMemo } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Home } from './components/Home';
import { ProductDetails } from './components/ProductDetails';
import { Cart } from './components/Cart';
import { Checkout } from './components/Checkout';
import { Catalog } from './components/Catalog';
import { Favorites } from './components/Favorites';
import { Recipients } from './components/Recipients';
import { Inbox } from './components/Inbox';
import { ChatThread } from './components/ChatThread';
import { Account } from './components/Account';
import { RecipientNew } from './components/RecipientNew';
import { RecipientProfile } from './components/RecipientProfile';
import { PaymentManual } from './components/PaymentManual';
import { DataProcessingConsent, PrivacyPolicy, PublicOffer } from './components/Legal';
import { BottomNav } from './components/ui/BottomNav';
import { AdminLayout } from './components/admin/AdminLayout';
import { AdminOrders } from './components/admin/AdminOrders';
import { AdminProducts } from './components/admin/AdminProducts';
import { AdminSettings } from './components/admin/AdminSettings';
import { AdminStats } from './components/admin/AdminStats';
import { MiniCartBar } from './components/domain/MiniCartBar';
import { ActiveOrderFab } from './components/domain/ActiveOrderFab';
import { InsetsDebug } from './components/dev/InsetsDebug';
import { api } from './api';
import { getTelegramInitData, getTelegramStartParam, getTelegramUserSafe, isTelegramWebApp, requestLocation } from './telegram';
import { reverseGeocodeOSM } from './lib/reverseGeocode';
import { AppStateProvider, useAppState } from './state/AppState';

function AppRoutes() {
    const { state, selectors, actions } = useAppState();
    const location = useLocation();
    const { pathname } = location;

    // Load products from DB-backed API so the client vitrine reflects admin toggles (isActive).
    useEffect(() => {
        actions.loadProducts();
        actions.loadUpsells();
        actions.loadCollections();
    }, [actions]);

    // Load server-side profile (phone, etc). Retry briefly to survive auth bootstrap race.
    useEffect(() => {
        let alive = true;
        let attempt = 0;

        const run = async () => {
            attempt += 1;
            try {
                const me = await actions.loadMe();
                if (me) return;
            } catch {
                // ignore
            }

            // If still not loaded and we might be mid-login, retry a couple times.
            if (!alive) return;
            if (attempt < 4) {
                setTimeout(run, 250 * attempt);
            }
        };

        run();
        return () => {
            alive = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [actions]);

    const productsById = useMemo(() => {
        const m = new Map();
        for (const p of state.products.items) m.set(p.id, p);
        return m;
    }, [state.products.items]);

    const sum = useMemo(() => {
        return (state.cart.items || []).reduce((acc, it) => acc + (productsById.get(it.productId)?.price || 0) * it.qty, 0);
    }, [productsById, state.cart.items]);

    const hideMiniCart =
        pathname.startsWith('/admin') ||
        pathname === '/cart' ||
        pathname === '/checkout' ||
        pathname.startsWith('/pay') ||
        pathname.startsWith('/chat') ||
        pathname.startsWith('/recipients/new') ||
        pathname.startsWith('/legal');

    const miniCartBottom = pathname.startsWith('/product/')
        ? 'calc(85px + var(--app-nav-inset-bottom))'
        : 'calc(72px + var(--app-nav-inset-bottom))';

    const showBottomNav = !pathname.startsWith('/admin') && (
        pathname === '/' ||
        pathname === '/favorites' ||
        pathname === '/recipients' ||
        pathname === '/chat' ||
        pathname === '/account' ||
        pathname === '/catalog'
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

    // Ask for geolocation permission on first app launch (TG-friendly).
    useEffect(() => {
        if (state.delivery?.coords) return;
        if (state.delivery?.locationRequested) return;

        let cancelled = false;
        actions.markLocationRequested();

        (async () => {
            const loc = await requestLocation();
            if (cancelled || !loc) return;

            actions.setDeliveryCoords(loc);

            // Best-effort: prefill street/house for UI. If reverse-geocode fails, the user can enter it manually.
            try {
                const geo = await reverseGeocodeOSM(loc);
                if (!cancelled && geo?.street) actions.setDeliveryAddress(geo);
            } catch {
                // ignore
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [actions, state.delivery?.coords, state.delivery?.locationRequested]);

    return (
        <>
            {/* No animated route stack: Telegram WebView + fixed UI behaves more predictably without transforms. */}
            <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/product/:id" element={<ProductDetails />} />
                <Route path="/cart" element={<Cart />} />
                <Route path="/checkout" element={<Checkout />} />
                <Route path="/catalog" element={<Catalog />} />

                <Route path="/favorites" element={<Favorites />} />
                <Route path="/recipients" element={<Recipients />} />
                <Route path="/recipients/new" element={<RecipientNew />} />
                <Route path="/recipients/:id" element={<RecipientProfile />} />
                <Route path="/chat" element={<Inbox />} />
                <Route path="/chat/:id" element={<ChatThread />} />
                <Route path="/inbox" element={<Navigate to="/chat" replace />} />
                <Route path="/inbox/:id" element={<Navigate to="/chat" replace />} />
                <Route path="/account" element={<Account />} />
                <Route path="/pay/:id" element={<PaymentManual />} />
                <Route path="/legal/privacy" element={<PrivacyPolicy />} />
                <Route path="/legal/consent" element={<DataProcessingConsent />} />
                <Route path="/legal/offer" element={<PublicOffer />} />

                {/* Legacy routes from the previous flow (keep links working) */}
                <Route path="/success" element={<Navigate to="/" replace />} />
                <Route path="/recipient/:id" element={<Navigate to="/recipients" replace />} />

                {/* Legacy in-app admin routes (will be removed after external admin deploy is stable) */}
                <Route path="/admin" element={<AdminLayout />}>
                    <Route index element={<Navigate to="orders" replace />} />
                    <Route path="orders" element={<AdminOrders />} />
                    <Route path="products" element={<AdminProducts />} />
                    <Route path="stats" element={<AdminStats />} />
                    <Route path="settings" element={<AdminSettings />} />
                </Route>

                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>

            {showBottomNav ? <BottomNav /> : null}

            {hideMiniCart ? null : <MiniCartBar count={selectors.cartCount} sum={sum} bottom={miniCartBottom} />}

            {showPaymentFab ? <ActiveOrderFab /> : null}

        </>
    );
}

function App() {
    useEffect(() => {
        const bootstrapAuth = async () => {
            const inTg = isTelegramWebApp();

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
            let initData = getTelegramInitData();
            if (inTg && !initData) {
                for (const ms of [0, 80, 200, 400, 700]) {
                    // eslint-disable-next-line no-await-in-loop
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
                    return;
                } catch (e) {
                    console.error('Telegram login failed:', e);
                    // If Telegram auth fails, do not automatically create a guest account inside Telegram.
                    // Better to keep the user unauthenticated than to split profiles across devices.
                    return;
                }
            }

            // Outside Telegram (or no initData available), fall back to guest session only if we don't have one yet.
            if (!me) {
                try {
                    await api.guestLogin();
                } catch (e) {
                    console.error('Guest login failed:', e);
                }
            }
        };

        bootstrapAuth();
    }, []);

    useEffect(() => {
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
                        href: String(window.location?.href || ''),
                    });
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
            <BrowserRouter>
                {showInsetsDebug ? <InsetsDebug /> : null}
                <AppRoutes />
            </BrowserRouter>
        </AppStateProvider>
    );
}

export default App;
