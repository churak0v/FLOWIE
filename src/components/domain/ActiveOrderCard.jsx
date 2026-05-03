import React from 'react';
import { ChevronRight, Gift } from 'lucide-react';
import { Surface } from '../ui/Surface';
import { Text } from '../ui/Text';
import { AppImage } from '../ui/AppImage';
import { formatMoney } from '../../lib/money';

function normalizedStatus(order) {
  const ps = String(order?.paymentStatus || '').toUpperCase();
  const st = String(order?.status || '').toUpperCase();
  if (st === 'DELIVERY') return 'IN_DELIVERY';
  if (st === 'COMPLETED') return 'DELIVERED';
  if (st === 'PAID' || st === 'PAYMENT_PENDING') return ps === 'CONFIRMED' ? 'ACCEPTED' : 'PAYMENT_PENDING';
  return st || ps;
}

function statusMeta(order) {
  const st = normalizedStatus(order);
  if (st === 'PAYMENT_PENDING') return { label: 'Payment', done: false };
  if (st === 'ACCEPTED') return { label: 'Accepted', done: false };
  if (st === 'ASSEMBLED') return { label: 'Packed', done: false };
  if (st === 'IN_DELIVERY') return { label: 'On the way', done: false };
  if (st === 'DELIVERED') return { label: 'Delivered', done: true };
  return { label: 'In progress', done: false };
}

function itemLabel(order) {
  const items = Array.isArray(order?.items) ? order.items : [];
  const names = items
    .map((it) => it?.product?.name || it?.product?.title || '')
    .filter(Boolean);
  if (!names.length) return 'Wishlist gift';
  if (names.length === 1) return names[0];
  return `${names[0]} + ${names.length - 1} more`;
}

export function ActiveOrderCard({ order, onClick }) {
  if (!order) return null;
  const firstItem = order.items?.[0];
  const img = firstItem?.product?.image || firstItem?.product?.images?.[0]?.url || '';
  const meta = statusMeta(order);
  const recipient = order.recipientName || 'Vivienne';
  const amount = Number(order.totalPrice || order.amount || 0);

  return (
    <button
      type="button"
      onClick={onClick}
      style={{ width: '100%', border: 0, background: 'transparent', padding: 0, textAlign: 'left' }}
      aria-label="Active order"
    >
      <Surface
        variant="default"
        fullWidth
        style={{
          padding: 14,
          borderRadius: 'var(--r-xl)',
          border: '1px solid var(--border)',
          boxShadow: 'var(--shadow-1)',
          overflow: 'hidden',
        }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: '64px minmax(0, 1fr) auto', gap: 12, alignItems: 'center' }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 18,
              overflow: 'hidden',
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              display: 'grid',
              placeItems: 'center',
            }}
          >
            {img ? <AppImage src={img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Gift size={22} color="var(--accent)" />}
          </div>

          <div style={{ minWidth: 0 }}>
            <Text variant="subtitle" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              Gift for {recipient}
            </Text>
            <Text variant="body" muted style={{ marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {itemLabel(order)}
            </Text>
            {amount > 0 ? (
              <Text variant="caption" style={{ marginTop: 5, color: 'var(--accent)' }}>
                {formatMoney(amount)}
              </Text>
            ) : null}
          </div>

          <div style={{ display: 'grid', justifyItems: 'end', gap: 8, flexShrink: 0 }}>
            <span
              className="ui-chip"
              style={{
                height: 30,
                borderColor: meta.done ? 'var(--c-success-border)' : 'var(--c-accent-border)',
                background: meta.done
                  ? 'var(--c-success-bg)'
                  : 'linear-gradient(110deg, var(--c-accent-10) 0%, rgba(198, 83, 109, 0.16) 34%, rgba(198, 83, 109, 0.28) 50%, rgba(198, 83, 109, 0.16) 66%, var(--c-accent-10) 100%)',
                backgroundSize: meta.done ? 'auto' : '260% 100%',
                color: meta.done ? 'var(--c-success)' : 'var(--accent)',
                animation: meta.done ? 'none' : 'flowieStatusSweep 2.2s ease-in-out infinite alternate',
              }}
            >
              {meta.label}
            </span>
            <ChevronRight size={19} color="var(--muted)" />
          </div>
        </div>
      </Surface>
    </button>
  );
}
