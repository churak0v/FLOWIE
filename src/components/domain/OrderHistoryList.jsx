import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { api } from '../../api';
import { formatMoney } from '../../lib/money';
import { Surface } from '../ui/Surface';
import { Text } from '../ui/Text';
import { useAppState } from '../../state/AppState';

function statusLabel(order) {
  const st = String(order?.status || '').toUpperCase();
  const ps = String(order?.paymentStatus || '').toUpperCase();
  if (st === 'DELIVERED' || st === 'COMPLETED') return 'Доставлен';
  if (st === 'IN_DELIVERY' || st === 'DELIVERY') return 'В пути';
  if (st === 'ASSEMBLED') return 'Собран';
  if (st === 'ACCEPTED' || (st === 'PAID' && ps === 'CONFIRMED')) return 'Принят';
  if (ps === 'PENDING') return 'Оплата';
  return 'В работе';
}

function statusTone(order) {
  const label = statusLabel(order);
  if (label === 'Доставлен') return 'success';
  if (label === 'Оплата') return 'accent';
  return 'default';
}

function itemLabel(order) {
  const names = (order?.items || [])
    .map((it) => it?.product?.name || it?.product?.title || '')
    .filter(Boolean);
  if (!names.length) return 'Заказ цветов';
  if (names.length === 1) return names[0];
  return `${names[0]} + ещё ${names.length - 1}`;
}

function orderDate(order) {
  const raw = order?.deliveredAt || order?.paidAt || order?.createdAt;
  const d = raw ? new Date(raw) : null;
  if (!d || !Number.isFinite(d.getTime())) return '';
  return d.toLocaleDateString('ru-RU', { month: 'short', day: 'numeric' });
}

function OrderRow({ order }) {
  const navigate = useNavigate();
  const tone = statusTone(order);
  const amount = Number(order?.totalPrice || order?.amount || 0);

  return (
    <button
      type="button"
      onClick={() => navigate(`/pay/${encodeURIComponent(String(order.id))}`)}
      style={{ width: '100%', border: 0, background: 'transparent', padding: 0, textAlign: 'left', cursor: 'pointer' }}
    >
      <Surface
        variant="soft"
        style={{
          padding: 12,
          borderRadius: 'var(--r-lg)',
          border: '1px solid var(--border)',
          background: 'var(--bg)',
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) auto',
          gap: 12,
          alignItems: 'center',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', minWidth: 0 }}>
            <Text variant="subtitle" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              Цветы для {order?.recipientName || 'получателя'}
            </Text>
            {orderDate(order) ? (
              <Text variant="caption" muted style={{ flexShrink: 0 }}>
                {orderDate(order)}
              </Text>
            ) : null}
          </div>
          <Text variant="body" muted style={{ marginTop: 5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {itemLabel(order)}
          </Text>
          {amount > 0 ? (
            <Text variant="caption" style={{ marginTop: 5, color: 'var(--accent)' }}>
              {formatMoney(amount)}
            </Text>
          ) : null}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            className={`ui-chip ${tone === 'success' ? 'ui-chip--success' : tone === 'accent' ? 'ui-chip--accent' : ''}`}
            style={{ height: 30 }}
          >
            {statusLabel(order)}
          </span>
          <ChevronRight size={18} color="var(--muted)" />
        </div>
      </Surface>
    </button>
  );
}

export function OrderHistoryList({ recipientName = '', limit = 6, emptyText = 'Заказов пока нет.' }) {
  const { state } = useAppState();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    api
      .getOrders()
      .then((res) => {
        if (!alive) return;
        setOrders(Array.isArray(res) ? res : []);
      })
      .catch((e) => {
        if (!alive) return;
        setError(e?.message || 'Не удалось загрузить заказы');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [state.auth.me?.id]);

  const filtered = useMemo(() => {
    const name = String(recipientName || '').trim().toLowerCase();
    const list = name
      ? orders.filter((o) => String(o?.recipientName || '').trim().toLowerCase() === name)
      : orders;
    return list.slice(0, limit);
  }, [limit, orders, recipientName]);

  if (loading) {
    return (
      <Surface variant="soft" style={{ padding: 12, borderRadius: 'var(--r-lg)', border: '1px solid var(--border)', background: 'var(--bg)' }}>
        <Text variant="body" muted>Загружаем заказы...</Text>
      </Surface>
    );
  }

  if (error) {
    return (
      <Surface variant="soft" style={{ padding: 12, borderRadius: 'var(--r-lg)', border: '1px solid var(--border)', background: 'var(--bg)' }}>
        <Text variant="body" muted>{error}</Text>
      </Surface>
    );
  }

  if (!filtered.length) {
    return (
      <Surface variant="soft" style={{ padding: 12, borderRadius: 'var(--r-lg)', border: '1px solid var(--border)', background: 'var(--bg)' }}>
        <Text variant="body" muted>{emptyText}</Text>
      </Surface>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {filtered.map((order) => (
        <OrderRow key={order.id} order={order} />
      ))}
    </div>
  );
}
