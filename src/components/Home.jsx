import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppShell } from './layout/AppShell';
import { Surface } from './ui/Surface';
import { HeroBlock } from './domain/HeroBlock';
import { SubscriptionRow } from './domain/SubscriptionRow';
import { ActiveOrderCard } from './domain/ActiveOrderCard';
import { Text } from './ui/Text';
import { HERO_SLIDES } from '../data/mock';
import { api } from '../api';
import { useAppState } from '../state/AppState';
import { buildActiveOrderPreview } from '../lib/orderPreview';
import { readCacheEntry, writeCacheEntry } from '../lib/persistedCache';
import { isMothersDayCampaignActive, MOTHERS_DAY_CATALOG_HREF } from '../lib/mothersDayCampaign';
import { buildHomeFeed } from '../lib/homeFeed';
import { HomeFeedSection } from './domain/HomeFeedSection';
import { HomeStoryBanner } from './domain/HomeStoryBanner';
import { HomeBudgetExplorer } from './domain/HomeBudgetExplorer';
import { HomeCareGuide } from './domain/HomeCareGuide';
import { RegistrationGiftOffer } from './domain/RegistrationGiftOffer';

const HOME_BANNERS_CACHE_KEY = 'home_banners_v2';
const HOME_BANNERS_TIMEOUT_MS = 4_000;

function cachedHomeSlides() {
  const cached = readCacheEntry(HOME_BANNERS_CACHE_KEY);
  return Array.isArray(cached?.data?.heroSlides) ? cached.data.heroSlides : [];
}

export function Home({ onLogin, registrationGift }) {
  const navigate = useNavigate();
  const { state, actions } = useAppState();
  const [activeOrders, setActiveOrders] = useState([]);
  const heroRef = useRef(null);
  const [initialHeroSlides] = useState(() => {
    const cached = cachedHomeSlides();
    return cached.length ? cached : HERO_SLIDES;
  });
  const [heroSlides, setHeroSlides] = useState(initialHeroSlides);
  const isAuthenticated = Boolean(state.auth.me?.phoneVerified);
  const mothersDayCampaignActive = isMothersDayCampaignActive();

  useEffect(() => {
    // Keep the image behind the rising sheet without an edge-attached fixed
    // container. Safari extends the background of such containers into its UI.
    let frame = 0;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => {
      frame = 0;
      const hero = heroRef.current;
      if (!hero) return;
      const offset = reducedMotion.matches ? 0 : Math.min(Math.max(window.scrollY, 0), hero.offsetHeight);
      hero.style.transform = `translate3d(0, ${offset}px, 0)`;
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    reducedMotion.addEventListener('change', schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      reducedMotion.removeEventListener('change', schedule);
    };
  }, []);

  useEffect(() => {
    let alive = true;
    let timeoutId;
    const timeout = new Promise((_, reject) => {
      timeoutId = window.setTimeout(() => reject(new Error('HOME_BANNERS_TIMEOUT')), HOME_BANNERS_TIMEOUT_MS);
    });
    Promise.race([api.getHomeBanners(), timeout]).then((result) => {
      if (!alive) return;
      const nextSlides = Array.isArray(result?.heroSlides) ? result.heroSlides.filter(Boolean) : [];
      if (!nextSlides.length) throw new Error('HOME_BANNERS_EMPTY');
      writeCacheEntry(HOME_BANNERS_CACHE_KEY, { heroSlides: nextSlides });
      setHeroSlides(nextSlides);
    }).catch(() => {
      if (!alive || initialHeroSlides.length) return;
      setHeroSlides(HERO_SLIDES);
    }).finally(() => window.clearTimeout(timeoutId));
    return () => { alive = false; window.clearTimeout(timeoutId); };
  }, [initialHeroSlides]);

  useEffect(() => {
    let cancelled = false;
    const loadActiveOrders = async () => {
      try {
        const res = await api.getOrders({ statuses: 'PAYMENT_PENDING,PAID,ACCEPTED,ASSEMBLED,IN_DELIVERY' });
        const previews = (Array.isArray(res) ? res : []).map(buildActiveOrderPreview).filter(Boolean);
        if (cancelled) return;
        setActiveOrders(previews);
        const first = previews[0] || null;
        if (first?.id != null) actions.setActiveOrder(first.id, first.paymentExpiresAt || null, first);
        else actions.clearActiveOrder();
      } catch { /* Keep the current UI on transient API failures. */ }
    };
    loadActiveOrders();
    const timer = window.setInterval(loadActiveOrders, 45_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [actions]);

  const slides = useMemo(() => {
    const out = []; const seen = new Set();
    for (const slide of heroSlides || []) {
      const media = slide?.video || slide?.image || '';
      const key = String(slide?.id ?? `${media}::${slide?.caption || ''}`);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const isMothersDay = mothersDayCampaignActive && String(slide?.id || '').toLowerCase() === 'mother';
      out.push({ ...slide, id: key, subtitle: isMothersDay ? 'Предзаказ на 29 ноября · выбрать букет' : slide?.subtitle,
        href: isMothersDay ? MOTHERS_DAY_CATALOG_HREF : slide?.href });
    }
    return out;
  }, [heroSlides, mothersDayCampaignActive]);

  const feed = useMemo(() => buildHomeFeed(state.products.items), [state.products.items]);
  const hasMiniCart = Boolean(state.cart.items.length);

  return (
    <AppShell style={{ padding: 0, '--app-content-inset-bottom': '0px' }}>
      <main className="homeScene" style={{ position: 'relative', isolation: 'isolate', width: '100%', paddingBottom: `calc(var(--app-bottom-nav-space) + ${hasMiniCart ? '64px' : '0px'})` }}>
        <section
          ref={heroRef}
          aria-label="Главные предложения"
          style={{
            position: 'absolute',
            zIndex: 0,
            top: 0,
            left: 0,
            width: '100%',
            height: 'var(--home-hero-height)',
            overflow: 'hidden',
            willChange: 'transform',
          }}
        >
          <HeroBlock slides={slides} isAuthenticated={isAuthenticated} onLogin={onLogin} />
        </section>

        <div aria-hidden="true" style={{ height: 'calc(var(--home-hero-height) - 28px)', pointerEvents: 'none' }} />

        <Surface variant="default" style={{ position: 'relative', zIndex: 1, minHeight: '65dvh', borderTopLeftRadius: 28, borderTopRightRadius: 28, borderBottomLeftRadius: 0, borderBottomRightRadius: 0, boxShadow: '0 -14px 36px rgba(31, 15, 22, 0.14)', paddingTop: 'var(--sp-6)', paddingLeft: 'calc(var(--sp-4) + var(--app-inset-left))', paddingRight: 'calc(var(--sp-4) + var(--app-inset-right))', paddingBottom: 'var(--sp-4)', background: 'var(--bg)' }}>
          {isAuthenticated ? <SubscriptionRow /> : null}

          {activeOrders.length ? <section style={{ marginTop: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
              <Text variant="title">Активные заказы</Text><Text variant="caption" muted>В работе: {activeOrders.length}</Text>
            </div>
            <div style={{ display: 'grid', gap: 10 }}>{activeOrders.map((order) => <ActiveOrderCard key={order.id} order={order} onClick={() => navigate(`/pay/${encodeURIComponent(String(order.id))}`)} />)}</div>
          </section> : null}

          <HomeFeedSection title="Выбрать букет" subtitle="Цветы для ваших людей" products={feed.opening} href="/catalog" marginTop={activeOrders.length || isAuthenticated ? 30 : 0} />
          <RegistrationGiftOffer
            status={registrationGift?.status}
            user={state.auth.me}
            placement="home"
            onExpose={registrationGift?.onExpose}
            onRefresh={registrationGift?.onRefresh}
            onLogin={onLogin}
          />
          <HomeStoryBanner bannerId="home-photo-proof" eyebrow="Спокойнее выбирать" title="Сначала фото. Потом доставка." text="Перед отправкой пришлём фото готового букета." image={feed.photoBanner?.image || feed.photoBanner?.images?.[0]} href="/catalog" />
          <HomeBudgetExplorer products={feed.budgetPool} />
          <HomeStoryBanner bannerId="home-clear-price" eyebrow="Без сюрпризов в корзине" title="Красивый жест. Понятная цена." text="Стоимость доставки рассчитывается по адресу." image={feed.priceBanner?.image || feed.priceBanner?.images?.[0]} product={feed.priceBanner} href="/catalog" />
          <HomeFeedSection title="Розы в разных характерах" subtitle="От спокойных до выразительных сочетаний" products={feed.roses} href="/catalog?search=Роза" />
          <HomeCareGuide />
          <HomeFeedSection title="Для большого жеста" subtitle="Крупные и выразительные букеты" products={feed.premium} href="/catalog?min=7000" />
          <HomeFeedSection title="Ещё идеи" subtitle="Другие стили из актуального каталога" products={feed.more} href="/catalog" />
        </Surface>
      </main>
    </AppShell>
  );
}
