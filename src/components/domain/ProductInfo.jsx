import { Camera, ChevronDown, Package, Ruler, Truck } from 'lucide-react';
import { formatMoney } from '../../lib/money';
import { cleanProductSubtitle } from '../../lib/productCopy';
import { splitProductComposition } from '../../lib/productDetailsPresentation';

function Condition({ icon: Icon, title, children, accent = false }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '38px minmax(0, 1fr)', gap: 11, padding: '15px 0', alignItems: 'start' }}>
      <span style={{ width: 38, height: 38, display: 'grid', placeItems: 'center', borderRadius: 13, background: accent ? 'var(--c-accent-10)' : '#fff', color: 'var(--accent)' }}><Icon size={20} strokeWidth={1.8} /></span>
      <div><div style={{ fontSize: 16, fontWeight: 850, lineHeight: 1.2 }}>{title}</div><div style={{ marginTop: 5, color: 'var(--muted)', fontSize: 13, lineHeight: 1.45 }}>{children}</div></div>
    </div>
  );
}

export function ProductInfo({ product }) {
  const { botanical, packaging } = splitProductComposition(product.compositionItems || product.composition);
  const subtitle = cleanProductSubtitle(product.subtitle);
  return (
    <div>
      <div data-analytics-section="summary">
      <h1 style={{ margin: 0, fontSize: 27, lineHeight: 1.12, fontWeight: 900, letterSpacing: '-.035em' }}>{product.title}</h1>
      {subtitle ? <p style={{ margin: '9px 0 0', fontSize: 14, color: 'var(--muted)', lineHeight: 1.45 }}>{subtitle}</p> : null}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 14 }}>
        <span style={{ fontSize: 30, fontWeight: 950, letterSpacing: '-.035em', color: 'var(--accent)' }}>{formatMoney(product.price)}</span>
        {product.discount > 0 && product.basePrice > product.price ? <s style={{ fontSize: 16, color: 'var(--muted)' }}>{formatMoney(product.basePrice)}</s> : null}
      </div>
      <p style={{ margin: '6px 0 0', color: 'var(--muted)', fontSize: 12 }}>Оформление включено · Доставка рассчитывается отдельно</p>
      </div>
      <section data-analytics-section="dimensions" aria-label="Размер букета" style={{marginTop: 18}}>
      <h2 style={{margin: 0, fontSize: 18}}>Размер</h2>
      {product.size ? <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center', marginTop: 15, padding: '8px 11px', background: '#fff', borderRadius: 11, fontSize: 13, fontWeight: 750 }}><Ruler size={16} />{product.size} см · ширина × высота</div> : <p style={{fontSize: 13, color: 'var(--muted)', lineHeight: 1.4}}>Размер пока не указан. Уточните у флориста перед заказом.</p>}
      </section>

      <div style={{ marginTop: 19, padding: '0 14px', border: '1px solid var(--c-accent-border)', background: '#fff', borderRadius: 19 }}>
        <Condition icon={Camera} title="Фото перед отправкой" accent>Пришлём фото готового букета, прежде чем передать его курьеру.</Condition>
      </div>

      {product.description ? <p style={{ margin: '22px 0', fontSize: 15, lineHeight: 1.55 }}>{product.description}</p> : null}
      {botanical.length ? <section style={{ marginTop: 25 }} data-analytics-section="composition" aria-label="Состав букета">
        <h2 style={{ margin: '0 0 12px', fontSize: 21, fontWeight: 850, letterSpacing: '-.02em' }}>В букете</h2>
        <div style={{ background: '#fff', padding: '5px 15px', borderRadius: 18 }}>
          {botanical.map((row, i) => <div key={`${row.name}:${i}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16, padding: '12px 0', borderBottom: i < botanical.length - 1 ? '1px solid var(--border)' : 0, fontSize: 14, lineHeight: 1.35 }}><span>{row.name}</span>{row.quantity ? <strong style={{ flexShrink: 0, fontWeight: 800 }}>{row.quantity}</strong> : null}</div>)}
        </div>
      </section> : null}
      {packaging.length ? <details style={{ marginTop: 11, background: '#fff', borderRadius: 16, padding: '13px 15px' }}>
        <summary style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14, fontWeight: 750, listStyle: 'none' }}><Package size={17} color="var(--accent)" /><span style={{ flex: 1 }}>Упаковка и оформление</span><ChevronDown size={16} /></summary>
        <p style={{ fontSize: 13, lineHeight: 1.5, margin: '11px 0 0', color: 'var(--muted)' }}>{packaging.map(row => row.name).join(', ')}.</p>
      </details> : null}
      <section style={{ marginTop: 19 }} aria-label="Доставка букета">
        <Condition icon={Truck} title="Доставка по Ижевску">Стоимость рассчитаем по адресу. Дату и время выберете при оформлении заказа.</Condition>
      </section>
    </div>
  );
}
