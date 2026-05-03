import React from 'react';
import { ShoppingBag } from 'lucide-react';
import { QuantityStepper } from '../ui/QuantityStepper';
import { formatMoney } from '../../lib/money';

export function ProductAddBar({ qty, onDec, onInc, sum, onAdd, added = false, onViewCart }) {
  return (
    <div
      style={{
        position: 'fixed',
        left: '50%',
        transform: 'translateX(-50%)',
        bottom: 'calc(0px - var(--app-keyboard-offset))',
        width: 'min(100%, var(--app-max))',
        padding: 'var(--sp-4) var(--sp-4) calc(var(--sp-4) + var(--app-inset-bottom))',
        zIndex: 55,
        background: 'transparent',
      }}
    >
      <div
        style={{
          height: 64,
          borderRadius: 'var(--r-lg)',
          background: 'var(--accent)',
          boxShadow: '0 -8px 20px var(--c-ink-12)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 12px',
          gap: 12,
        }}
      >
        <div style={{ background: 'var(--c-white-18)', borderRadius: 'var(--r-md)' }}>
          <QuantityStepper value={qty} onDec={onDec} onInc={onInc} min={1} />
        </div>

        <button
          type="button"
          onClick={added ? onViewCart : onAdd}
          style={{
            border: 0,
            background: added ? 'var(--c-white)' : 'var(--c-white-22)',
            color: added ? 'var(--accent)' : 'var(--c-white)',
            height: 44,
            padding: '0 14px',
            borderRadius: 'var(--r-md)',
            cursor: 'pointer',
            fontWeight: 900,
            fontSize: 15,
            whiteSpace: 'nowrap',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <ShoppingBag size={17} strokeWidth={2.6} />
          {added ? 'View cart' : `Add to cart · ${formatMoney(sum)}`}
        </button>
      </div>
    </div>
  );
}
