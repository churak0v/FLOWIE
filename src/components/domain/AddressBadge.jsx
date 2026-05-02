import React from 'react';
import { MapPin } from 'lucide-react';

export function AddressBadge({ street, house, onClick }) {
  const ready = Boolean(street && house);
  const label = ready ? `${street} · ${house}` : 'Укажите адрес';

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: 0,
        padding: '10px 12px',
        borderRadius: 'var(--r-pill)',
        background: 'var(--c-white-72)',
        backdropFilter: 'blur(10px)',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        cursor: onClick ? 'pointer' : 'default',
        maxWidth: 260,
      }}
    >
      <MapPin size={18} color="var(--c-ink-92)" />
      <span
        style={{
          fontSize: 13,
          fontWeight: 800,
          color: 'var(--c-ink-92)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {label}
      </span>
    </button>
  );
}

