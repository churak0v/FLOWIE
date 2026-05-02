import React from 'react';
import { useNavigate } from 'react-router-dom';

export function MiniCartBar({ count, sum, bottom = 'calc(72px + var(--app-nav-inset-bottom))' }) {
  const navigate = useNavigate();
  if (!count) return null;

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
        <div style={{ fontWeight: 900, fontSize: 16 }}>Корзина</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="ui-chip" style={{ borderColor: 'transparent', background: 'var(--surface-2)' }}>
            {count}
          </span>
          <div style={{ fontWeight: 900, fontSize: 16, color: 'var(--accent)' }}>{sum} ₽</div>
        </div>
      </div>
    </button>
  );
}
