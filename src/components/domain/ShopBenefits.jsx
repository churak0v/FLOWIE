import React from 'react';
import { Surface } from '../ui/Surface';
import { Text } from '../ui/Text';

const DEFAULT_BENEFITS = [
  'Свежие цветы каждый день',
  'Фото букета перед отправкой',
  'Открытка в подарок',
];

export function ShopBenefits({ benefits = DEFAULT_BENEFITS }) {
  return (
    <div style={{ marginTop: 'var(--sp-8)' }}>
      <Text variant="title" style={{ marginBottom: 'var(--sp-4)' }}>
        Почему мы
      </Text>
      <div style={{ display: 'grid', gap: 10 }}>
        {benefits.map((b, idx) => (
          <Surface key={idx} variant="soft" style={{ padding: 14, borderRadius: 'var(--r-lg)' }}>
            <Text variant="body" style={{ fontWeight: 800 }}>
              {b}
            </Text>
          </Surface>
        ))}
      </div>
    </div>
  );
}

