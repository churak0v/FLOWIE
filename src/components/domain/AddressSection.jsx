import React from 'react';
import { Surface } from '../ui/Surface';
import { Text } from '../ui/Text';
import { Toggle } from '../ui/Toggle';

function Field({ label, value, onChange, placeholder }) {
  return (
    <div>
      <Text variant="caption">{label}</Text>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
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
  );
}

export function AddressSection({ askRecipientAddress, address, onToggleAsk, onChange }) {
  return (
    <div style={{ marginTop: 'var(--sp-8)' }}>
      <Text variant="title" style={{ marginBottom: 'var(--sp-4)' }}>
        Адрес
      </Text>
      <Text variant="caption" muted style={{ marginTop: '-12px', marginBottom: 'var(--sp-4)' }}>
        Доставка доступна только в Санкт-Петербурге и Ленинградской области.
      </Text>

      <Surface variant="soft" style={{ padding: 14, borderRadius: 'var(--r-lg)' }}>
        <Toggle checked={askRecipientAddress} onChange={() => onToggleAsk?.()} label="Узнать у получателя" />

        {!askRecipientAddress ? (
          <div style={{ marginTop: 14, display: 'grid', gap: 10 }}>
            <Field label="Улица" value={address.street} onChange={(v) => onChange?.({ street: v })} placeholder="Улица" />
            <Field label="Дом" value={address.house} onChange={(v) => onChange?.({ house: v })} placeholder="Дом" />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field label="Кв/офис" value={address.flat} onChange={(v) => onChange?.({ flat: v })} placeholder="Квартира" />
              <Field label="Этаж" value={address.floor} onChange={(v) => onChange?.({ floor: v })} placeholder="Этаж" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field label="Подъезд" value={address.entrance} onChange={(v) => onChange?.({ entrance: v })} placeholder="Подъезд" />
              <Field label="Комментарий" value={address.comment} onChange={(v) => onChange?.({ comment: v })} placeholder="Код домофона" />
            </div>
          </div>
        ) : null}
      </Surface>
    </div>
  );
}
