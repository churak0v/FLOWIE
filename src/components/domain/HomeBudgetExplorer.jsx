import { useMemo, useState } from 'react';
import { filterHomeBudgetProducts } from '../../lib/homeFeed';
import { HomeFeedSection } from './HomeFeedSection';
import { trackAnalytics } from '../../lib/analytics';

const BANDS = [
  { id: 'from-3000', label: 'От 3 000 ₽', href: '/catalog?min=3000' },
  { id: 'from-5000', label: 'От 5 000 ₽', href: '/catalog?min=5000' },
  { id: 'from-7000', label: 'От 7 000 ₽', href: '/catalog?min=7000' },
];

export function HomeBudgetExplorer({ products }) {
  const available = useMemo(() => BANDS.map((band) => ({ ...band, products: filterHomeBudgetProducts(products, band.id) })).filter((band) => band.products.length), [products]);
  const [selected, setSelected] = useState('from-3000');
  if (!available.length) return null;
  const active = available.find((band) => band.id === selected) || available[0];
  return (
    <section style={{ marginTop: 30 }}>
      <div aria-label="Выбрать бюджет" style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
        {available.map((band) => <button key={band.id} type="button" aria-pressed={band.id === active.id} onClick={() => { setSelected(band.id); trackAnalytics('filter_change', { meta: { filter: 'home_budget', value: band.id } }); }} style={{ minHeight: 40, padding: '0 12px', flexShrink: 0, borderRadius: 999, border: `1px solid ${band.id === active.id ? 'var(--accent)' : 'var(--border)'}`, background: band.id === active.id ? 'var(--accent)' : 'var(--surface)', color: band.id === active.id ? 'var(--c-accent-contrast)' : 'var(--text)', fontSize: 13, fontWeight: 950, cursor: 'pointer' }}>{band.label}</button>)}
      </div>
      <HomeFeedSection title={`Букеты ${active.label.toLowerCase()}`} subtitle="Цена букета указана в карточке" products={active.products.slice(0, 9)} href={active.href} />
    </section>
  );
}
