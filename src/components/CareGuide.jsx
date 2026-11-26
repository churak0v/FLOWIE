import { useMemo, useState } from 'react';
import { ArrowLeft, Droplets, Flower2, Ruler, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { AppShell } from './layout/AppShell';
import { FrequentlyOrderedSection } from './domain/FrequentlyOrderedSection';
import { AppImage } from './ui/AppImage';
import { useAppState } from '../state/AppState';
import { trackAnalytics } from '../lib/analytics';
import {
  calculateCylindricalWaterMl,
  FLOWER_CARE_OPTIONS,
  matchesCareProfile,
  careSelectionTitle,
} from '../data/flowerCare';

export function CareGuide() {
  const navigate = useNavigate();
  const { state } = useAppState();
  const [selectedKey, setSelectedKey] = useState(() => {
    const requested = new URLSearchParams(window.location.search).get('flower');
    return FLOWER_CARE_OPTIONS.some(profile => profile.key === requested) ? requested : 'bouquet';
  });
  const [diameter, setDiameter] = useState('12');
  const [waterHeight, setWaterHeight] = useState('10');
  const selected = FLOWER_CARE_OPTIONS.find((item) => item.key === selectedKey) || FLOWER_CARE_OPTIONS[0];
  const volume = useMemo(() => calculateCylindricalWaterMl(diameter, waterHeight), [diameter, waterHeight]);
  const products = useMemo(() => (state.products.items || []).filter((product) => matchesCareProfile(product, selectedKey)).slice(0, 4), [selectedKey, state.products.items]);
  const heroImage = products[0]?.image || state.products.items.find((product) => product?.image)?.image;
  const relatedTitle = careSelectionTitle(selectedKey);

  return (
    <AppShell style={{ padding: 0, background: '#fbf7f8' }}>
      <main style={{ minHeight: '100dvh', paddingBottom: 64, color: '#2b1e23' }}>
        <header style={{ position: 'relative', minHeight: 'min(72svh, 650px)', overflow: 'hidden', background: selected.accent }}>
          {heroImage ? <AppImage src={heroImage} alt="" loading="eager" fetchPriority="high" variant="hero" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} /> : null}
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(32,18,23,.18), rgba(32,18,23,.82) 82%)' }} />
          <button type="button" onClick={() => navigate(-1)} aria-label="Назад" style={{ position: 'absolute', zIndex: 2, top: 'calc(16px + var(--app-inset-top))', left: 'calc(16px + var(--app-inset-left))', width: 44, height: 44, borderRadius: 15, border: '1px solid rgba(255,255,255,.5)', background: 'rgba(255,255,255,.82)', display: 'grid', placeItems: 'center', color: '#2b1e23', backdropFilter: 'blur(12px)' }}><ArrowLeft size={21} /></button>
          <div style={{ position: 'relative', zIndex: 1, minHeight: 'min(72svh, 650px)', padding: 'calc(100px + var(--app-inset-top)) calc(22px + var(--app-inset-right)) 34px calc(22px + var(--app-inset-left))', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', color: '#fff' }}>
            <span style={{ fontSize: 12, fontWeight: 1000, letterSpacing: '.12em', textTransform: 'uppercase' }}>FLOWIE care</span>
            <h1 style={{ margin: '12px 0 0', maxWidth: 620, fontSize: 'clamp(40px, 10vw, 72px)', lineHeight: .92, letterSpacing: '-.045em' }}>Как сохранить букет красивым</h1>
            <p style={{ margin: '18px 0 0', maxWidth: 560, fontSize: 17, lineHeight: 1.45, color: 'rgba(255,255,255,.84)' }}>Выберите цветок или тип композиции — покажем, сколько воды налить и когда обновить срез.</p>
          </div>
        </header>

        <div style={{ maxWidth: 1040, margin: '0 auto', padding: '34px calc(18px + var(--app-inset-right)) 0 calc(18px + var(--app-inset-left))' }}>
          <section data-analytics-section="care_choice" aria-labelledby="care-choice">
            <p style={{ margin: 0, color: selected.accent, fontSize: 12, fontWeight: 1000, letterSpacing: '.1em', textTransform: 'uppercase' }}>Что у вас дома</p>
            <h2 id="care-choice" style={{ margin: '8px 0 18px', fontSize: 31, lineHeight: 1 }}>Выберите букет или композицию</h2>
            <div style={{ display: 'flex', gap: 9, overflowX: 'auto', padding: '2px 0 8px', scrollbarWidth: 'none' }}>{FLOWER_CARE_OPTIONS.map((item) => <button key={item.key} type="button" aria-pressed={item.key === selectedKey} data-analytics-element="care_profile" onClick={() => { setSelectedKey(item.key); trackAnalytics('filter_change', { meta: { filter: 'care_profile', value: item.key } }); }} style={{ flexShrink: 0, minHeight: 44, padding: '0 16px', borderRadius: 999, border: `1px solid ${item.key === selectedKey ? item.accent : 'rgba(43,30,35,.14)'}`, background: item.key === selectedKey ? item.accent : '#fff', color: item.key === selectedKey ? '#fff' : '#2b1e23', fontWeight: 900, cursor: 'pointer' }}>{item.label}</button>)}</div>
          </section>

          <section data-analytics-section="care_water" style={{ marginTop: 24, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(270px,1fr))', gap: 14 }}>
            <div style={{ padding: 24, borderRadius: 28, background: selected.accent, color: '#fff', boxShadow: `0 20px 50px ${selected.accent}33` }}><Flower2 size={28} /><h2 style={{ margin: '22px 0 10px', fontSize: 30, lineHeight: 1 }}>{selected.title}</h2><p style={{ margin: 0, fontSize: 15, lineHeight: 1.55, color: 'rgba(255,255,255,.84)' }}>{selected.lead}</p></div>
            <div style={{ padding: 24, borderRadius: 28, background: '#fff', border: '1px solid rgba(43,30,35,.08)' }}><Droplets size={28} color={selected.accent} /><p style={{ margin: '22px 0 6px', color: selected.accent, fontSize: 12, fontWeight: 1000, textTransform: 'uppercase', letterSpacing: '.08em' }}>Сколько воды</p><p style={{ margin: 0, fontSize: 16, lineHeight: 1.5 }}>{selected.water}</p></div>
          </section>

          <section data-analytics-section="care_steps" style={{ marginTop: 38 }}><h2 style={{ margin: 0, fontSize: 31 }}>Что сделать</h2><div style={{ marginTop: 18, display: 'grid', gap: 10 }}>{selected.steps.map(([title, text], index) => <article key={title} style={{ display: 'grid', gridTemplateColumns: '48px minmax(0,1fr)', gap: 14, padding: 18, borderRadius: 22, background: '#fff', border: '1px solid rgba(43,30,35,.07)' }}><span style={{ width: 48, height: 48, display: 'grid', placeItems: 'center', borderRadius: 16, background: `${selected.accent}14`, color: selected.accent, fontSize: 17, fontWeight: 1000 }}>{index + 1}</span><div><h3 style={{ margin: 2, fontSize: 18 }}>{title}</h3><p style={{ margin: '7px 2px 0', color: '#715f66', lineHeight: 1.5 }}>{text}</p></div></article>)}</div></section>

          {!['composition', 'preserved'].includes(selectedKey) ? <section data-analytics-section="care_calculator" style={{ marginTop: 38, padding: 24, borderRadius: 28, background: '#efe5e8' }}>
            <Ruler size={28} color={selected.accent} /><h2 style={{ margin: '16px 0 8px', fontSize: 29 }}>Объём воды до нужной отметки</h2><p style={{ margin: 0, color: '#715f66', lineHeight: 1.5 }}>Укажите внутренний диаметр вазы и высоту воды — калькулятор посчитает объём для цилиндрической формы.</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 12, marginTop: 18 }}><label style={{ fontSize: 13, fontWeight: 900 }}>Диаметр внутри, см<input type="number" inputMode="decimal" min="1" max="60" value={diameter} onChange={(event) => setDiameter(event.target.value)} onBlur={() => trackAnalytics('element_click', { meta: { elementKey: 'care_calculator', placementKey: 'care_guide' } })} style={{ display: 'block', width: '100%', boxSizing: 'border-box', marginTop: 7, minHeight: 48, padding: '0 12px', borderRadius: 14, border: '1px solid rgba(43,30,35,.14)', background: '#fff', fontSize: 17 }} /></label><label style={{ fontSize: 13, fontWeight: 900 }}>Высота воды, см<input type="number" inputMode="decimal" min="1" max="60" value={waterHeight} onChange={(event) => setWaterHeight(event.target.value)} onBlur={() => trackAnalytics('element_click', { meta: { elementKey: 'care_calculator', placementKey: 'care_guide' } })} style={{ display: 'block', width: '100%', boxSizing: 'border-box', marginTop: 7, minHeight: 48, padding: '0 12px', borderRadius: 14, border: '1px solid rgba(43,30,35,.14)', background: '#fff', fontSize: 17 }} /></label></div>
            <div aria-live="polite" style={{ marginTop: 16, padding: 18, borderRadius: 18, background: '#fff' }}>{volume == null ? <strong>Введите размеры от 1 до 60 см</strong> : <><span style={{ display: 'block', color: '#715f66', fontSize: 13 }}>π × (диаметр ÷ 2)² × высота</span><strong style={{ display: 'block', marginTop: 5, fontSize: 27 }}>≈ {volume >= 1000 ? `${(volume / 1000).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} л` : `${volume} мл`}</strong></>}</div>
          </section> : null}

          {products.length ? <section data-analytics-section="care_results" style={{ marginTop: 42 }}><span style={{ color: selected.accent, display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 1000, textTransform: 'uppercase', letterSpacing: '.08em' }}><Sparkles size={16} /> Из актуального каталога</span><h2 style={{ margin: '8px 0 17px', fontSize: 31 }}>{relatedTitle}</h2><FrequentlyOrderedSection products={products} placement="care_recommendations" /><button type="button" data-analytics-element="care_catalog" data-analytics-placement="care_guide" onClick={() => navigate(`/catalog?care=${encodeURIComponent(selectedKey)}`)} style={{ width: '100%', marginTop: 18, minHeight: 48, border: 0, borderRadius: 16, background: 'var(--accent)', color: '#fff', fontSize: 16, fontWeight: 850 }}>Показать все</button></section> : null}


        </div>
      </main>
    </AppShell>
  );
}
