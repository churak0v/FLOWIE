import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Copy, ChevronLeft, Clock } from 'lucide-react';
import { api } from '../api';
import { useAppState } from '../state/AppState';
import { buildActiveOrderPreview } from '../lib/orderPreview';
import { AppShell } from './layout/AppShell';
import { IconButton } from './ui/IconButton';
import { Surface } from './ui/Surface';
import { Text } from './ui/Text';

function fmtMmSs(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

async function copyToClipboard(value) {
  const v = String(value || '');
  if (!v) return false;
  try {
    await navigator.clipboard.writeText(v);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = v;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return Boolean(ok);
    } catch {
      return false;
    }
  }
}

function Row({ icon, label, value, onCopy }) {
  return (
    <Surface
      variant="soft"
      style={{
        padding: 14,
        borderRadius: 'var(--r-lg)',
        border: '1px solid var(--border)',
        background: 'var(--bg)',
        display: 'grid',
        gridTemplateColumns: '28px 1fr 34px',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <div style={{ width: 28, height: 28, display: 'grid', placeItems: 'center', color: 'var(--muted)' }}>{icon}</div>
      <div style={{ minWidth: 0 }}>
        <Text variant="caption">{label}</Text>
        <div style={{ marginTop: 4 }}>
          <Text variant="subtitle" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {value}
          </Text>
        </div>
      </div>
      <button
        type="button"
        onClick={onCopy}
        aria-label="Скопировать"
        style={{
          width: 34,
          height: 34,
          borderRadius: 12,
          border: '1px solid var(--border)',
          background: 'transparent',
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Copy size={18} />
      </button>
    </Surface>
  );
}

export function PaymentManual() {
  const navigate = useNavigate();
  const params = useParams();
  const orderId = Number(params.id);
  const { state, actions } = useAppState();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [order, setOrder] = useState(null);
  const [payment, setPayment] = useState(null); // { cardNumber, receiverName, bankName }
  const [copied, setCopied] = useState(''); // field name
  const [confirming, setConfirming] = useState(false);
  const [confirmDone, setConfirmDone] = useState(false);
  const [confirmError, setConfirmError] = useState('');

  const expiresAt = useMemo(() => {
    const v = order?.paymentExpiresAt;
    if (!v) return null;
    const d = new Date(v);
    return Number.isFinite(d.getTime()) ? d : null;
  }, [order?.paymentExpiresAt]);

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 250);
    return () => clearInterval(t);
  }, []);

  const remainingMs = useMemo(() => {
    if (!expiresAt) return 0;
    return Math.max(0, expiresAt.getTime() - now.getTime());
  }, [expiresAt, now]);

  const amount = Number(order?.amount ?? order?.totalPrice ?? 0);
  const paymentStatus = String(order?.paymentStatus || '');
  const orderStatus = String(order?.status || '');
  const isPaidFlow = paymentStatus === 'CONFIRMED' || ['DELIVERED', 'IN_DELIVERY', 'ASSEMBLED', 'ACCEPTED'].includes(orderStatus.toUpperCase());
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState('');
  const [cancelConfirm, setCancelConfirm] = useState(false);

  const pollRef = useRef(0);

  useEffect(() => {
    if (!Number.isFinite(orderId)) {
      setLoading(false);
      setError('Некорректный заказ');
      return;
    }

    let alive = true;
    setLoading(true);
    setError('');

    (async () => {
      try {
        const info = await api.getManualPaymentInfo(orderId);
        if (!alive) return;
        setOrder(info?.order || null);
        setPayment(info?.payment || null);
        setConfirmDone(Boolean(info?.order?.paymentClientConfirmed));
        if (info?.order?.id != null) actions.setActiveOrder(info.order.id, info.order.paymentExpiresAt || null, buildActiveOrderPreview(info.order));
      } catch (e) {
        if (!alive) return;
        setError(e?.data?.error || e?.message || 'Не удалось загрузить оплату');
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [orderId]);

  // Poll payment status until confirmed.
  useEffect(() => {
    if (!Number.isFinite(orderId)) return;
    if (paymentStatus === 'CONFIRMED') return;

    let alive = true;
    const t = setInterval(async () => {
      if (!alive) return;
      try {
        pollRef.current += 1;
        const res = await api.getOrder(orderId);
        const next = res?.order || null;
        if (!next) return;
        setOrder((prev) => ({ ...(prev || {}), ...next }));
      } catch {
        // ignore
      }
    }, 2500);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [orderId, paymentStatus]);

  // Do not clear active order on confirmed so card remains visible on главная.

  useEffect(() => {
    if (!copied) return undefined;
    const t = setTimeout(() => setCopied(''), 900);
    return () => clearTimeout(t);
  }, [copied]);

  // Auto-clear active order when expired.
  useEffect(() => {
    if (!order?.paymentExpiresAt) return;
    const expires = new Date(order.paymentExpiresAt).getTime();
    const check = () => {
      if (Date.now() > expires) {
        actions.clearActiveOrder();
      }
    };
    check();
    const t = setInterval(check, 2000);
    return () => clearInterval(t);
  }, [order?.paymentExpiresAt, actions]);

  if (loading) {
    return (
      <AppShell style={{ '--app-shell-bottom-space': '0px', '--app-content-inset-bottom': '0px' }}>
        <Text variant="title">Оплата</Text>
        <div style={{ marginTop: 'var(--sp-6)' }}>
          <Surface variant="soft" style={{ padding: 16, borderRadius: 'var(--r-lg)', border: '1px solid var(--border)', background: 'var(--bg)' }}>
            <Text variant="subtitle">Загружаем…</Text>
          </Surface>
        </div>
      </AppShell>
    );
  }

  if (error) {
    return (
      <AppShell style={{ '--app-shell-bottom-space': '0px', '--app-content-inset-bottom': '0px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <IconButton onClick={() => navigate(-1)} aria-label="Назад">
            <ChevronLeft size={22} />
          </IconButton>
          <Text variant="title">Оплата</Text>
        </div>
        <div style={{ marginTop: 'var(--sp-6)' }}>
          <Surface variant="soft" style={{ padding: 16, borderRadius: 'var(--r-lg)', border: '1px solid var(--border)', background: 'var(--bg)' }}>
            <Text variant="subtitle">Ошибка</Text>
            <div style={{ marginTop: 6 }}>
              <Text variant="body" muted>
                {error}
              </Text>
            </div>
          </Surface>
        </div>
      </AppShell>
    );
  }

  // Если оплата уже подтверждена — показываем карточку заказа/статусы
  if (isPaidFlow) {
    const statusOrder = ['ACCEPTED', 'ASSEMBLED', 'IN_DELIVERY', 'DELIVERED'];
    const current = String(order?.status || '').toUpperCase();
    const deliveredAt = order?.deliveredAt ? new Date(order.deliveredAt) : null;
    const deliveredStr = deliveredAt ? deliveredAt.toLocaleString('ru-RU', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'long' }) : null;
    const hasPhotos = Array.isArray(order?.photos) && order.photos.length > 0;
    const rated = Boolean(order?.preDeliveryRatedAt);

    return (
      <AppShell style={{ '--app-shell-bottom-space': '0px', '--app-shell-extra-bottom': '0px', '--app-content-inset-bottom': '0px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <IconButton onClick={() => navigate(-1)} aria-label="Назад">
            <ChevronLeft size={22} />
          </IconButton>
          <Text variant="title">Заказ #{order?.id}</Text>
        </div>

        <div style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {statusOrder.map((s, idx) => {
              const done = statusOrder.indexOf(current) >= idx;
              return (
                <React.Fragment key={s}>
                  <div
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 999,
                      background: done ? 'var(--c-success)' : 'var(--c-ink-10)',
                      display: 'grid',
                      placeItems: 'center',
                      color: 'white',
                      fontSize: 12,
                      fontWeight: 900,
                    }}
                  >
                    {idx + 1}
                  </div>
                  {idx < statusOrder.length - 1 ? <div style={{ flex: 1, height: 2, background: done ? 'var(--c-success)' : 'var(--c-ink-10)' }} /> : null}
                </React.Fragment>
              );
            })}
          </div>
          <div style={{ marginTop: 6, display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--muted)' }}>
            <span>Принят</span>
            <span>Собран</span>
            <span>В доставке</span>
            <span>Доставлен</span>
          </div>
        </div>

        {hasPhotos ? (
          <div style={{ marginTop: 16 }}>
            <Text variant="subtitle">Фото букета</Text>
            <div style={{ marginTop: 8, display: 'grid', gap: 10 }}>
              {order.photos.map((p) => (
                <Surface key={p.id} variant="soft" style={{ padding: 8, borderRadius: 'var(--r-lg)', border: '1px solid var(--border)' }}>
                  <img src={p.url} alt="" style={{ width: '100%', borderRadius: 12 }} />
                </Surface>
              ))}
            </div>
            {!rated ? (
              <div style={{ marginTop: 10, display: 'flex', gap: 10 }}>
                <button
                  type="button"
                  onClick={async () => { try { await api.rateOrderPhoto(order.id, 'UP'); setOrder((o) => ({ ...(o || {}), preDeliveryRatedAt: new Date().toISOString(), preDeliveryRating: 'UP' })); } catch { /* rating is best-effort */ } }}
                  style={{ flex: 1, height: 46, borderRadius: 'var(--r-lg)', border: 0, background: 'var(--c-success)', color: 'white', fontWeight: 900 }}
                >
                  👍 Нравится
                </button>
                <button
                  type="button"
                  onClick={async () => { try { await api.rateOrderPhoto(order.id, 'DOWN'); setOrder((o) => ({ ...(o || {}), preDeliveryRatedAt: new Date().toISOString(), preDeliveryRating: 'DOWN' })); navigate('/chat'); } catch { /* rating is best-effort */ } }}
                  style={{ flex: 1, height: 46, borderRadius: 'var(--r-lg)', border: '1px solid var(--border)', background: 'transparent', fontWeight: 900 }}
                >
                  👎 Не нравится
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        <div style={{ marginTop: 16 }}>
          <Text variant="subtitle">Получатель</Text>
          <Surface variant="soft" style={{ marginTop: 8, padding: 12, borderRadius: 'var(--r-lg)', border: '1px solid var(--border)' }}>
            <Text variant="body">{order?.recipientName || '—'}</Text>
            <div style={{ marginTop: 4 }}>
              <Text variant="body" muted>{order?.recipientPhone || '—'}</Text>
            </div>
          </Surface>
        </div>

        <div style={{ marginTop: 16 }}>
          <Text variant="subtitle">Адрес доставки</Text>
          <Surface variant="soft" style={{ marginTop: 8, padding: 12, borderRadius: 'var(--r-lg)', border: '1px solid var(--border)' }}>
            <Text variant="body">{order?.deliveryAddress || '—'}</Text>
            {order?.deliveryTime ? (
              <div style={{ marginTop: 4 }}>
                <Text variant="caption" muted>Время: {order.deliveryTime}</Text>
              </div>
            ) : null}
          </Surface>
        </div>

        {order?.floristComment ? (
          <div style={{ marginTop: 16 }}>
            <Text variant="subtitle">Комментарий</Text>
            <Surface variant="soft" style={{ marginTop: 8, padding: 12, borderRadius: 'var(--r-lg)', border: '1px solid var(--border)' }}>
              <Text variant="body">{order.floristComment}</Text>
            </Surface>
          </div>
        ) : null}

        <div style={{ marginTop: 16 }}>
          <Text variant="subtitle">Товары</Text>
          <div style={{ marginTop: 10, display: 'grid', gap: 10 }}>
            {(order?.items || []).map((it) => (
              <Surface key={it.id} variant="soft" style={{ padding: 12, borderRadius: 'var(--r-lg)', border: '1px solid var(--border)', display: 'grid', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text variant="body" style={{ fontWeight: 900 }}>{it.product?.name || `Товар #${it.productId}`}</Text>
                  {it.product?.isUpsell ? <span className="ui-chip" style={{ background: 'var(--c-ink-10)' }}>Доп</span> : <span className="ui-chip" style={{ background: 'var(--c-success-bg)', color: 'var(--c-success)' }}>Букет</span>}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 900 }}>
                  <span>{it.quantity} шт</span>
                  <span>{it.price * it.quantity} ₽</span>
                </div>
              </Surface>
            ))}
          </div>
          <div style={{ marginTop: 10, fontWeight: 1000, fontSize: 18 }}>Итого: {amount} ₽</div>
        </div>

        {deliveredStr ? (
          <div style={{ marginTop: 16 }}>
            <Text variant="body" muted>Доставили {deliveredStr}</Text>
          </div>
        ) : null}

        <div style={{ marginTop: 20 }}>
          {cancelConfirm ? (
            <Surface variant="soft" style={{ padding: 12, borderRadius: 'var(--r-lg)', border: '1px solid var(--border)' }}>
              <Text variant="subtitle">Точно отменить?</Text>
              <div style={{ marginTop: 10, display: 'flex', gap: 10 }}>
                <button
                  type="button"
                  disabled={cancelling}
                  onClick={async () => {
                    if (!order?.id) return;
                    setCancelling(true);
                    setCancelError('');
                    try {
                      await api.cancelOrderClient(order.id);
                      actions.clearActiveOrder();
                      navigate('/');
                    } catch (e) {
                      setCancelError(e?.data?.error || e?.message || 'Не удалось отменить');
                    } finally {
                      setCancelling(false);
                    }
                  }}
                  style={{
                    flex: 1,
                    height: 48,
                    borderRadius: 'var(--r-lg)',
                    border: 0,
                    background: '#d92d20',
                    color: 'white',
                    fontWeight: 900,
                  }}
                >
                  {cancelling ? 'Отменяем…' : 'Отменить заказ'}
                </button>
                <button
                  type="button"
                  onClick={() => setCancelConfirm(false)}
                  style={{
                    flex: 1,
                    height: 48,
                    borderRadius: 'var(--r-lg)',
                    border: '1px solid var(--border)',
                    background: 'transparent',
                    fontWeight: 900,
                  }}
                >
                  Оставить
                </button>
              </div>
              {cancelError ? (
                <div style={{ marginTop: 6 }}>
                  <Text variant="caption" style={{ color: '#d92d20' }}>{cancelError}</Text>
                </div>
              ) : null}
            </Surface>
          ) : (
            <button
              type="button"
              onClick={() => setCancelConfirm(true)}
              style={{
                width: '100%',
                height: 48,
                borderRadius: 'var(--r-lg)',
                border: '1px solid var(--border)',
                background: 'transparent',
                fontWeight: 900,
                color: 'var(--text)',
              }}
            >
              Отменить
            </button>
          )}
        </div>
      </AppShell>
    );
  }

  // Экран оплаты
  return (
    <AppShell style={{ '--app-shell-bottom-space': '0px', '--app-shell-extra-bottom': '0px', '--app-content-inset-bottom': '0px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <IconButton onClick={() => navigate(-1)} aria-label="Назад">
          <ChevronLeft size={22} />
        </IconButton>
        <Text variant="title">Оплата</Text>
      </div>

      <div style={{ marginTop: 'var(--sp-6)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <Text variant="title" style={{ fontSize: 24 }}>
          Переведите {amount} ₽
        </Text>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span className="ui-chip">
            <Clock size={14} />
            {remainingMs > 0 ? `Осталось ${fmtMmSs(remainingMs)}` : 'Время истекло'}
          </span>
          {paymentStatus === 'CONFIRMED' ? (
            <span className="ui-chip ui-chip--success">Оплата подтверждена</span>
          ) : (
            <span className="ui-chip ui-chip--accent">Ожидает подтверждения</span>
          )}
          {copied ? <span className="ui-chip">Скопировано</span> : null}
        </div>
      </div>

      <div style={{ marginTop: 'var(--sp-6)', display: 'grid', gap: 12 }}>
        <Row
          icon={<div style={{ width: 18, height: 12, border: '2px solid currentColor', borderRadius: 4 }} />}
          label="Номер карты"
          value={payment?.cardNumber || '—'}
          onCopy={async () => {
            const ok = await copyToClipboard(payment?.cardNumber || '');
            if (ok) setCopied('card');
          }}
        />
        <Row
          icon={<div style={{ fontWeight: 1000 }}>₽</div>}
          label="Сумма перевода"
          value={`${amount} ₽`}
          onCopy={async () => {
            const ok = await copyToClipboard(String(amount || ''));
            if (ok) setCopied('amount');
          }}
        />
        <Row
          icon={<div style={{ width: 18, height: 18, borderRadius: 999, border: '2px solid currentColor' }} />}
          label="Получатель"
          value={payment?.receiverName || '—'}
          onCopy={async () => {
            const ok = await copyToClipboard(payment?.receiverName || '');
            if (ok) setCopied('receiver');
          }}
        />
        <Row
          icon={<div style={{ width: 18, height: 14, border: '2px solid currentColor', borderRadius: 4 }} />}
          label="Банк получателя"
          value={payment?.bankName || '—'}
          onCopy={async () => {
            const ok = await copyToClipboard(payment?.bankName || '');
            if (ok) setCopied('bank');
          }}
        />
      </div>

      <div style={{ marginTop: 'var(--sp-8)', display: 'grid', gap: 10 }}>
        {paymentStatus === 'CONFIRMED' ? (
          <button
            type="button"
            onClick={() => navigate('/')}
            style={{
              height: 54,
              borderRadius: 'var(--r-lg)',
              border: 0,
              background: 'var(--accent)',
              color: 'var(--c-white)',
              fontWeight: 1000,
              cursor: 'pointer',
            }}
          >
            К заказу
          </button>
        ) : remainingMs <= 0 ? (
          <Surface variant="soft" style={{ padding: 14, borderRadius: 'var(--r-lg)', border: '1px solid var(--border)', background: 'var(--bg)' }}>
            <Text variant="body" muted>
              Время оплаты истекло. Создайте заказ заново.
            </Text>
          </Surface>
        ) : (
          <>
            <button
              type="button"
              disabled={confirming || confirmDone}
              onClick={async () => {
                if (!order?.id) return;
                setConfirming(true);
                setConfirmError('');
                try {
                  const res = await api.confirmPaymentClient(order.id);
                  actions.clearActiveOrder(); // убираем FAB
                  setConfirmDone(true);
                  setOrder((prev) => ({
                    ...(prev || {}),
                    paymentClientConfirmed: true,
                    paymentStatus: res?.order?.paymentStatus || prev?.paymentStatus,
                  }));
                  navigate('/'); // показать карточку на главной (без FAB)
                } catch (e) {
                  setConfirmError(e?.data?.error || e?.message || 'Не удалось отправить подтверждение');
                } finally {
                  setConfirming(false);
                }
              }}
              style={{
                height: 54,
                borderRadius: 'var(--r-lg)',
                border: 0,
              background: 'var(--accent)',
              color: 'var(--c-white)',
              fontWeight: 1000,
              cursor: confirming ? 'default' : 'pointer',
            }}
          >
              {confirming ? 'Отправляем…' : 'Подтвердить оплату'}
            </button>
            <Surface variant="soft" style={{ padding: 14, borderRadius: 'var(--r-lg)', border: '1px solid var(--border)', background: 'var(--bg)' }}>
              <Text variant="body" muted>
                После поступления перевода мы подтвердим оплату. Страница обновится автоматически.
              </Text>
              {confirmError ? (
                <div style={{ marginTop: 6 }}>
                  <Text variant="caption" style={{ color: 'var(--c-accent)' }}>
                    {confirmError}
                  </Text>
                </div>
              ) : null}
            </Surface>
          </>
        )}
      </div>
    </AppShell>
  );
}
