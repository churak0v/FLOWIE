import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminApi } from '../lib/adminApi';
import { Surface } from '../../src/components/ui/Surface';
import { Text } from '../../src/components/ui/Text';
import { AppImage } from '../../src/components/ui/AppImage';

const DATE_TABS = [
  { key: 'today', label: 'Сегодня' },
  { key: 'tomorrow', label: 'Завтра' },
  { key: 'all', label: 'Все' },
];

const STATUS_FILTERS = [
  { key: 'all', label: 'Все' },
  { key: 'NEW', label: 'Новые' },
  { key: 'ACCEPTED', label: 'Приняты' },
  { key: 'IN_DELIVERY', label: 'Доставка' },
  { key: 'DELIVERED', label: 'Выполнен' },
  { key: 'CANCELLED', label: 'Отменен' },
];

const ORDERS_CACHE = new Map(); // dateTab -> orders[]

function normalizeStatus(s) {
  const v = String(s || '').toUpperCase();
  if (v === 'NEW') return 'NEW';
  if (v === 'PAID') return 'NEW';
  if (v === 'PAYMENT_PENDING') return 'NEW';
  if (v === 'DELIVERY') return 'IN_DELIVERY';
  if (v === 'COMPLETED') return 'DELIVERED';
  if (v === 'CANCELLED') return 'CANCELLED';
  if (v === 'ACCEPTED') return 'ACCEPTED';
  if (v === 'ASSEMBLED') return 'ASSEMBLED';
  if (v === 'IN_DELIVERY') return 'IN_DELIVERY';
  if (v === 'DELIVERED') return 'DELIVERED';
  return v || 'NEW';
}

function statusChip(order) {
  const s = normalizeStatus(order?.status);
  const ps = String(order?.paymentStatus || '').toUpperCase();
  if (ps === 'PENDING') return { label: 'Ожидает оплаты', color: '#D92D20', bg: 'rgba(217,45,32,0.12)' };
  if (s === 'NEW') return { label: 'Новый', color: '#D92D20', bg: 'rgba(217,45,32,0.12)' };
  if (ps === 'CONFIRMED') return { label: 'Оплачен', color: '#16A34A', bg: 'rgba(22,163,74,0.12)' };
  if (s === 'ACCEPTED') return { label: 'Принят', color: '#D97706', bg: 'rgba(217,119,6,0.12)' };
  if (s === 'ASSEMBLED') return { label: 'Собран', color: '#2563EB', bg: 'rgba(37,99,235,0.12)' };
  if (s === 'IN_DELIVERY') return { label: 'В доставке', color: '#7C3AED', bg: 'rgba(124,58,237,0.12)' };
  if (s === 'DELIVERED') return { label: 'Доставлен', color: '#16A34A', bg: 'rgba(22,163,74,0.12)' };
  if (s === 'CANCELLED') return { label: 'Отменен', color: '#6B7280', bg: 'rgba(107,114,128,0.12)' };
  return { label: s, color: 'var(--text)', bg: 'var(--surface-2)' };
}

function actionFor(order) {
  const s = normalizeStatus(order?.status);
  const ps = String(order?.paymentStatus || '').toUpperCase();
  if (ps === 'PENDING' || s === 'NEW') return 'confirmPay';
  if (s === 'ACCEPTED') return 'uploadPhoto';
  if (s === 'ASSEMBLED') return 'dispatch';
  if (s === 'IN_DELIVERY') return 'complete';
  return null;
}

export function OrdersPage() {
  const navigate = useNavigate();
  const [dateTab, setDateTab] = useState('today');
  const [status, setStatus] = useState('all');
  const [items, setItems] = useState(() => ORDERS_CACHE.get('today') || []);
  const [busy, setBusy] = useState(() => !(ORDERS_CACHE.get('today') || []).length);
  const [error, setError] = useState('');
  const [confirmingId, setConfirmingId] = useState(null);

  async function load(opts = {}) {
    const { silent = false, ...apiOpts } = opts || {};
    // Keep the list on screen when refreshing, so tab switching doesn't feel like a full reload.
    if (!silent) setBusy(items.length === 0);
    if (!silent) setError('');
    try {
      const res = await adminApi.getOrders(dateTab === 'all' ? {} : { date: dateTab }, apiOpts);
      const next = res?.orders || [];
      ORDERS_CACHE.set(dateTab, next);
      setItems(next);
    } catch (e) {
      if (!silent) setError(e?.data?.error || e?.message || 'Не удалось загрузить заказы');
    } finally {
      if (!silent) setBusy(false);
    }
  }

  useEffect(() => {
    const cached = ORDERS_CACHE.get(dateTab);
    if (cached) {
      setItems(cached);
      setBusy(false);
      load({ silent: true });
      return;
    }
    load();
  }, [dateTab]);

  const visible = useMemo(() => {
    if (status === 'all') return items;
    return items.filter((o) => normalizeStatus(o.status) === status);
  }, [items, status]);

  async function confirmPayment(orderId) {
    if (!orderId) return;
    setConfirmingId(orderId);
    try {
      await adminApi.confirmOrderPayment(orderId);
      await load({ force: true, silent: false });
    } catch (e) {
      alert(e?.data?.error || e?.message || 'Не удалось подтвердить оплату');
    } finally {
      setConfirmingId(null);
    }
  }

  return (
    <div style={{ paddingBottom: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
        <Text variant="title">Заказы</Text>
        <button
          type="button"
          onClick={() => load({ force: true })}
          style={{ border: 0, background: 'transparent', cursor: 'pointer', color: 'var(--muted)', fontWeight: 900 }}
        >
          Обновить
        </button>
      </div>

      <div className="hide-scrollbar" style={{ display: 'flex', gap: 8, overflowX: 'auto', marginTop: 14, paddingBottom: 6 }}>
        {DATE_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setDateTab(t.key)}
            style={{
              height: 34,
              padding: '0 14px',
              borderRadius: 'var(--r-pill)',
              border: 0,
              background: dateTab === t.key ? 'var(--text)' : 'var(--surface)',
              color: dateTab === t.key ? 'var(--c-white)' : 'var(--text)',
              cursor: 'pointer',
              fontWeight: 900,
              whiteSpace: 'nowrap',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="hide-scrollbar" style={{ display: 'flex', gap: 8, overflowX: 'auto', marginTop: 10, paddingBottom: 6 }}>
        {STATUS_FILTERS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setStatus(t.key)}
            style={{
              height: 34,
              padding: '0 14px',
              borderRadius: 'var(--r-pill)',
              border: '1px solid var(--border)',
              background: status === t.key ? 'var(--surface-2)' : 'transparent',
              cursor: 'pointer',
              fontWeight: 900,
              whiteSpace: 'nowrap',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {busy ? (
        <div style={{ marginTop: 16 }}>
          <Surface variant="soft" style={{ padding: 16, borderRadius: 'var(--r-lg)' }}>
            <Text variant="subtitle">Загружаем…</Text>
          </Surface>
        </div>
      ) : error ? (
        <div style={{ marginTop: 16 }}>
          <Surface variant="soft" style={{ padding: 16, borderRadius: 'var(--r-lg)' }}>
            <Text variant="subtitle">Ошибка</Text>
            <div style={{ marginTop: 6 }}>
              <Text variant="body" muted>
                {error}
              </Text>
            </div>
          </Surface>
        </div>
      ) : visible.length === 0 ? (
        <div style={{ marginTop: 16 }}>
          <Surface variant="soft" style={{ padding: 16, borderRadius: 'var(--r-lg)' }}>
            <Text variant="subtitle">Нет заказов</Text>
          </Surface>
        </div>
      ) : (
        <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1fr', gap: 12, minWidth: 0 }}>
          {visible.map((o) => {
            const chip = statusChip(o);
            const first = (o.items || [])[0];
            const img = first?.product?.image || first?.product?.images?.[0]?.url || null;
            const deliveryLine = o.deliveryTime
              ? String(o.deliveryTime)
              : o.createdAt
                ? new Date(o.createdAt).toLocaleDateString('ru-RU')
                : '—';
            return (
              <Surface
                key={o.id}
                variant="soft"
                onClick={() => navigate(`/orders/${o.id}`)}
                style={{
                  width: '100%',
                  maxWidth: '100%',
                  padding: 14,
                  borderRadius: 'var(--r-lg)',
                  cursor: 'pointer',
                  background: chip.bg || 'var(--bg)',
                  border: `1px solid ${chip.color}`,
                  boxShadow: 'none',
                  overflow: 'hidden',
                }}
              >
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12, alignItems: 'start', minWidth: 0 }}>
                  <div
                    style={{
                      width: '100%',
                      aspectRatio: '1 / 1',
                      borderRadius: 30,
                      overflow: 'hidden',
                      border: '1px solid var(--border)',
                      background: 'var(--surface)',
                    }}
                  >
                    {img ? <AppImage src={img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : null}
                  </div>

                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 16, fontWeight: 1100, color: chip.color, letterSpacing: '-0.01em' }}>{chip.label}</div>
                    <div style={{ marginTop: 4 }}>
                      <Text variant="caption" muted>
                        № {o.id}
                      </Text>
                    </div>

                    <div style={{ marginTop: 10 }}>
                      <Text variant="body" muted style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {deliveryLine}
                      </Text>
                    </div>

                    <div style={{ marginTop: 8 }}>
                      <Text variant="body" muted style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {o.deliveryAddress || 'Адрес не указан'}
                      </Text>
                    </div>

                    <div style={{ marginTop: 10, fontWeight: 1100, color: 'var(--text)', whiteSpace: 'nowrap' }}>{o.totalPrice} ₽</div>
                    {(() => {
                      const action = actionFor(o);
                      if (!action) return null;
                      if (action === 'confirmPay') {
                        return (
                          <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); confirmPayment(o.id); }}
                              disabled={confirmingId === o.id}
                              style={{ height: 36, borderRadius: 10, border: 0, padding: '0 12px', fontWeight: 900, background: '#D92D20', color: 'white' }}
                            >
                              {confirmingId === o.id ? '...' : 'Подтвердить оплату'}
                            </button>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); adminApi.acceptOrder(o.id).then(() => load({ force: true })).catch((err) => alert(err?.data?.error || err.message || 'Ошибка')); }}
                              style={{ height: 36, borderRadius: 10, border: 0, padding: '0 12px', fontWeight: 900, background: '#F59E0B', color: 'white' }}
                            >
                              Принять
                            </button>
                          </div>
                        );
                      }
                      if (action === 'uploadPhoto') {
                        return (
                          <div style={{ marginTop: 10 }}>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); navigate(`/orders/${o.id}`); }}
                              style={{ height: 36, borderRadius: 10, border: 0, padding: '0 12px', fontWeight: 900, background: '#2563EB', color: 'white' }}
                            >
                              Загрузить фото
                            </button>
                          </div>
                        );
                      }
                      if (action === 'dispatch') {
                        return (
                          <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                adminApi.dispatchOrder(o.id).then(() => load({ force: true })).catch((err) => alert(err?.data?.error || err.message || 'Ошибка'));
                              }}
                              style={{ height: 36, borderRadius: 10, border: 0, padding: '0 12px', fontWeight: 900, background: '#7C3AED', color: 'white' }}
                            >
                              Отвезу сам
                            </button>
                            <button
                              type="button"
                              onClick={async (e) => {
                                e.stopPropagation();
                                try {
                                  const list = await adminApi.getCouriers();
                                  const options = (list?.couriers || []).map((c) => `${c.id}: ${c.name || c.username || ''}`).join('\\n');
                                  const input = window.prompt(`ID курьера:\\n${options}`);
                                  const cid = Number(input);
                                  if (!Number.isFinite(cid)) return;
                                  await adminApi.dispatchOrder(o.id, cid);
                                  await load({ force: true });
                                } catch (err) {
                                  alert(err?.data?.error || err.message || 'Не удалось назначить');
                                }
                              }}
                              style={{ height: 36, borderRadius: 10, border: '1px solid #7C3AED', padding: '0 12px', fontWeight: 900, background: 'white', color: '#7C3AED' }}
                            >
                              Назначить курьера
                            </button>
                          </div>
                        );
                      }
                      if (action === 'complete') {
                        return (
                          <div style={{ marginTop: 10 }}>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                adminApi.completeOrder(o.id).then(() => load({ force: true })).catch((err) => alert(err?.data?.error || err.message || 'Ошибка'));
                              }}
                              style={{ height: 36, borderRadius: 10, border: 0, padding: '0 12px', fontWeight: 900, background: '#16A34A', color: 'white' }}
                            >
                              Доставлено
                            </button>
                          </div>
                        );
                      }
                      return null;
                    })()}
                  </div>
                </div>
              </Surface>
            );
          })}
        </div>
      )}
    </div>
  );
}
