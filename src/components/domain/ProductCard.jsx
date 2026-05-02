import React from 'react';
import { Plus } from 'lucide-react';
import { Surface } from '../ui/Surface';
import { Text } from '../ui/Text';
import { AppImage } from '../ui/AppImage';

export function ProductCard({ id, title, subtitle, price, image, onAdd, onOpen }) {
  return (
    <Surface
      className="productCard"
      style={{ padding: 0, cursor: onOpen ? 'pointer' : 'default', overflow: 'hidden' }}
      onClick={onOpen ? () => onOpen(id) : undefined}
      role={onOpen ? 'button' : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onKeyDown={
        onOpen
          ? (e) => {
              if (e.key === 'Enter') onOpen(id);
            }
          : undefined
      }
    >
      <AppImage
        src={image}
        alt={title}
        loading="lazy"
        style={{
          width: '100%',
          aspectRatio: '1/1',
          objectFit: 'cover',
        }}
      />

      <div style={{ padding: 12 }}>
        <Text variant="subtitle">{title}</Text>
        <Text variant="body" muted style={{ marginTop: 4 }}>
          {subtitle}
        </Text>

        <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              height: 31,
              display: 'inline-flex',
              alignItems: 'center',
              padding: '0 12px',
              borderRadius: 'var(--r-pill)',
              background: 'var(--c-surface-2)',
              border: '1px solid var(--c-border)',
              color: 'var(--c-accent)',
              fontWeight: 800,
              fontSize: 16,
            }}
          >
            {price} ₽
          </div>

          <button
            type="button"
            aria-label="Добавить"
            onClick={(e) => {
              e.stopPropagation();
              onAdd?.(id);
            }}
            style={{
              width: 34,
              height: 34,
              borderRadius: 12,
              border: 0,
              background: 'var(--c-accent)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              flexShrink: 0,
              boxShadow: 'var(--shadow-accent)',
            }}
          >
            <Plus size={20} color="var(--c-white)" strokeWidth={3} />
          </button>
        </div>
      </div>
    </Surface>
  );
}
