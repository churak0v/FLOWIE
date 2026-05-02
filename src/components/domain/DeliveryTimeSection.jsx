import React from 'react';
import { Surface } from '../ui/Surface';
import { Text } from '../ui/Text';
import { Toggle } from '../ui/Toggle';

export function DeliveryTimeSection({ askRecipientTime, date, time, onToggleAsk, onChange }) {
  const MIN_DELIVERY_DATE = '2026-02-13';
  const MIN_DELIVERY_TIME = '16:00';

  const isMinDate = date === MIN_DELIVERY_DATE;

  function normalizeSelection(nextDate, nextTime) {
    const finalDate = nextDate && nextDate < MIN_DELIVERY_DATE ? MIN_DELIVERY_DATE : nextDate;
    const finalTime =
      finalDate === MIN_DELIVERY_DATE && nextTime && nextTime < MIN_DELIVERY_TIME
        ? MIN_DELIVERY_TIME
        : nextTime;
    return { date: finalDate, time: finalTime };
  }

  return (
    <div style={{ marginTop: 'var(--sp-8)' }}>
      <Text variant="title" style={{ marginBottom: 'var(--sp-4)' }}>
        Время доставки
      </Text>

      <Surface variant="soft" style={{ padding: 14, borderRadius: 'var(--r-lg)' }}>
        <Toggle checked={askRecipientTime} onChange={() => onToggleAsk?.()} label="Узнать у получателя" />

        {!askRecipientTime ? (
          <div style={{ marginTop: 14, display: 'grid', gap: 10 }}>
            <div>
              <Text variant="caption">Дата</Text>
              <input
                type="date"
                value={date}
                min={MIN_DELIVERY_DATE}
                onChange={(e) => {
                  const next = normalizeSelection(e.target.value, time);
                  onChange?.(next);
                }}
                style={{
                  marginTop: 6,
                  width: '100%',
                  border: '1px solid var(--border)',
                  borderRadius: 16,
                  padding: 12,
                  background: 'var(--c-white)',
                }}
              />
            </div>
            <div>
              <Text variant="caption">Время</Text>
              <input
                type="time"
                value={time}
                min={isMinDate ? MIN_DELIVERY_TIME : undefined}
                onChange={(e) => {
                  const next = normalizeSelection(date, e.target.value);
                  onChange?.(next);
                }}
                style={{
                  marginTop: 6,
                  width: '100%',
                  border: '1px solid var(--border)',
                  borderRadius: 16,
                  padding: 12,
                  background: 'var(--c-white)',
                }}
              />
            </div>
          </div>
        ) : null}
      </Surface>
    </div>
  );
}
