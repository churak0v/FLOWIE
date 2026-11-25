import { Surface } from '../ui/Surface';
import { formatMoney } from '../../lib/money';

function Row({ label, value, strong }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontWeight: strong ? 900 : 700 }}>
      <span style={{ color: strong ? 'var(--text)' : 'var(--muted)' }}>{label}</span>
      <span style={{ color: strong ? 'var(--text)' : 'var(--text)' }}>{value}</span>
    </div>
  );
}

export function PriceBreakdown({ itemsTotal, upsellsTotal, deliveryCost, bonusesApplied, deliverySeparate = false, deliveryPending = false }) {
  const subtotal = itemsTotal + upsellsTotal + (deliverySeparate ? 0 : Number(deliveryCost || 0));
  const total = Math.max(0, subtotal - bonusesApplied);
  const showUpsells = upsellsTotal > 0;
  const showDelivery = deliverySeparate || deliveryPending || deliveryCost != null;

  return (
    <Surface variant="soft" style={{ padding: 14, borderRadius: 'var(--r-lg)' }}>
      <div style={{ display: 'grid', gap: 10 }}>
        <Row label="Товары" value={formatMoney(itemsTotal)} />
        {showUpsells ? <Row label="Дополнения" value={formatMoney(upsellsTotal)} /> : null}
        <Row label="Открытка" value={formatMoney(0)} />
        {showDelivery ? (
          <Row
            label="Доставка"
            value={deliverySeparate ? 'Отдельным счётом' : deliveryPending ? 'Рассчитаем по адресу' : formatMoney(deliveryCost)}
          />
        ) : null}
        {bonusesApplied ? <Row label="Скидка" value={`- ${formatMoney(bonusesApplied)}`} /> : null}
        <div style={{ height: 1, background: 'var(--border)', margin: '6px 0' }} />
        <Row label={deliverySeparate || deliveryPending ? 'Товары сейчас' : 'Итого'} value={formatMoney(total)} strong />
      </div>
    </Surface>
  );
}
