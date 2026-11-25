import { ShoppingBag } from 'lucide-react';
import { QuantityStepper } from '../ui/QuantityStepper';
import { formatMoney } from '../../lib/money';

export function ProductAddBar({ qty, onDec, onInc, sum, onAdd, added = false, onViewCart, disabled = false }) {
  return (
    <div role="region" aria-label="Букет в корзине" style={{ position: 'fixed', left: '50%', transform: 'translateX(-50%)', bottom: 'calc(8px + var(--app-inset-bottom) - var(--app-keyboard-offset))', width: 'min(100%, var(--app-max))', padding: '0 var(--sp-4)', boxSizing: 'border-box', zIndex: 55, background: 'transparent', pointerEvents: disabled ? 'none' : 'auto' }}>
      <div aria-disabled={disabled || undefined} style={{ minHeight: 64, padding: 8, borderRadius: 22, background: 'rgba(255,255,255,0.96)', border: '1px solid rgba(13,13,13,0.07)', boxShadow: '0 16px 42px rgba(31,15,22,0.2)', display: 'flex', alignItems: 'center', gap: 8, opacity: disabled ? 0.55 : 1, backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }}>
        {added ? <fieldset disabled={disabled} style={{ margin: 0, padding: 0, border: 0, flexShrink: 0 }}><QuantityStepper value={qty} onDec={onDec} onInc={onInc} min={0} /></fieldset> : null}
        <button data-analytics-element="product_add" data-analytics-placement="floating" type="button" disabled={disabled} onClick={added ? onViewCart : onAdd} style={{ width: '100%', minWidth: 0, height: 48, padding: '0 16px', border: 0, borderRadius: 16, background: 'var(--accent)', color: 'var(--c-accent-contrast)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 'clamp(14px, 3.8vw, 16px)', fontWeight: 1000, whiteSpace: 'nowrap', cursor: disabled ? 'default' : 'pointer', boxShadow: 'var(--shadow-accent)' }}>
          <ShoppingBag size={18} strokeWidth={2.7} />
          {added ? 'В корзину' : `Добавить в корзину · ${formatMoney(sum)}`}
        </button>
      </div>
    </div>
  );
}
