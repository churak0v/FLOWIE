import { Gift } from 'lucide-react';
import { Link } from 'react-router-dom';
import { AppImage } from '../ui/AppImage';
import { formatMoney } from '../../lib/money';

export function PremiumPairOffers({ pairs, focused = false, loading = false }) {
  if (!pairs.length) return focused ? <section data-analytics-section="home_offer" style={{ padding: '4px 0 20px' }}><h2 style={{ margin: 0, fontSize: 25 }}>Большой подарок + минибукет</h2><p style={{ color: 'var(--muted)' }}>{loading ? 'Загружаем комплекты…' : 'Этот комплект сейчас недоступен. Ниже можно выбрать другие цветы.'}</p></section> : null;
  const primary = pairs[0];
  return <section data-analytics-section="home_offer" style={{ padding: focused ? '0 0 24px' : '28px 0 0' }}>
    <div style={{ display: 'flex', gap: 7, alignItems: 'center', color: 'var(--accent)', fontSize: 12, fontWeight: 850 }}><Gift size={15} /> Минибукет — наш подарок</div>
    <h2 style={{ margin: '9px 0 0', fontSize: 27, lineHeight: 1.1, letterSpacing: '-.035em' }}>{focused ? primary.title : 'Большой и маленький'}</h2>
    <p style={{ margin: '9px 0 17px', fontSize: 14, lineHeight: 1.5, color: 'var(--muted)' }}>Большой подарок — главному адресату. Маленький — тому, кого тоже хочется порадовать. Оба в одной палитре.</p>
    <div style={{ display: 'grid', gap: 16 }}>
      {pairs.map((pair, index) => <article key={pair.code} style={{ overflow: 'hidden', borderRadius: 22, background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <Link to={`/product/${pair.product.id}`} data-analytics-impression="product" data-analytics-element="product_card" data-analytics-product={pair.product.id} data-analytics-placement="home_recommendations" style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}>
          <AppImage src={pair.product.image || pair.image} alt={`${pair.title}: основной подарок и минибукет рядом`} variant="detail" loading={focused && index === 0 ? 'eager' : 'lazy'} style={{ display: 'block', width: '100%', aspectRatio: '1 / 1', objectFit: 'cover' }} />
          <div style={{ padding: 17 }}>
            <div style={{ fontSize: 19, fontWeight: 900 }}>{pair.title}</div>
            <div style={{ marginTop: 7, fontSize: 14, lineHeight: 1.4 }}>{pair.gift} — в подарок к комплекту.</div>
            <div style={{ marginTop: 6, fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>{pair.detail}</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginTop: 17 }}><strong style={{ fontSize: 23 }}>{formatMoney(pair.product.price)}</strong><span style={{ background: 'var(--accent)', color: 'var(--c-accent-contrast)', borderRadius: 14, padding: '13px 16px', fontWeight: 850, fontSize: 13 }}>Выбрать комплект</span></div>
            <div style={{ marginTop: 8, fontSize: 11, color: 'var(--muted)' }}>Цена за комплект · оба подарка на один адрес</div>
          </div>
        </Link>
      </article>)}
    </div>
    <p style={{ margin: '12px 0 0', fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>Минибукет включён в состав каждого комплекта. Доставка рассчитывается при оформлении. Изображения комплектов — визуализации.</p>
  </section>;
}
