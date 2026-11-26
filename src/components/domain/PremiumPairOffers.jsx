import { Gift } from 'lucide-react';
import { FrequentlyOrderedSection } from './FrequentlyOrderedSection';

export function PremiumPairOffers({ pairs, focused = false, loading = false }) {
  if (!pairs.length) return focused ? <section data-analytics-section="home_offer" style={{ paddingBottom: 20 }}><h2 style={{ margin: 0, fontSize: 22 }}>Комплект с минибукетом</h2><p style={{ fontSize: 13, color: 'var(--muted)' }}>{loading ? 'Загружаем комплекты…' : 'Этот комплект сейчас недоступен. Ниже можно выбрать другие цветы.'}</p></section> : null;
  return <section data-analytics-section="home_offer" style={{ paddingBottom: 24 }}>
    <div style={{ display: 'flex', gap: 7, alignItems: 'center', color: 'var(--accent)', fontSize: 12, fontWeight: 850 }}><Gift size={15} /> Большой подарок + маленький</div>
    <h2 style={{ margin: '7px 0 0', fontSize: 23, lineHeight: 1.15, letterSpacing: '-.025em' }}>Минибукет — наш подарок</h2>
    <p style={{ margin: '7px 0 13px', fontSize: 13, lineHeight: 1.45, color: 'var(--muted)' }}>В той же палитре, с отдельной упаковкой. Оба подарка привезём вместе.</p>
    <FrequentlyOrderedSection products={pairs.map(pair => ({ ...pair.product, title: pair.code === 'angel-duet' ? 'Angel' : pair.title }))} view="list" />
    <p style={{ margin: '9px 0 0', fontSize: 11, color: 'var(--muted)', lineHeight: 1.4 }}>Цена за комплект · один адрес · доставка отдельно. Изображения — визуализации.</p>
  </section>;
}
