import React from 'react';
import { Carousel } from '../ui/Carousel';
import { Surface } from '../ui/Surface';
import { Text } from '../ui/Text';

function MethodCard({ title, subtitle, selected, onClick }) {
  return (
    <Surface
      variant="soft"
      border
      onClick={onClick}
      style={{
        width: 'clamp(150px, 42vw, 200px)',
        flexShrink: 0,
        padding: 14,
        borderRadius: 26,
        cursor: 'pointer',
        border: selected ? '2px solid var(--accent)' : '1px solid var(--border)',
        boxSizing: 'border-box',
        boxShadow: selected ? '0 6px 20px rgba(0,0,0,0.10)' : 'var(--shadow-1)',
        background: 'var(--surface)',
      }}
    >
      <Text variant="subtitle">{title}</Text>
      {subtitle ? (
        <div style={{ marginTop: 6 }}>
          <Text variant="body" muted>
            {subtitle}
          </Text>
        </div>
      ) : null}
    </Surface>
  );
}

export function PaymentMethods({ value, onChange }) {
  return (
    <div style={{ marginTop: 'var(--sp-8)' }}>
      <Text variant="title" style={{ marginBottom: 'var(--sp-4)' }}>
        Оплата
      </Text>

      <Carousel>
        <MethodCard
          title="Ручной перевод"
          subtitle="Оплата переводом (15 минут)"
          selected={value === 'manual'}
          onClick={() => onChange?.('manual')}
        />
      </Carousel>
    </div>
  );
}
