import React from 'react';
import { formatMoney } from '../../lib/money';

export function CheckoutFooterCTA({ total, disabled, onClick }) {
  return (
    <div
      style={{
        position: 'fixed',
        left: '50%',
        transform: 'translateX(-50%)',
        bottom: 'calc(0px - var(--app-keyboard-offset))',
        width: 'min(100%, var(--app-max))',
        padding: 'var(--sp-4) var(--sp-4) calc(var(--sp-4) + var(--app-inset-bottom))',
        background: 'var(--bg)',
        borderTop: '1px solid var(--c-ink-06)',
        zIndex: 55,
      }}
    >
      <button
        type="button"
        onClick={disabled ? undefined : onClick}
        disabled={disabled}
        style={{
          width: '100%',
          height: 56,
          border: 0,
          borderRadius: 'var(--r-lg)',
          background: disabled ? 'var(--c-ink-14)' : 'var(--accent)',
          color: 'var(--c-white)',
          cursor: disabled ? 'default' : 'pointer',
          fontWeight: 900,
          fontSize: 16,
        }}
      >
        Pay {formatMoney(total)}
      </button>
    </div>
  );
}
