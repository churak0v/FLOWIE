import React from 'react';
import { User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { HeroCarousel } from './HeroCarousel';

export function HeroBlock({ slides }) {
  const navigate = useNavigate();

  return (
    <div style={{ position: 'relative' }}>
      <HeroCarousel slides={slides} />

      <div
        style={{
          position: 'absolute',
          top: 'calc(var(--sp-2) + var(--app-inset-top))',
          left: 'calc(var(--sp-4) + var(--app-inset-left))',
          right: 'calc(var(--sp-4) + var(--app-inset-right))',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          pointerEvents: 'none',
        }}
      >
        <span />

        <button
          type="button"
          aria-label="Account"
          onClick={() => navigate('/account')}
          style={{
            width: 40,
            height: 40,
            borderRadius: 'var(--r-pill)',
            border: 0,
            background: 'var(--c-white-72)',
            backdropFilter: 'blur(10px)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            flexShrink: 0,
            pointerEvents: 'auto',
          }}
        >
          <User size={20} color="var(--c-ink-92)" />
        </button>
      </div>
    </div>
  );
}
