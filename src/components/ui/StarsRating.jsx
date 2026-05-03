import React from 'react';
import { Star } from 'lucide-react';

export function StarsRating({ value = 5, onChange, size = 24 }) {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      {[1, 2, 3, 4, 5].map((i) => {
        const active = i <= value;
        return (
          <button
            key={i}
            type="button"
            onClick={onChange ? () => onChange(i) : undefined}
            aria-label={`Rating ${i}`}
            style={{
              width: 50,
              height: 50,
              border: 0,
              borderRadius: 8,
              cursor: onChange ? 'pointer' : 'default',
              background: active ? 'var(--c-accent)' : 'var(--c-ink-10)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Star
              size={size}
              color={active ? 'var(--c-white)' : 'var(--c-white-85)'}
              fill={active ? 'var(--c-white)' : 'transparent'}
            />
          </button>
        );
      })}
    </div>
  );
}
