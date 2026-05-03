import React from 'react';
import { ShoppingBag } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { formatMoney } from '../../lib/money';

export function MiniCartBar({ count, sum, bottom = 'calc(72px + var(--app-nav-inset-bottom))', floating = false }) {
  const navigate = useNavigate();
  if (!count) return null;

  if (floating) {
    return (
      <div
        style={{
          position: 'fixed',
          left: '50%',
          transform: 'translateX(-50%) translateY(var(--app-keyboard-offset))',
          bottom,
          width: 'min(100%, var(--app-max))',
          padding: '0 var(--sp-4)',
          zIndex: 70,
          pointerEvents: 'none',
        }}
      >
        <button
          type="button"
          onClick={() => navigate('/cart')}
          aria-label={`Cart, ${count} item${count === 1 ? '' : 's'}, ${formatMoney(sum)}`}
          style={{
            marginLeft: 'auto',
            width: 'auto',
            minWidth: 138,
            height: 56,
            border: 0,
            borderRadius: 999,
            background: 'linear-gradient(135deg, var(--c-accent), var(--c-accent-2))',
            color: 'var(--c-white)',
            boxShadow: '0 18px 42px rgba(198,83,109,0.34)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            padding: '0 16px',
            cursor: 'pointer',
            pointerEvents: 'auto',
          }}
        >
          <span
            style={{
              width: 32,
              height: 32,
              borderRadius: 999,
              background: 'rgba(255,255,255,0.18)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <ShoppingBag size={18} strokeWidth={2.6} />
          </span>
          <span style={{ display: 'grid', gap: 1, textAlign: 'left', lineHeight: 1 }}>
            <span style={{ fontSize: 12, fontWeight: 900, opacity: 0.82 }}>Cart</span>
            <span style={{ fontSize: 15, fontWeight: 1000 }}>
              {count} · {formatMoney(sum)}
            </span>
          </span>
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => navigate('/cart')}
      style={{
        position: 'fixed',
        left: '50%',
        // Keep behind the keyboard (Telegram WebView may otherwise lift fixed UI above it).
        transform: 'translateX(-50%) translateY(var(--app-keyboard-offset))',
        bottom,
        width: 'min(100%, var(--app-max))',
        padding: '0 var(--sp-4)',
        border: 0,
        background: 'transparent',
        zIndex: 60,
        cursor: 'pointer',
      }}
    >
      <div
        style={{
          height: 54,
          borderRadius: 'var(--r-lg)',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          boxShadow: 'var(--shadow-1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 14px',
        }}
      >
        <div style={{ fontWeight: 900, fontSize: 16 }}>Cart</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="ui-chip" style={{ borderColor: 'transparent', background: 'var(--surface-2)' }}>
            {count}
          </span>
          <div style={{ fontWeight: 900, fontSize: 16, color: 'var(--accent)' }}>{formatMoney(sum)}</div>
        </div>
      </div>
    </button>
  );
}
