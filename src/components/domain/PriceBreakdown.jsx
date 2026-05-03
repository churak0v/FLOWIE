import React from 'react';
import { Surface } from '../ui/Surface';
import { Text } from '../ui/Text';
import { formatMoney } from '../../lib/money';

function Row({ label, value, strong }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontWeight: strong ? 900 : 700 }}>
      <span style={{ color: strong ? 'var(--text)' : 'var(--muted)' }}>{label}</span>
      <span style={{ color: strong ? 'var(--text)' : 'var(--text)' }}>{value}</span>
    </div>
  );
}

export function PriceBreakdown({ itemsTotal, upsellsTotal, deliveryCost, bonusesApplied }) {
  const subtotal = itemsTotal + upsellsTotal + deliveryCost;
  const total = Math.max(0, subtotal - bonusesApplied);
  const showUpsells = upsellsTotal > 0;

  return (
    <Surface variant="soft" style={{ padding: 14, borderRadius: 'var(--r-lg)' }}>
      <div style={{ display: 'grid', gap: 10 }}>
        <Row label="Items" value={formatMoney(itemsTotal)} />
        {showUpsells ? <Row label="Add-ons" value={formatMoney(upsellsTotal)} /> : null}
        <Row label="Gift note" value={formatMoney(0)} />
        <Row label="Delivery coordination" value={formatMoney(deliveryCost)} />
        {bonusesApplied ? <Row label="Discount" value={`- ${formatMoney(bonusesApplied)}`} /> : null}
        <div style={{ height: 1, background: 'var(--border)', margin: '6px 0' }} />
        <Row label="Total" value={formatMoney(total)} strong />
      </div>
    </Surface>
  );
}
