import React from 'react';
import { Surface } from '../ui/Surface';
import { Text } from '../ui/Text';
import { ProductDescription } from './ProductDescription';

export function ProductInfo({ product }) {
  return (
    <Surface variant="soft" style={{ padding: 14, borderRadius: 'var(--r-lg)' }}>
      <Text variant="title">{product.title}</Text>

      {product.subtitle ? (
        <div style={{ marginTop: 6 }}>
          <Text variant="body" muted>
            {product.subtitle}
          </Text>
        </div>
      ) : null}

      {product.composition?.length ? (
        <div style={{ marginTop: 14, display: 'grid', gap: 8 }}>
          {product.composition.map((b, idx) => (
            <Text key={idx} variant="body" muted style={{ fontWeight: 700 }}>
              {b}
            </Text>
          ))}
        </div>
      ) : null}

      <div style={{ marginTop: 14, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {product.size ? (
          <span className="ui-chip" style={{ background: 'var(--surface)', borderColor: 'transparent' }}>
            Размер {product.size}
          </span>
        ) : null}
        <span className="ui-chip ui-chip--accent" style={{ background: 'var(--surface)', borderColor: 'transparent' }}>
          {product.price} ₽
        </span>
      </div>

      {product.description ? (
        <div style={{ marginTop: 12 }}>
          <ProductDescription text={product.description} />
        </div>
      ) : null}
    </Surface>
  );
}
