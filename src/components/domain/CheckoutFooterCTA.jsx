import React from 'react';
import { QrCode } from 'lucide-react';
import { formatMoney } from '../../lib/money';

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
          background: disabled ? 'var(--c-ink-14)' : 'linear-gradient(135deg, #15b8a6 0%, #287cf5 52%, #7f4bd8 100%)',
          color: '#fff',
          cursor: disabled ? 'default' : 'pointer',
          fontWeight: 900,
          fontSize: 16,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 9,
          boxShadow: disabled ? 'none' : '0 12px 28px rgba(40,124,245,0.24)',
        }}
      >
        <QrCode size={20} strokeWidth={2.6} />
        {loading ? 'Открываем СБП…' : `Оплатить по СБП · ${formatMoney(total)}`}
      </button>
    </div>
  );
}
