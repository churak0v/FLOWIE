import React from 'react';
import { ChevronRight } from 'lucide-react';
import { Surface } from '../ui/Surface';
import { Text } from '../ui/Text';
import { AppImage } from '../ui/AppImage';

function statusLabel(order) {
  if (!order) return '';
  const ps = String(order.paymentStatus || '').toUpperCase();
  const st = String(order.status || '').toUpperCase();
  if (ps === 'PENDING') return 'Ожидает оплаты';
  if (ps === 'CONFIRMED') return 'Оплачено';
  if (st === 'ACCEPTED') return 'Принят';
  if (st === 'ASSEMBLED') return 'Собран';
  if (st === 'IN_DELIVERY') return 'В доставке';
  if (st === 'DELIVERED') return 'Доставлен';
  return st || ps;
}

export function ActiveOrderCard({ order, onClick }) {
  if (!order) return null;
  const firstItem = order.items?.[0];
  const img = firstItem?.product?.image || firstItem?.product?.images?.[0]?.url || '';

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: '100%',
        border: 0,
        background: 'transparent',
        padding: 0,
        textAlign: 'left',
      }}
      aria-label="Активный заказ"
    >
      <Surface
        variant="soft"
        fullWidth
        border
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: 12,
          borderRadius: 'var(--r-lg)',
          boxShadow: 'var(--shadow-1)',
        }}
      >
        <div
          style={{
            width: 62,
            height: 62,
            borderRadius: 18,
            overflow: 'hidden',
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            flexShrink: 0,
          }}
        >
          {img ? (
            <AppImage src={img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : null}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <Text variant="subtitle" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            Заказ #{order.id}
          </Text>
          <div style={{ marginTop: 4 }}>
            <Text variant="body" muted>
              {statusLabel(order)}
            </Text>
          </div>
        </div>
        <ChevronRight size={22} color="var(--muted)" />
      </Surface>
    </button>
  );
}
