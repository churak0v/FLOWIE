import React from 'react';
import { Surface } from '../ui/Surface';
import { Text } from '../ui/Text';
import { Toggle } from '../ui/Toggle';

export function BonusesBlock({ balance, useBonuses, onToggle }) {
  return (
    <Surface variant="soft" style={{ padding: 14, borderRadius: 'var(--r-lg)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
        <Text variant="subtitle">Бонусы</Text>
        <Text variant="body" muted style={{ fontWeight: 800 }}>
          {balance} ₽
        </Text>
      </div>

      <div style={{ marginTop: 12 }}>
        <Toggle checked={useBonuses} onChange={() => onToggle?.()} label="Списать" />
      </div>
    </Surface>
  );
}

