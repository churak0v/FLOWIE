import React from 'react';
import { formatMoney } from '../../lib/money';
import { SbpLogo } from '../ui/SbpLogo';

export function CheckoutFooterCTA({ total, disabled, loading = false, onClick }) {
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
          background: disabled ? 'var(--c-ink-14)' : '#1d1346',
          color: '#fff',
          cursor: disabled ? 'default' : 'pointer',
          fontWeight: 900,
          fontSize: 16,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 9,
          boxShadow: disabled ? 'none' : '0 12px 28px rgba(32,19,79,0.22)',
        }}
      >
        {loading ? 'Открываем оплату…' : <><span>Оплатить по</span><SbpLogo compact /><span>· {formatMoney(total)}</span></>}
      </button>
    </div>
  );
}
