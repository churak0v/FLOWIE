import React from 'react';
import { Minus, Plus } from 'lucide-react';
import { Carousel } from '../ui/Carousel';
import { Surface } from '../ui/Surface';
import { Text } from '../ui/Text';
import { AppImage } from '../ui/AppImage';

export function UpsellsBlock({ upsells, qtyById, onAdd }) {
  return (
    <div>
      <Text variant="title" style={{ marginBottom: 'var(--sp-4)' }}>
        Дополнительно
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
                width: 240,
                flexShrink: 0,
                borderRadius: 'var(--r-lg)',
                overflow: 'hidden',
                border: '1px solid var(--border)',
              }}
            >
              <AppImage
                src={u.image}
                alt={u.title}
                style={{
                  width: '100%',
                  height: 128,
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
                    {isFree ? 'Бесплатно' : `${price} ₽`}
                  </Text>
                </div>

                <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <button
                      type="button"
                      onClick={() => onAdd?.(id, Math.max(0, qty - 1))}
                      aria-label="Уменьшить"
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: 12,
                        border: '1px solid var(--border)',
                        background: 'transparent',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: qty > 0 ? 'pointer' : 'default',
                        opacity: qty > 0 ? 1 : 0.4,
                      }}
                      disabled={qty <= 0}
                    >
                      <Minus size={18} color="var(--text)" strokeWidth={3} />
                    </button>

                    <div style={{ fontWeight: 1000, minWidth: 18, textAlign: 'center' }}>{qty || 0}</div>

                    <button
                      type="button"
                      onClick={() => onAdd?.(id, qty + 1)}
                      aria-label="Добавить"
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: 12,
                        border: 0,
                        background: 'var(--accent)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        flexShrink: 0,
                      }}
                    >
                      <Plus size={18} color="var(--c-white)" strokeWidth={3} />
                    </button>
                  </div>

                  {qty ? <span className="ui-chip">В корзине</span> : <span className="ui-chip ui-chip--accent">+</span>}
                </div>
              </div>
            </Surface>
          );
        })}
      </Carousel>
    </div>
  );
}
