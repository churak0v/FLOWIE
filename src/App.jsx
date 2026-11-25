import { lazy, Suspense, useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Home } from './components/Home';
import { BottomNav } from './components/ui/BottomNav';
import { BottomLoginSheet } from './components/BottomLoginSheet';
import { MiniCartBar } from './components/domain/MiniCartBar';
import { ActiveOrderFab } from './components/domain/ActiveOrderFab';
import { api } from './api';
import { AppStateProvider, useAppState } from './state/AppState';
import { beginAnalyticsPageView, extractAnalyticsAttribution, markAnalyticsReady, trackAnalytics } from './lib/analytics';
import { installBehaviorAnalytics } from './lib/behaviorAnalytics';
import { initialLoginModalState, isVerifiedUser, loginModalReducer } from './lib/authUi';
import { normalizeRegistrationGiftStatus } from './lib/registrationGift';
import { updatePageMetadata } from './lib/pageMetadata';

const lazyNamed = (loader, name) => lazy(() => loader().then((module) => ({ default: module[name] })));
const ProductDetails = lazyNamed(() => import('./components/ProductDetails'), 'ProductDetails');
const Cart = lazyNamed(() => import('./components/Cart'), 'Cart');
const Checkout = lazyNamed(() => import('./components/Checkout'), 'Checkout');
const Catalog = lazyNamed(() => import('./components/Catalog'), 'Catalog');
const MothersDayLanding = lazyNamed(() => import('./components/MothersDayLanding'), 'MothersDayLanding');
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
        const raw = params.get('ref') || params.get('creator') || params.get('profile') || '';
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
    const analyticsLocationRef = useRef('');
    const [loginModal, dispatchLoginModal] = useReducer(loginModalReducer, initialLoginModalState);
    const [registrationGiftStatus, setRegistrationGiftStatus] = useState(() => normalizeRegistrationGiftStatus(null));
    const verifiedUser = isVerifiedUser(state.auth.me);

    useEffect(() => {
        updatePageMetadata({
            pathname,
            search: location.search,
            products: state.products.items,
            origin: window.location.origin,
        });
    }, [location.search, pathname, state.products.items]);

    const refreshRegistrationGift = useCallback(async () => {
        const next = normalizeRegistrationGiftStatus(await api.getRegistrationGiftStatus());
        setRegistrationGiftStatus(next);
        return next;
    }, []);

    useEffect(() => {
        let alive = true;
        api.getRegistrationGiftStatus()
            .then((value) => { if (alive) setRegistrationGiftStatus(normalizeRegistrationGiftStatus(value)); })
            .catch(() => { if (alive) setRegistrationGiftStatus(normalizeRegistrationGiftStatus(null)); });
        return () => { alive = false; };
    }, [state.auth.me?.id, state.auth.me?.phoneVerified]);

    const registrationGift = useMemo(() => ({
        status: registrationGiftStatus,
        onExpose: async ({ placement }) => {
            const result = await api.exposeRegistrationGift({ placement });
            const next = result?.status || result;
            if (next && typeof next === 'object') setRegistrationGiftStatus(normalizeRegistrationGiftStatus(next));
            else await refreshRegistrationGift();
        },
        onRefresh: refreshRegistrationGift,
    }), [refreshRegistrationGift, registrationGiftStatus]);

    useEffect(() => {
        if (verifiedUser && loginModal.open) dispatchLoginModal({ type: 'SUCCESS' });
    }, [loginModal.open, verifiedUser]);

    useEffect(() => {
        const analyticsLocation = `${pathname}${location.search}`;
        if (analyticsLocationRef.current !== analyticsLocation) {
            analyticsLocationRef.current = analyticsLocation;
            beginAnalyticsPageView(pathname);
        }
        trackAnalytics('page_view', {
            meta: {
                path: pathname,
                ...extractAnalyticsAttribution(window.location, document.referrer),
            },
        }, { dedupeKey: analyticsLocation });
        return installBehaviorAnalytics(document);
    }, [location.search, pathname]);

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

    const showMiniCart = pathname === '/' || pathname === '/catalog' || pathname === '/shop' || pathname === '/mothers-day' || /^\/recipients\/\d+/.test(pathname);
    const miniCartBottom = pathname === '/mothers-day' || /^\/recipients\/\d+/.test(pathname)
        ? 'calc(16px + var(--app-nav-inset-bottom))'
        : 'calc(108px + var(--app-nav-inset-bottom))';

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
            {/* Keep the route stack transform-free so fixed mobile controls stay stable. */}
            <Suspense fallback={<div style={{ minHeight: '100dvh', background: 'var(--bg)' }} />}>
            <Routes>
                <Route path="/" element={<Home registrationGift={registrationGift} onLogin={() => dispatchLoginModal({ type: 'OPEN', intendedDestination: null })} />} />
                <Route path="/product/:id" element={<ProductDetails registrationGift={registrationGift} onLogin={() => dispatchLoginModal({ type: 'OPEN', intendedDestination: null })} />} />
                <Route path="/cart" element={<Cart />} />
                <Route path="/checkout" element={<Checkout />} />
                <Route path="/catalog" element={<Catalog />} />
                <Route path="/shop" element={<Catalog />} />
                <Route path="/mothers-day" element={<MothersDayLanding />} />

                <Route path="/favorites" element={<Favorites />} />
                <Route path="/recipients" element={<Recipients />} />
                <Route path="/recipients/new" element={<Navigate to="/webmaster" replace />} />
                <Route path="/recipients/:id" element={<RecipientProfile />} />
                <Route path="/chat" element={<Navigate to="/account" replace />} />
                <Route path="/chat/:id" element={<Navigate to="/account" replace />} />
                <Route path="/inbox" element={<Navigate to="/account" replace />} />
                <Route path="/inbox/:id" element={<Navigate to="/account" replace />} />
                <Route path="/account" element={<Account registrationGift={registrationGift} />} />
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

            {showBottomNav ? (
                <BottomNav
                    user={state.auth.me}
                    onLogin={() => dispatchLoginModal({ type: 'OPEN', intendedDestination: null })}
                />
            ) : null}

            {showMiniCart ? <MiniCartBar count={selectors.cartCount} sum={sum} bottom={miniCartBottom} floating /> : null}

            {showPaymentFab ? <ActiveOrderFab /> : null}

            <BottomLoginSheet
                open={loginModal.open}
                initialPhone={state.auth.me?.phone || '+7'}
                onClose={() => dispatchLoginModal({ type: 'CLOSE' })}
                onSuccess={async () => {
                    const user = await actions.loadMe();
                    if (!isVerifiedUser(user)) return;
                    try {
                        await refreshRegistrationGift();
                    } catch {
                        // Auth succeeds independently; status is refreshed again when auth state changes.
                    }
                    const destination = loginModal.intendedDestination;
                    dispatchLoginModal({ type: 'SUCCESS' });
                    if (destination && destination !== pathname) navigate(destination);
                }}
            />

        </>
    );
}

function AuthBootstrap() {
    const { actions } = useAppState();

    useEffect(() => {
        const bootstrapAuth = async () => {
            // Try existing session first.
            let me = null;
            try {
                const res = await api.getMe();
                me = res?.user || null;
            } catch (e) {
                if (e?.status !== 401) return;
            }

            if (!me) {
                // Create a revocable guest session so cart and checkout work without registration.
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
    return (
        <AppStateProvider>
            <AuthBootstrap />
            <BrowserRouter>
                <AppRoutes />
            </BrowserRouter>
        </AppStateProvider>
    );
}

export default App;
