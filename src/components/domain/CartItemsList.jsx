import React from 'react';
import { Minus, Plus } from 'lucide-react';
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
        <Text variant="subtitle">Your cart is empty</Text>
        <div style={{ marginTop: 6 }}>
          <Text variant="body" muted>
            Add a wishlist item from the marketplace or a creator profile.
          </Text>
        </div>
      </Surface>
    );
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
      {validItems.map((it) => {
        const p = products.get(String(it.productId));
        const rowSum = p.price * it.qty;
        return (
          <Surface
            key={it.productId}
            variant="default"
            style={{
              padding: 0,
              borderRadius: 'var(--r-lg)',
              border: '1px solid var(--border)',
              overflow: 'hidden',
              boxShadow: 'var(--shadow-1)',
              minWidth: 0,
            }}
          >
            <div style={{ position: 'relative' }}>
              <AppImage
                src={p.image}
                alt={p.title}
                style={{ width: '100%', aspectRatio: '1 / 1', objectFit: 'cover' }}
              />
              <div
                style={{
                  position: 'absolute',
                  left: 8,
                  bottom: 8,
                  height: 28,
                  padding: '0 9px',
                  borderRadius: 999,
                  background: 'rgba(255,255,255,0.86)',
                  backdropFilter: 'blur(10px)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  fontWeight: 1000,
                  fontSize: 14,
                  color: 'var(--accent)',
                }}
              >
                {formatMoney(rowSum)}
              </div>
            </div>

            <div style={{ padding: 10, display: 'grid', gap: 10 }}>
              <Text variant="subtitle" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {p.title}
              </Text>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <div
                  style={{
                    height: 34,
                    borderRadius: 999,
                    border: '1px solid var(--border)',
                    background: 'var(--surface-2)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 7,
                    padding: '0 5px',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => onDec(it.productId)}
                    aria-label="Decrease"
                    style={{
                      width: 24,
                      height: 24,
                      border: 0,
                      borderRadius: 999,
                      background: 'var(--c-white)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                    }}
                  >
                    <Minus size={14} />
                  </button>
                  <span style={{ minWidth: 14, textAlign: 'center', fontWeight: 1000, fontSize: 14 }}>{it.qty}</span>
                  <button
                    type="button"
                    onClick={() => onInc(it.productId)}
                    aria-label="Increase"
                    style={{
                      width: 24,
                      height: 24,
                      border: 0,
                      borderRadius: 999,
                      background: 'var(--accent)',
                      color: 'var(--c-white)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                    }}
                  >
                    <Plus size={14} />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => onRemove(it.productId)}
                  aria-label={`Remove ${p.title}`}
                  style={{
                    width: 34,
                    height: 34,
                    border: 0,
                    borderRadius: 999,
                    background: 'var(--surface-2)',
                    cursor: 'pointer',
                    color: 'var(--muted)',
                    fontWeight: 1000,
                    flexShrink: 0,
                  }}
                >
                  ×
                </button>
              </div>
            </div>
          </Surface>
        );
      })}
    </div>
  );
}
