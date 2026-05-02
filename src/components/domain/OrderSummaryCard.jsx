import React from 'react';
import { Surface } from '../ui/Surface';
import { Text } from '../ui/Text';

export function OrderSummaryCard({ recipient, product, address }) {
  return (
    <Surface variant="flat" style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ width: 163, textAlign: 'center' }}>
          <img
            src={product.image}
            alt={product.title}
            style={{ width: 163, height: 163, borderRadius: 'var(--r-md)', objectFit: 'cover' }}
          />
          <div style={{ marginTop: 12 }}>
            <Text variant="subtitle">{product.title}</Text>
          </div>
        </div>

        <div style={{ width: 164, textAlign: 'center' }}>
          <img
            src={recipient.avatar}
            alt={recipient.name}
            style={{ width: 164, height: 170, borderRadius: 'var(--r-lg)', objectFit: 'cover' }}
          />
          <div style={{ marginTop: 12 }}>
            <Text variant="subtitle">{recipient.name}</Text>
          </div>
        </div>
      </div>

      <div style={{ width: '100%', height: 1, background: 'var(--c-border)', margin: 'var(--sp-4) 0' }} />

      <div>
        <Text variant="caption">Адрес доставки</Text>
        <div style={{ marginTop: 6 }}>
          <Text variant="body" style={{ fontWeight: 700 }}>
            {address}
          </Text>
        </div>
      </div>
    </Surface>
  );
}

