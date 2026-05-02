import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppShell } from './layout/AppShell';
import { Surface } from './ui/Surface';
import { HeroBlock } from './domain/HeroBlock';
import { SubscriptionRow } from './domain/SubscriptionRow';
import { ActiveOrderCard } from './domain/ActiveOrderCard';
import { FrequentlyOrderedSection } from './domain/FrequentlyOrderedSection';
import { AddressPickerSheet } from './domain/AddressPickerSheet';
import { Text } from './ui/Text';
import { HERO_SLIDES } from '../data/mock';
import { api } from '../api';
import { useAppState } from '../state/AppState';
import { buildActiveOrderPreview } from '../lib/orderPreview';
import { isCacheFresh, readCacheEntry, writeCacheEntry } from '../lib/persistedCache';

export function Home() {
  const navigate = useNavigate();
  const { state, actions } = useAppState();
  const activeOrder = state.orders.activeOrderPreview;
  const [addressOpen, setAddressOpen] = useState(false);
  const [heroSlides, setHeroSlides] = useState(HERO_SLIDES);

  useEffect(() => {
    let alive = true;

    const cacheKey = 'home_config_v1';
    const cached = readCacheEntry(cacheKey);
    const cachedSlides = Array.isArray(cached?.data?.heroSlides) ? cached.data.heroSlides : null;
    if (cachedSlides?.length) setHeroSlides(cachedSlides);

    const shouldFetch = !cachedSlides?.length || !isCacheFresh(cached, 5 * 60_000);
    if (!shouldFetch) {
      return () => {
        alive = false;
      };
    }

    fetch('/config/home.json', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((cfg) => {
        if (!alive) return;
        if (cfg?.heroSlides?.length) {
          setHeroSlides(cfg.heroSlides);
          writeCacheEntry(cacheKey, { heroSlides: cfg.heroSlides });
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // Load active order details for card.
  useEffect(() => {
    let cancelled = false;
    const id = state.orders.activeOrderId;
    const previewId = state.orders.activeOrderPreview?.id;

    const loadById = async (orderId) => {
      try {
        const res = await api.getOrder(orderId);
        const order = res?.order || null;
        if (!cancelled && order?.id != null) {
          actions.setActiveOrder(order.id, order.paymentExpiresAt || null, buildActiveOrderPreview(order));
        }
      } catch (e) {
        // Keep the cached preview on transient failures; clear only if the order is gone.
        if (!cancelled && e?.status === 404) actions.clearActiveOrder();
      }
    };

    const loadFallback = async () => {
      try {
        const res = await api.getOrders({ statuses: 'PAYMENT_PENDING,PAID,CONFIRMED' });
        const first = Array.isArray(res) ? res[0] : null;
        if (cancelled) return;
        if (first?.id != null) {
          actions.setActiveOrder(first.id, first.paymentExpiresAt || null, buildActiveOrderPreview(first));
        } else {
          actions.clearActiveOrder();
        }
      } catch {
        // ignore
      }
    };

    if (id) {
      const samePreview = previewId != null && String(previewId) === String(id);
      if (!samePreview) loadById(id);
    } else {
      loadFallback();
    }

    return () => {
      cancelled = true;
    };
  }, [actions, state.orders.activeOrderId, state.orders.activeOrderPreview?.id]);

  const slides = useMemo(
    () => {
      const out = [];
      const seen = new Set();
      for (const s of heroSlides || []) {
        const media = s?.video || s?.image || '';
        const key = String(s?.id ?? `${media}::${s?.caption || ''}`);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        out.push({ id: key, image: s?.image, video: s?.video, caption: s?.caption, subtitle: s?.subtitle, href: s?.href });
      }
      return out;
    },
    [heroSlides]
  );

  return (
    <>
      <AppShell style={{ padding: 0, '--app-content-inset-bottom': '0px' }}>
        {/* Fixed HERO underlay */}
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 'min(100%, var(--app-max))',
            height: 'calc(55vh + 48px)',
            zIndex: 0,
          }}
        >
          <HeroBlock slides={slides} address={state.delivery?.address} onAddressClick={() => setAddressOpen(true)} />
        </div>

        {/* Scrollable content panel */}
        <div style={{ position: 'relative', zIndex: 10, marginTop: '54vh' }}>
          <Surface
            variant="default"
            style={{
              borderTopLeftRadius: 'var(--r-xl)',
              borderTopRightRadius: 'var(--r-xl)',
              borderBottomLeftRadius: 0,
              borderBottomRightRadius: 0,
              paddingTop: 'var(--sp-8)',
              paddingLeft: 'calc(var(--sp-4) + var(--app-inset-left))',
              paddingRight: 'calc(var(--sp-4) + var(--app-inset-right))',
              // Reserve only the visible BottomNav pill height (safe-area padding is transparent).
              paddingBottom: 'calc(var(--sp-8) + var(--app-bottom-nav-space))',
              background: 'var(--bg)',
              boxShadow: '0 -10px 30px var(--c-ink-06)',
            }}
          >
            <div
              style={{
                width: 44,
                height: 5,
                borderRadius: 'var(--r-pill)',
                background: 'var(--c-ink-14)',
                margin: '-18px auto var(--sp-6)',
              }}
            />

            <SubscriptionRow />

            {activeOrder ? (
              <div style={{ marginTop: 'var(--sp-6)' }}>
                <ActiveOrderCard order={activeOrder} onClick={() => navigate(`/pay/${encodeURIComponent(String(activeOrder.id))}`)} />
              </div>
            ) : null}

	            <div style={{ marginTop: 'var(--sp-8)' }}>
	              <Text variant="title" style={{ marginBottom: 'var(--sp-4)' }}>
	                Авторская коллекция
	              </Text>
	              <FrequentlyOrderedSection products={state.products.items} />
	            </div>

          </Surface>
        </div>
      </AppShell>

      <AddressPickerSheet open={addressOpen} onClose={() => setAddressOpen(false)} />
    </>
  );
}
