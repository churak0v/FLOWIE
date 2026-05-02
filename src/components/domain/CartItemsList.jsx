import React from 'react';
import { QuantityStepper } from '../ui/QuantityStepper';
import { Surface } from '../ui/Surface';
import { Text } from '../ui/Text';
import { AppImage } from '../ui/AppImage';

export function CartItemsList({ items, productsById, onDec, onInc, onRemove }) {
  const products = productsById || new Map();

  if (!items?.length) {
    return (
      <Surface variant="soft" style={{ padding: 16, borderRadius: 'var(--r-lg)' }}>
        <Text variant="subtitle">Корзина пуста</Text>
        <div style={{ marginTop: 6 }}>
          <Text variant="body" muted>
            Добавьте букет на главной или в карточке товара.
          </Text>
        </div>
      </Surface>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {items.map((it) => {
        const p = products.get(it.productId);
        if (!p) return null;
        const rowSum = p.price * it.qty;
        return (
          <Surface key={it.productId} variant="soft" style={{ padding: 12, borderRadius: 'var(--r-lg)' }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <AppImage
                src={p.image}
                alt={p.title}
                style={{ width: 64, height: 64, borderRadius: 18, objectFit: 'cover', flexShrink: 0 }}
              />

              <div style={{ flex: 1, minWidth: 0 }}>
                <Text variant="subtitle" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {p.title}
                </Text>
                <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <QuantityStepper value={it.qty} onDec={() => onDec(it.productId)} onInc={() => onInc(it.productId)} min={1} />
                  <button
                    type="button"
                    onClick={() => onRemove(it.productId)}
                    style={{ border: 0, background: 'transparent', cursor: 'pointer', color: 'var(--muted)', fontWeight: 800 }}
                  >
                    Удалить
                  </button>
                </div>
              </div>

              <div style={{ fontWeight: 900, color: 'var(--accent)', whiteSpace: 'nowrap' }}>{rowSum} ₽</div>
            </div>
          </Surface>
        );
      })}
    </div>
  );
}
