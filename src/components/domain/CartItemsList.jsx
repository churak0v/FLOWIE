import React from 'react';
import { Minus, Plus, Trash2 } from 'lucide-react';
import { Surface } from '../ui/Surface';
import { Text } from '../ui/Text';
import { AppImage } from '../ui/AppImage';
import { formatMoney } from '../../lib/money';

export function CartItemsList({ items, productsById, onDec, onInc, onRemove }) {
  const products = productsById || new Map();
  const validItems = (items || []).filter((it) => products.get(String(it.productId)));

  if (!validItems.length) {
    return (
      <Surface variant="soft" style={{ padding: 16, borderRadius: 'var(--r-lg)' }}>
        <Text variant="subtitle">Корзина пуста</Text>
        <div style={{ marginTop: 6 }}>
          <Text variant="body" muted>
            Добавьте букет из каталога цветов.
          </Text>
        </div>
      </Surface>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {validItems.map((it) => {
        const p = products.get(String(it.productId));
        const rowSum = p.price * it.qty;
        return (
          <Surface
            key={it.productId}
            variant="default"
            style={{
              padding: 12,
              borderRadius: 'var(--r-lg)',
              border: '1px solid var(--border)',
              boxShadow: 'var(--shadow-1)',
              minWidth: 0,
              display: 'grid',
              gridTemplateColumns: '104px minmax(0, 1fr)',
              gap: 12,
            }}
          >
            <div style={{ position: 'relative', width: 104, height: 112, borderRadius: 14, overflow: 'hidden', background: 'var(--surface-2)' }}>
              <AppImage
                src={p.image}
                alt={p.title}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            </div>

            <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <Text variant="subtitle" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.2 }}>{p.title}</Text>
                  <div style={{ marginTop: 5 }}><Text variant="caption" muted>{formatMoney(p.price)} за букет</Text></div>
                </div>
                <button type="button" onClick={() => onRemove(it.productId)} aria-label={`Удалить ${p.title}`} style={{ width: 32, height: 32, border: 0, borderRadius: 10, background: 'var(--surface-2)', color: 'var(--muted)', display: 'grid', placeItems: 'center', cursor: 'pointer', flexShrink: 0 }}>
                  <Trash2 size={16} />
                </button>
              </div>

              <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <div
                  style={{
                    height: 36,
                    borderRadius: 12,
                    border: '1px solid var(--border)',
                    background: 'var(--surface-2)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    overflow: 'hidden',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => onDec(it.productId)}
                    aria-label="Уменьшить"
                    style={{
                      width: 32,
                      height: 36,
                      border: 0,
                      borderRadius: 0,
                      background: 'transparent',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                    }}
                  >
                    <Minus size={14} />
                  </button>
                  <span style={{ minWidth: 26, textAlign: 'center', fontWeight: 1000, fontSize: 14 }}>{it.qty}</span>
                  <button
                    type="button"
                    onClick={() => onInc(it.productId)}
                    aria-label="Увеличить"
                    style={{
                      width: 32,
                      height: 36,
                      border: 0,
                      borderRadius: 0,
                      background: 'transparent',
                      color: 'var(--text)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                    }}
                  >
                    <Plus size={14} />
                  </button>
                </div>

                <div style={{ fontSize: 16, fontWeight: 1000, whiteSpace: 'nowrap' }}>{formatMoney(rowSum)}</div>
              </div>
            </div>
          </Surface>
        );
      })}
    </div>
  );
}
