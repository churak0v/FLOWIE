import React, { useEffect, useMemo, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { AppShell } from './layout/AppShell';
import { Surface } from './ui/Surface';
import { HeroBlock } from './domain/HeroBlock';
import { AppImage } from './ui/AppImage';
import { SubscriptionRow } from './domain/SubscriptionRow';
import { ActiveOrderCard } from './domain/ActiveOrderCard';
import { FrequentlyOrderedSection } from './domain/FrequentlyOrderedSection';
import { Text } from './ui/Text';
import { HERO_SLIDES } from '../data/mock';
import { api } from '../api';
import { useAppState } from '../state/AppState';
import { buildActiveOrderPreview } from '../lib/orderPreview';
import { isCacheFresh, readCacheEntry, writeCacheEntry } from '../lib/persistedCache';

const HOME_BANNERS_CACHE_KEY = 'home_banners_v2';

function PickTile({ title, subtitle, image, href, accent = false }) {
  return (
    <Link
      to={href}
      style={{
        position: 'relative',
        minWidth: 156,
        height: 126,
        border: 0,
        borderRadius: 18,
        padding: 0,
        overflow: 'hidden',
        cursor: 'pointer',
        textAlign: 'left',
        textDecoration: 'none',
        background: accent ? 'var(--c-text)' : 'var(--surface)',
        boxShadow: 'var(--shadow-1)',
        flex: '0 0 156px',
      }}
      aria-label={title}
      data-href={href}
    >
      {image ? (
        <AppImage
          src={image}
          alt=""
          variant="tile"
          loading="lazy"
          decoding="async"
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            filter: 'saturate(1.04)',
          }}
        />
      ) : null}
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          background: accent
            ? 'linear-gradient(180deg, rgba(13,13,13,0.16), rgba(13,13,13,0.74))'
            : 'linear-gradient(180deg, rgba(13,13,13,0.03), rgba(13,13,13,0.58))',
        }}
      />
      <span
        style={{
          position: 'absolute',
          left: 12,
          right: 12,
          bottom: 12,
          color: 'var(--c-white)',
          display: 'grid',
          gap: 3,
        }}
      >
        <span style={{ fontSize: 15, fontWeight: 1000, lineHeight: 1.1 }}>{title}</span>
        <span style={{ fontSize: 11, fontWeight: 850, opacity: 0.82, lineHeight: 1.15 }}>{subtitle}</span>
      </span>
    </Link>
  );
}

function QuickPicks({ products }) {
  const cards = [
    {
      title: 'Нежные',
      subtitle: 'воздушные букеты',
      href: '/catalog?scenario=easy-yes',
      image: products[1]?.image || products[0]?.image,
    },
    {
      title: 'Яркие',
      subtitle: 'когда хочется вау',
      href: '/catalog?scenario=make-it-special',
      image: products[4]?.image || products[2]?.image,
      accent: true,
    },
    {
      title: 'До 5 000 ₽',
      subtitle: 'красиво без перегруза',
      href: '/catalog?scenario=under-5000',
      image: products[2]?.image || products[0]?.image,
    },
    {
      title: 'Большой жест',
      subtitle: 'для важных дат',
      href: '/catalog?scenario=big-gesture',
      image: products[12]?.image || products[5]?.image,
    },
  ].filter((x) => x.image);

  if (!cards.length) return null;

  return (
    <section style={{ marginTop: 18 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
        <Text variant="subtitle">Выбрать по настроению</Text>
        <Text variant="caption" muted>без долгих поисков</Text>
      </div>
      <div
        className="hide-scrollbar"
        style={{
          display: 'flex',
          gap: 10,
          overflowX: 'auto',
          marginLeft: 'calc(0px - var(--sp-4) - var(--app-inset-left))',
          marginRight: 'calc(0px - var(--sp-4) - var(--app-inset-right))',
          paddingTop: 2,
          paddingRight: 'calc(var(--sp-4) + var(--app-inset-right))',
          paddingBottom: 8,
          paddingLeft: 'calc(var(--sp-4) + var(--app-inset-left))',
          scrollPaddingLeft: 'calc(var(--sp-4) + var(--app-inset-left))',
          scrollPaddingRight: 'calc(var(--sp-4) + var(--app-inset-right))',
        }}
      >
        {cards.map((card) => (
          <PickTile key={card.title} {...card} />
        ))}
      </div>
    </section>
  );
}

export function Home() {
  const navigate = useNavigate();
  const { state, actions } = useAppState();
  const activeOrder = state.orders.activeOrderPreview;
  const [activeOrders, setActiveOrders] = useState([]);
  const [heroSlides] = useState(() => {
    const cached = readCacheEntry(HOME_BANNERS_CACHE_KEY);
    const cachedSlides = Array.isArray(cached?.data?.heroSlides) ? cached.data.heroSlides : null;
    return cachedSlides?.length ? cachedSlides : HERO_SLIDES;
  });
  const isAuthenticated = Boolean(state.auth.me?.phoneVerified);

  useEffect(() => {
    let alive = true;
    const cacheKey = HOME_BANNERS_CACHE_KEY;
    const cached = readCacheEntry(cacheKey);
    const cachedSlides = Array.isArray(cached?.data?.heroSlides) ? cached.data.heroSlides : null;
    if (!cachedSlides?.length || !isCacheFresh(cached, 60_000)) {
      api.getHomeBanners().then(result => {
        if (!alive) return;
        const slides = Array.isArray(result?.heroSlides) ? result.heroSlides : [];
        if (slides.length) {
          // Do not replace the hero whose bundled preload is already in flight.
          // The refreshed banner set is picked up on the next page load.
          writeCacheEntry(cacheKey, { heroSlides: slides });
        }
      }).catch(() => {}); // Keep bundled banners if API is unavailable.
    }
    return () => { alive = false; };
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
            left: 0,
            width: '100vw',
            height: 'calc(55dvh + 48px)',
            zIndex: 0,
          }}
        >
          <HeroBlock slides={slides} />
        </div>

        {/* Scrollable content panel */}
        <div style={{ position: 'relative', zIndex: 10, marginTop: '54dvh' }}>
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

            {isAuthenticated ? <SubscriptionRow /> : null}

            <div style={{ marginTop: isAuthenticated ? 0 : -6 }}>
              <QuickPicks products={state.products.items || []} />
            </div>

            {activeOrders.length ? (
              <div style={{ marginTop: 'var(--sp-6)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
                  <Text variant="title">Активные заказы</Text>
                  <Text variant="caption" muted>В работе: {activeOrders.length}</Text>
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
                <Text variant="title">Цветы на сегодня</Text>
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
                  Каталог
                  <ChevronRight size={16} />
                </button>
              </div>
              <FrequentlyOrderedSection products={state.products.items} limit={8} showMoreHref="/shop" showMoreLabel="Показать ещё букеты" />
            </div>

          </Surface>
        </div>
      </AppShell>

    </>
  );
}
