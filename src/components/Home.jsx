import React, { useEffect, useMemo, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { AppShell } from './layout/AppShell';
import { Surface } from './ui/Surface';
import { HeroBlock } from './domain/HeroBlock';
import { SubscriptionRow } from './domain/SubscriptionRow';
import { ActiveOrderCard } from './domain/ActiveOrderCard';
import { FrequentlyOrderedSection } from './domain/FrequentlyOrderedSection';
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
  const [activeOrders, setActiveOrders] = useState([]);
  const [heroSlides, setHeroSlides] = useState(HERO_SLIDES);

  useEffect(() => {
    let alive = true;

    const cacheKey = 'home_config_v7';
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

  // Load active order details for the home cards.
  useEffect(() => {
    let cancelled = false;
    const activeStatuses = 'PAYMENT_PENDING,PAID,ACCEPTED,ASSEMBLED,IN_DELIVERY';

    const loadActiveOrders = async () => {
      try {
        const res = await api.getOrders({ statuses: activeStatuses });
        const orders = Array.isArray(res) ? res : [];
        if (cancelled) return;

        const previews = orders.map(buildActiveOrderPreview).filter(Boolean);
        setActiveOrders(previews);

        const first = previews[0] || null;
        if (first?.id != null) {
          actions.setActiveOrder(first.id, first.paymentExpiresAt || null, first);
        } else {
          actions.clearActiveOrder();
        }
      } catch {
        // Keep the current UI on transient API failures.
      }
    };

    loadActiveOrders();
    const timer = window.setInterval(loadActiveOrders, 45_000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [actions]);

  const slides = useMemo(
    () => {
      const out = [];
      const seen = new Set();
      for (const s of heroSlides || []) {
        const media = s?.video || s?.image || '';
        const key = String(s?.id ?? `${media}::${s?.caption || ''}`);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        out.push({ id: key, image: s?.image, video: s?.video, imagePosition: s?.imagePosition, caption: s?.caption, subtitle: s?.subtitle, href: s?.href });
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
          <HeroBlock slides={slides} />
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

            {activeOrders.length ? (
              <div style={{ marginTop: 'var(--sp-6)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
                  <Text variant="title">Active gifts</Text>
                  <Text variant="caption" muted>{activeOrders.length} in progress</Text>
                </div>

                <div style={{ display: 'grid', gap: 10 }}>
                  {activeOrders.map((order) => (
                    <ActiveOrderCard
                      key={order.id}
                      order={order}
                      onClick={() => navigate(`/pay/${encodeURIComponent(String(order.id))}`)}
                    />
                  ))}
                </div>
              </div>
            ) : null}

            <div style={{ marginTop: 'var(--sp-8)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 'var(--sp-4)' }}>
                <Text variant="title">What would make her smile?</Text>
                <button
                  type="button"
                  onClick={() => navigate('/shop')}
                  style={{
                    border: 0,
                    background: 'transparent',
                    color: 'var(--accent)',
                    fontWeight: 1000,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    padding: 0,
                  }}
                >
                  Shop
                  <ChevronRight size={16} />
                </button>
              </div>
              <FrequentlyOrderedSection products={state.products.items} limit={8} showMoreHref="/shop" showMoreLabel="Show more gifts" />
            </div>

          </Surface>
        </div>
      </AppShell>

    </>
  );
}
