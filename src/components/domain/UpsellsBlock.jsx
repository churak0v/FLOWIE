import React from 'react';
import { Carousel } from '../ui/Carousel';
import { Surface } from '../ui/Surface';
import { Text } from '../ui/Text';
import { AppImage } from '../ui/AppImage';
import { formatMoney } from '../../lib/money';

export function UpsellsBlock({ upsells, qtyById, onAdd }) {
  return (
    <div>
      <Text variant="title" style={{ marginBottom: 'var(--sp-4)' }}>
        Make it feel complete
      </Text>

      <Carousel style={{ paddingBottom: 2 }}>
        {(upsells || []).map((u) => {
          const id = u?.id;
          const key = String(id);
          const qty = Number(qtyById?.[key] || 0);
          const price = Number(u?.price || 0);
          const isFree = price <= 0;

          return (
            <Surface
              key={key}
              variant="soft"
              style={{
                width: 'calc((100% - 12px) / 2)',
                flex: '0 0 calc((100% - 12px) / 2)',
                minWidth: 0,
                borderRadius: 'var(--r-lg)',
                overflow: 'hidden',
                border: qty ? '2px solid var(--accent)' : '1px solid var(--border)',
                background: qty ? 'var(--c-accent-10)' : 'var(--surface)',
              }}
            >
              <AppImage
                src={u.image}
                alt={u.title}
                style={{
                  width: '100%',
                  height: 118,
                  objectFit: 'cover',
                  background: 'var(--surface)',
                }}
              />
              <div style={{ padding: 12 }}>
                <Text variant="subtitle" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {u.title}
                </Text>
                <div style={{ marginTop: 4 }}>
                  <Text variant="body" muted>
                    {isFree ? 'Free' : formatMoney(price)}
                  </Text>
                </div>

                <button
                  type="button"
                  onClick={() => onAdd?.(id, qty ? 0 : 1)}
                  style={{
                    marginTop: 12,
                    width: '100%',
                    height: 42,
                    border: 0,
                    borderRadius: 999,
                    background: qty ? 'var(--accent)' : 'var(--c-white)',
                    color: qty ? 'var(--c-white)' : 'var(--accent)',
                    fontWeight: 1000,
                    cursor: 'pointer',
                    boxShadow: qty ? 'var(--shadow-accent)' : 'inset 0 0 0 1px var(--c-accent-border)',
                  }}
                >
                  {qty ? 'Added' : isFree ? 'Include' : 'Add to gift'}
                </button>
              </div>
            </Surface>
          );
        })}
      </Carousel>
    </div>
  );
}
