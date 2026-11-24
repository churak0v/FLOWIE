import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, MapPin } from 'lucide-react';
import { Navigate, useLocation } from 'react-router-dom';
import { api } from '../api';
import { HERO_SLIDES } from '../data/mock';
import { trackAnalytics } from '../lib/analytics';
import {
  getMothersDayPriceTiers,
  getMothersDayDeliveryDateSuggestion,
  hasMothersDayCampaignEnded,
  selectMothersDayProducts,
} from '../lib/mothersDayCampaign';
import { useAppState } from '../state/AppState';
import { FrequentlyOrderedSection } from './domain/FrequentlyOrderedSection';
import { AppShell } from './layout/AppShell';
import { AppImage } from './ui/AppImage';

const FALLBACK_MOTHER_BANNER = HERO_SLIDES.find((slide) => slide.id === 'mother') || null;

export function MothersDayLanding() {
  const location = useLocation();
  const { state, actions } = useAppState();
  const bouquetsRef = useRef(null);
  const [motherBanner, setMotherBanner] = useState(FALLBACK_MOTHER_BANNER);
  const campaignEnded = hasMothersDayCampaignEnded();

  useEffect(() => {
    let alive = true;
    api.getHomeBanners().then((result) => {
      if (!alive) return;
      const banner = (result?.heroSlides || []).find((slide) => String(slide?.id || '').toLowerCase() === 'mother');
      if (banner?.image) setMotherBanner(banner);
    }).catch(() => {});
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (campaignEnded || state.checkout.deliveryDate) return;
    actions.setDeliveryTime({ date: getMothersDayDeliveryDateSuggestion(state.checkout.deliveryDate), time: state.checkout.deliveryTime });
  }, [actions, campaignEnded, state.checkout.deliveryDate, state.checkout.deliveryTime]);

  const products = useMemo(
    () => selectMothersDayProducts(state.products.items, state.collections.items, motherBanner?.image),
    [motherBanner?.image, state.collections.items, state.products.items]
  );
  const priceTiers = useMemo(() => getMothersDayPriceTiers(products), [products]);

  if (campaignEnded) {
    return <Navigate to={`/catalog${location.search || ''}`} replace />;
  }

  const scrollToBouquets = () => {
    trackAnalytics('home_banner_click', { meta: { bannerId: 'mothers-day-landing-cta' } });
    bouquetsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <AppShell style={{ '--app-content-inset-bottom': '96px' }}>
      <main style={{ width: 'min(100%, var(--app-max))', margin: '0 auto', paddingBottom: 'calc(104px + var(--app-inset-bottom))' }}>
        <section style={{ position: 'relative', minHeight: 330, overflow: 'hidden', background: 'var(--c-ink-14)' }}>
          <AppImage
            src={motherBanner?.image}
            alt="Букеты ко Дню матери"
            variant="hero"
            fetchPriority="high"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: motherBanner?.imagePosition || 'center' }}
          />
          <div aria-hidden="true" style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(29,14,18,0.12), rgba(29,14,18,0.72))' }} />
          <div style={{ position: 'relative', zIndex: 1, minHeight: 330, padding: 'calc(18px + var(--app-inset-top)) calc(18px + var(--app-inset-right)) 22px calc(18px + var(--app-inset-left))', color: 'var(--c-white)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <span style={{ alignSelf: 'flex-start', minHeight: 34, padding: '0 12px', borderRadius: 999, background: 'rgba(255,255,255,0.86)', color: 'var(--text)', display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 1000 }}>
              <MapPin size={14} /> Ижевск
            </span>
            <div>
              <p style={{ margin: '0 0 7px', fontSize: 13, fontWeight: 900, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Предзаказ · доставка 29 ноября</p>
              <h1 style={{ margin: 0, maxWidth: 360, fontSize: 'clamp(31px, 9vw, 42px)', lineHeight: 0.98, letterSpacing: '-0.035em' }}>День матери — 29 ноября</h1>
              <p style={{ margin: '10px 0 0', maxWidth: 350, fontSize: 15, fontWeight: 750, lineHeight: 1.35 }}>Букеты с доставкой по Ижевску 29 ноября.</p>
              <button type="button" onClick={scrollToBouquets} style={{ marginTop: 16, minHeight: 50, padding: '0 18px', border: 0, borderRadius: 999, background: 'var(--accent)', color: 'var(--c-accent-contrast)', fontWeight: 1000, display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', boxShadow: 'var(--shadow-accent)' }}>
                Выбрать букет <ArrowDown size={18} strokeWidth={3} />
              </button>
            </div>
          </div>
        </section>

        <section ref={bouquetsRef} style={{ scrollMarginTop: 12, padding: '26px calc(16px + var(--app-inset-right)) 0 calc(16px + var(--app-inset-left))' }}>
          <div style={{ display: 'grid', gap: 8, marginBottom: 18 }}>
            <h2 style={{ margin: 0, fontSize: 25, lineHeight: 1.05 }}>Букеты для мамы</h2>
            <p style={{ margin: 0, color: 'var(--muted)', fontSize: 14, lineHeight: 1.4 }}>Актуальная подборка для предзаказа на 29 ноября.</p>
            {priceTiers.length ? (
              <div aria-label="Ценовые уровни" style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 4 }}>
                {priceTiers.map((tier) => (
                  <span key={tier.id} style={{ minHeight: 32, padding: '0 11px', borderRadius: 999, border: '1px solid var(--border)', background: 'var(--surface)', display: 'inline-flex', alignItems: 'center', fontSize: 12, fontWeight: 900 }}>
                    {tier.label} · {tier.count}
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          {products.length ? (
            <FrequentlyOrderedSection products={products} />
          ) : (
            <div role="status" style={{ padding: '28px 18px', borderRadius: 18, background: 'var(--surface)', border: '1px solid var(--border)', textAlign: 'center', fontWeight: 800 }}>
              Загружаем актуальные букеты…
            </div>
          )}
        </section>
      </main>
    </AppShell>
  );
}
