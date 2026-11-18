import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Copy, CreditCard, ChevronLeft, Clock, ExternalLink } from 'lucide-react';
import { api } from '../api';
import { useAppState } from '../state/AppState';
import { buildActiveOrderPreview } from '../lib/orderPreview';
import { formatMoney } from '../lib/money';
import { AppShell } from './layout/AppShell';
import { IconButton } from './ui/IconButton';
import { Surface } from './ui/Surface';
import { Text } from './ui/Text';
import { AppImage } from './ui/AppImage';
import { trackAnalytics } from '../lib/analytics';

const FALLBACK_RECIPIENT_IMAGE = 'https://images.unsplash.com/photo-1526045612212-70caf35c14df?auto=format&fit=crop&w=900&q=80';

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

function normalizeProgressStatus(status, paymentStatus) {
  const current = String(status || '').toUpperCase();
  const paid = String(paymentStatus || '').toUpperCase() === 'CONFIRMED';
  if (current === 'DELIVERY') return 'IN_DELIVERY';
  if (current === 'COMPLETED') return 'DELIVERED';
  if (current === 'PAID' || current === 'PAYMENT_PENDING') return paid ? 'ACCEPTED' : current;
  return current;
}

const ORDER_STATUS_STEPS = [
  { key: 'ACCEPTED', label: 'Принят' },
  { key: 'ASSEMBLED', label: 'Собран' },
  { key: 'IN_DELIVERY', label: 'В пути' },
  { key: 'DELIVERED', label: 'Доставлен' },
];

function OrderStatusTimeline({ current }) {
  const foundIndex = ORDER_STATUS_STEPS.findIndex((s) => s.key === current);
  const currentIndex = Math.max(0, foundIndex);

  return (
    <Surface
      variant="soft"
      style={{
        padding: '14px 12px 12px',
        borderRadius: 'var(--r-xl)',
        border: '1px solid var(--border)',
        background: 'var(--bg)',
      }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', alignItems: 'start' }}>
        {ORDER_STATUS_STEPS.map((step, idx) => {
          const done = currentIndex >= idx;
          const lineDone = currentIndex > idx;
          const lineActive = currentIndex === idx && idx < ORDER_STATUS_STEPS.length - 1;

          return (
            <div key={step.key} style={{ position: 'relative', display: 'grid', justifyItems: 'center', gap: 8, minWidth: 0 }}>
              {idx < ORDER_STATUS_STEPS.length - 1 ? (
                <div
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    top: 16,
                    left: 'calc(50% + 20px)',
                    right: 'calc(-50% + 20px)',
                    height: 3,
                    borderRadius: 999,
                    background: lineDone
                      ? 'var(--c-success)'
                      : lineActive
                        ? 'linear-gradient(110deg, var(--c-ink-10) 0%, rgba(3, 170, 82, 0.28) 42%, var(--c-success) 50%, rgba(3, 170, 82, 0.28) 58%, var(--c-ink-10) 100%)'
                        : 'var(--c-ink-10)',
                    backgroundSize: lineActive ? '260% 100%' : 'auto',
                    animation: lineActive ? 'flowieStatusSweep 2.2s ease-in-out infinite alternate' : 'none',
                    zIndex: 0,
                  }}
                />
              ) : null}

              <div
                style={{
                  position: 'relative',
                  zIndex: 1,
                  width: 34,
                  height: 34,
                  borderRadius: 999,
                  background: done ? 'var(--c-success)' : 'var(--c-ink-10)',
                  display: 'grid',
                  placeItems: 'center',
                  color: done ? 'var(--c-white)' : 'var(--muted)',
                  fontSize: 14,
                  fontWeight: 1000,
                  boxShadow: done ? '0 8px 18px rgba(3, 170, 82, 0.18)' : 'none',
                }}
              >
                {idx + 1}
              </div>

              <div
                style={{
                  maxWidth: 74,
                  minHeight: 30,
                  textAlign: 'center',
                  fontSize: 12,
                  lineHeight: 1.18,
                  fontWeight: done ? 900 : 800,
                  color: done ? 'var(--text)' : 'var(--muted)',
                  overflowWrap: 'break-word',
                }}
              >
                {step.label}
              </div>
            </div>
          );
        })}
      </div>
    </Surface>
  );
}

function RecipientOrderCard({ recipient }) {
  const image = recipient?.image || FALLBACK_RECIPIENT_IMAGE;
  const name = recipient?.name || 'Получатель';

  return (
    <Surface
      variant="default"
      style={{
        padding: 14,
        borderRadius: 'var(--r-xl)',
        border: '1px solid var(--border)',
        display: 'grid',
        gridTemplateColumns: '64px minmax(0, 1fr)',
        gap: 13,
        alignItems: 'center',
        boxShadow: '0 14px 36px rgba(13,13,13,0.07)',
      }}
    >
      <AppImage
        src={image}
        alt={name}
        fallback={FALLBACK_RECIPIENT_IMAGE}
        style={{
          width: 64,
          height: 64,
          borderRadius: 20,
          objectFit: 'cover',
          boxShadow: '0 12px 28px rgba(13,13,13,0.14)',
        }}
      />
      <div style={{ minWidth: 0 }}>
        <Text variant="caption" muted>
          Получатель
        </Text>
        <Text variant="title" style={{ marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {name}
        </Text>
      </div>
    </Surface>
  );
}

function OrderItemCard({ item }) {
  const product = item?.product || {};
  const title = product.name || product.title || `Товар #${item?.productId || ''}`;
  const image = product.image || product.images?.[0]?.url || '';
  const qty = Number(item?.quantity || 1);
  const price = Number(item?.price || 0) * qty;

  return (
    <Surface
      variant="default"
      style={{
        padding: 12,
        borderRadius: 'var(--r-lg)',
        border: '1px solid var(--border)',
        display: 'grid',
        gridTemplateColumns: '58px minmax(0, 1fr) auto',
        gap: 12,
        alignItems: 'center',
      }}
    >
      <AppImage
        src={image}
        alt={title}
        style={{ width: 58, height: 58, borderRadius: 14, objectFit: 'cover', background: 'var(--surface-2)' }}
      />
      <div style={{ minWidth: 0 }}>
        <Text variant="subtitle" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {title}
        </Text>
        <Text variant="caption" muted style={{ marginTop: 4 }}>
          Кол-во: {qty}
        </Text>
      </div>
      <div style={{ fontWeight: 1000, color: 'var(--accent)', whiteSpace: 'nowrap' }}>{formatMoney(price)}</div>
    </Surface>
  );
}

function DeliveryPaymentCard({ info, loading, error, busy, message, onPay, onRefresh }) {
  const invoice = info?.invoice || null;
  const order = info?.order || {};
  const delivery = info?.delivery || order;
  const deliveryStatus = String(delivery.status || delivery.deliveryStatus || invoice?.status || '').toUpperCase();
  const invoiceStatus = String(invoice?.status || '').toUpperCase();
  const addressWasUnknown = Boolean(delivery.askRecipientAddress) && delivery.cost == null && delivery.deliveryCost == null;

  let title = 'Доставка';
  let description = 'Информация о доставке обновляется отдельно от оплаты букета.';
  if (deliveryStatus === 'DETAILS_PENDING') {
    description = addressWasUnknown
      ? 'FLOWIE уточняет адрес у получателя. Стоимость доставки ещё не рассчитана и не является бесплатной.'
      : 'FLOWIE уточняет время у получателя. Стоимость доставки уже включена в основной заказ.';
  }
  if (deliveryStatus === 'INCLUDED_IN_MAIN') description = 'Доставка уже включена в основной оплаченный заказ.';
  if (deliveryStatus === 'WAIVED') description = 'Доплата за доставку не требуется — это подтверждено отдельно.';
  if (invoiceStatus === 'PAID' || deliveryStatus === 'PAID') description = 'Доставка оплачена отдельным счётом.';
  if (invoiceStatus === 'EXPIRED') description = invoice.registered
    ? 'Срок счёта истёк. Проверьте предыдущий платёж перед повторной оплатой.'
    : 'Срок счёта истёк. При переходе к оплате срок будет обновлён, сумма останется прежней.';
  if (invoiceStatus === 'CANCELLED') description = 'Отдельный счёт на доставку отменён.';
  if (invoiceStatus === 'RECONCILIATION_REQUIRED') description = 'Платёж за доставку требует проверки менеджером.';
  if (invoiceStatus === 'PAYMENT_PENDING') title = `Доставка — ${formatMoney(invoice.amount)}`;

  return (
    <Surface variant="soft" style={{ padding: 14, borderRadius: 'var(--r-lg)', border: '1px solid var(--border)', display: 'grid', gap: 10 }}>
      <Text variant="title">{title}</Text>
      <Text variant="body" muted>{loading ? 'Проверяем статус доставки...' : description}</Text>
      {(invoiceStatus === 'PAYMENT_PENDING' || (invoiceStatus === 'EXPIRED' && !invoice.registered)) ? (
        <button
          type="button"
          disabled={busy}
          onClick={onPay}
          style={{ height: 48, border: 0, borderRadius: 14, background: '#ef3124', color: '#fff', fontWeight: 1000, cursor: busy ? 'default' : 'pointer' }}
        >
          {busy ? 'Открываем...' : `Оплатить доставку ${formatMoney(invoice.amount)}`}
        </button>
      ) : null}
      {['PAYMENT_PENDING', 'EXPIRED'].includes(invoiceStatus) ? (
        <button type="button" disabled={busy} onClick={onRefresh} style={{ height: 42, borderRadius: 14, border: '1px solid var(--border)', background: 'transparent', fontWeight: 900 }}>
          Проверить оплату доставки
        </button>
      ) : null}
      {message ? <Text variant="caption" style={{ color: 'var(--c-success)' }}>{message}</Text> : null}
      {error ? <Text variant="caption" style={{ color: 'var(--accent)' }}>{error}</Text> : null}
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
  const [gatewayBusy, setGatewayBusy] = useState(false);
  const [gatewayError, setGatewayError] = useState('');
  const [gatewayInfo, setGatewayInfo] = useState('');
  const [deliveryPayment, setDeliveryPayment] = useState(null);
  const [deliveryPaymentLoading, setDeliveryPaymentLoading] = useState(false);
  const [deliveryPaymentBusy, setDeliveryPaymentBusy] = useState(false);
  const [deliveryPaymentError, setDeliveryPaymentError] = useState('');
  const [deliveryPaymentInfo, setDeliveryPaymentInfo] = useState('');

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
  const alfaPayment = payment?.alfa || {};

  const pollRef = useRef(0);
  const deliverySyncInFlight = useRef(false);
  const deliveryReturnChecked = useRef('');

  const loadDeliveryPayment = useCallback(async ({ quiet = false } = {}) => {
    if (!Number.isFinite(orderId) || !isPaidFlow) return null;
    if (!quiet) setDeliveryPaymentLoading(true);
    try {
      const info = await api.getDeliveryPaymentInfo(orderId);
      setDeliveryPayment(info || null);
      setDeliveryPaymentError('');
      return info;
    } catch (e) {
      if (e?.status !== 404) setDeliveryPaymentError(e?.data?.error || e?.message || 'Не удалось загрузить доставку');
      return null;
    } finally {
      if (!quiet) setDeliveryPaymentLoading(false);
    }
  }, [isPaidFlow, orderId]);

  useEffect(() => {
    if (!isPaidFlow) return;
    void loadDeliveryPayment({ quiet: false });
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'hidden') void loadDeliveryPayment({ quiet: true });
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [isPaidFlow, loadDeliveryPayment]);

  const syncDeliveryPayment = useCallback(async ({ quiet = false } = {}) => {
    if (!Number.isFinite(orderId) || deliverySyncInFlight.current) return null;
    deliverySyncInFlight.current = true;
    if (!quiet) {
      setDeliveryPaymentBusy(true);
      setDeliveryPaymentError('');
      setDeliveryPaymentInfo('');
    }
    try {
      const result = await api.syncDeliveryAlfaPayment(orderId);
      await loadDeliveryPayment({ quiet: true });
      if (!quiet) setDeliveryPaymentInfo(result?.paid ? 'Оплата доставки подтверждена' : 'Оплата доставки пока не поступила');
      return result;
    } catch (e) {
      if (!quiet) setDeliveryPaymentError(e?.data?.error || e?.message || 'Не удалось проверить оплату доставки');
      return null;
    } finally {
      deliverySyncInFlight.current = false;
      if (!quiet) setDeliveryPaymentBusy(false);
    }
  }, [loadDeliveryPayment, orderId]);

  const payDelivery = useCallback(async () => {
    if (!Number.isFinite(orderId)) return;
    setDeliveryPaymentBusy(true);
    setDeliveryPaymentError('');
    setDeliveryPaymentInfo('');
    trackAnalytics('payment_start', { orderId });
    try {
      const result = await api.createDeliveryAlfaPayment(orderId);
      if (result?.alreadyPaid) {
        await loadDeliveryPayment({ quiet: true });
        setDeliveryPaymentInfo('Оплата доставки уже подтверждена');
        return;
      }
      if (!result?.formUrl) throw new Error('DELIVERY_PAYMENT_URL_MISSING');
      window.location.assign(result.formUrl);
    } catch (e) {
      setDeliveryPaymentError(e?.data?.error || e?.message || 'Не удалось открыть оплату доставки');
    } finally {
      setDeliveryPaymentBusy(false);
    }
  }, [loadDeliveryPayment, orderId]);

  const deliveryInvoiceId = deliveryPayment?.invoice?.id;
  const deliveryInvoiceStatus = String(deliveryPayment?.invoice?.status || '').toUpperCase();
  const deliveryInvoiceRegistered = Boolean(deliveryPayment?.invoice?.registered);
  useEffect(() => {
    if (!isPaidFlow || !deliveryInvoiceRegistered || !['PAYMENT_PENDING', 'EXPIRED'].includes(deliveryInvoiceStatus)) return undefined;
    const returnResult = new URLSearchParams(window.location.search || '').get('deliveryPayment');
    const returnKey = `${orderId}:${deliveryInvoiceId}:${returnResult}`;
    if (['success', 'failed'].includes(returnResult) && deliveryReturnChecked.current !== returnKey) {
      deliveryReturnChecked.current = returnKey;
      void syncDeliveryPayment({ quiet: false });
    }
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'hidden') void syncDeliveryPayment({ quiet: true });
    }, 6_000);
    return () => window.clearInterval(timer);
  }, [deliveryInvoiceId, deliveryInvoiceStatus, deliveryInvoiceRegistered, isPaidFlow, orderId, syncDeliveryPayment]);

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
  }, [actions, orderId]);

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

  // Do not clear active order on confirmed so card remains visible on home.

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

  const syncAlfaPayment = useCallback(async ({ quiet = false } = {}) => {
    if (!order?.id) return null;
    if (!quiet) {
      setGatewayBusy(true);
      setGatewayError('');
      setGatewayInfo('');
    }
    try {
      const res = await api.syncAlfaPayment(order.id);
      if (res?.paid) {
        setOrder((prev) => ({
          ...(prev || {}),
          ...(res.order || {}),
          paymentStatus: 'CONFIRMED',
        }));
        setGatewayInfo('Оплата подтверждена');
      } else if (res?.retryAllowed) {
        setPayment((prev) => ({
          ...(prev || {}),
          alfa: { ...(prev?.alfa || {}), registered: false },
        }));
        setGatewayInfo('Платёж не прошёл. Можно попробовать снова.');
      } else if (!quiet) {
        setGatewayInfo('Оплата пока не поступила');
      }
      return res;
    } catch (e) {
      if (!quiet) setGatewayError(e?.data?.error || e?.message || 'Не удалось проверить оплату');
      return null;
    } finally {
      if (!quiet) setGatewayBusy(false);
    }
  }, [order?.id]);

  useEffect(() => {
    if (paymentStatus === 'CONFIRMED' || !order?.id || !alfaPayment.registered) return undefined;
    const params = new URLSearchParams(window.location.search || '');
    if (['success', 'failed'].includes(params.get('payment'))) {
      syncAlfaPayment({ quiet: false });
    }
    const t = setInterval(() => syncAlfaPayment({ quiet: true }), 6000);
    return () => clearInterval(t);
  }, [alfaPayment.registered, order?.id, paymentStatus, syncAlfaPayment]);

  if (loading) {
    return (
      <AppShell style={{ '--app-shell-bottom-space': '0px', '--app-content-inset-bottom': '0px' }}>
        <Text variant="title">Оплата</Text>
        <div style={{ marginTop: 'var(--sp-6)' }}>
          <Surface variant="soft" style={{ padding: 16, borderRadius: 'var(--r-lg)', border: '1px solid var(--border)', background: 'var(--bg)' }}>
            <Text variant="subtitle">Загрузка...</Text>
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

  // If payment is already confirmed, show order status.
  if (isPaidFlow) {
    const current = normalizeProgressStatus(order?.status, order?.paymentStatus);
    const deliveredAt = order?.deliveredAt ? new Date(order.deliveredAt) : null;
    const deliveredStr = deliveredAt ? deliveredAt.toLocaleString('ru-RU', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'long' }) : null;
    const canCancel = !['DELIVERED', 'CANCELLED'].includes(current);
    const orderRecipient = (state.recipients.items || []).find(
      (r) => String(r?.name || '').trim().toLowerCase() === String(order?.recipientName || '').trim().toLowerCase()
    ) || { name: order?.recipientName || 'Получатель', image: FALLBACK_RECIPIENT_IMAGE };

    return (
      <AppShell style={{ '--app-shell-bottom-space': '0px', '--app-shell-extra-bottom': '0px', '--app-content-inset-bottom': '0px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <IconButton onClick={() => navigate(-1)} aria-label="Назад">
            <ChevronLeft size={22} />
          </IconButton>
          <Text variant="title">Заказ #{order?.id}</Text>
        </div>

        <div style={{ marginTop: 16 }}>
          <OrderStatusTimeline current={current} />
        </div>

        <div style={{ marginTop: 16 }}>
          <RecipientOrderCard recipient={orderRecipient} />
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
          <Text variant="subtitle">Состав заказа</Text>
          <div style={{ marginTop: 10, display: 'grid', gap: 10 }}>
            {(order?.items || []).map((it) => (
              <OrderItemCard key={it.id} item={it} />
            ))}
          </div>
          <div style={{ marginTop: 10, fontWeight: 1000, fontSize: 18 }}>Итого: {formatMoney(amount)}</div>
        </div>

        {(deliveryPaymentLoading || deliveryPayment || deliveryPaymentError || order?.deliveryStatus) ? (
          <div style={{ marginTop: 16 }}>
            <DeliveryPaymentCard
              info={deliveryPayment || { order }}
              loading={deliveryPaymentLoading}
              error={deliveryPaymentError}
              busy={deliveryPaymentBusy}
              message={deliveryPaymentInfo}
              onPay={payDelivery}
              onRefresh={() => syncDeliveryPayment({ quiet: false })}
            />
          </div>
        ) : null}

        {deliveredStr ? (
          <div style={{ marginTop: 16 }}>
            <Text variant="body" muted>Доставлено: {deliveredStr}</Text>
          </div>
        ) : null}

        {canCancel ? (
        <div style={{ marginTop: 20 }}>
          {cancelConfirm ? (
            <Surface variant="soft" style={{ padding: 12, borderRadius: 'var(--r-lg)', border: '1px solid var(--border)' }}>
              <Text variant="subtitle">Отменить заказ?</Text>
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
                  {cancelling ? 'Отменяем...' : 'Отменить заказ'}
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
        ) : null}
      </AppShell>
    );
  }

  const payWithAlfa = async () => {
    if (!order?.id) return;
    if (!alfaPayment.enabled) {
      setGatewayError('Оплата по СБП через Альфа-Банк не настроена');
      return;
    }
    setGatewayBusy(true);
    setGatewayError('');
    setGatewayInfo('');
    trackAnalytics('payment_start', { orderId: order.id });
    try {
      const res = await api.createAlfaPayment(order.id);
      if (res?.alreadyPaid) {
        setOrder((prev) => ({ ...(prev || {}), paymentStatus: 'CONFIRMED' }));
        return;
      }
      if (!res?.formUrl) throw new Error('ALFA_PAYMENT_URL_MISSING');
      window.location.assign(res.formUrl);
    } catch (e) {
      setGatewayError(e?.data?.error || e?.message || 'Не удалось открыть оплату по СБП');
    } finally {
      setGatewayBusy(false);
    }
  };

  // Payment screen
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
          К оплате {formatMoney(amount)}
        </Text>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span className="ui-chip">
            <Clock size={14} />
            {remainingMs > 0 ? `Осталось ${fmtMmSs(remainingMs)}` : 'Время вышло'}
          </span>
          {paymentStatus === 'CONFIRMED' ? (
            <span className="ui-chip ui-chip--success">Оплата подтверждена</span>
          ) : (
            <span className="ui-chip ui-chip--accent">Ждём подтверждение</span>
          )}
          {copied ? <span className="ui-chip">Скопировано</span> : null}
        </div>
      </div>

      <div style={{ marginTop: 'var(--sp-6)', display: 'grid', gap: 12 }}>
        <Row
          icon={<CreditCard size={20} />}
          label="Способ оплаты"
          value="СБП через Альфа-Банк"
          onCopy={async () => {
            const ok = await copyToClipboard('Альфа-Банк');
            if (ok) setCopied('alfa');
          }}
        />
        <Row
          icon={<div style={{ fontWeight: 1000 }}>₽</div>}
          label="Сумма заказа"
          value={formatMoney(amount)}
          onCopy={async () => {
            const ok = await copyToClipboard(String(amount || ''));
            if (ok) setCopied('amount');
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
              color: 'var(--c-accent-contrast)',
              fontWeight: 1000,
              cursor: 'pointer',
            }}
          >
            К заказу
          </button>
        ) : remainingMs <= 0 ? (
          <Surface variant="soft" style={{ padding: 14, borderRadius: 'var(--r-lg)', border: '1px solid var(--border)', background: 'var(--bg)' }}>
            <Text variant="body" muted>
              Время на оплату истекло. Пожалуйста, создайте новый заказ.
            </Text>
          </Surface>
        ) : (
          <>
            <button
              type="button"
              disabled={gatewayBusy || !alfaPayment.enabled}
              onClick={payWithAlfa}
              style={{
                height: 54,
                borderRadius: 'var(--r-lg)',
                border: 0,
                background: '#ef3124',
                color: '#fff',
                fontWeight: 1000,
                cursor: gatewayBusy ? 'default' : 'pointer',
                opacity: !alfaPayment.enabled ? 0.58 : 1,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              <ExternalLink size={18} />
              {gatewayBusy ? 'Открываем СБП...' : 'Оплатить по СБП'}
            </button>
            <button
              type="button"
              disabled={gatewayBusy}
              onClick={() => syncAlfaPayment({ quiet: false })}
              style={{
                height: 48,
                borderRadius: 'var(--r-lg)',
                border: '1px solid var(--border)',
                background: 'transparent',
                fontWeight: 900,
                cursor: gatewayBusy ? 'default' : 'pointer',
              }}
            >
              Проверить оплату
            </button>
            <Surface variant="soft" style={{ padding: 14, borderRadius: 'var(--r-lg)', border: '1px solid var(--border)', background: 'var(--bg)' }}>
              <Text variant="body" muted>
                После оплаты банк вернёт вас к заказу, а статус обновится автоматически.
              </Text>
              {gatewayInfo ? (
                <div style={{ marginTop: 6 }}>
                  <Text variant="caption" style={{ color: 'var(--c-success)' }}>
                    {gatewayInfo}
                  </Text>
                </div>
              ) : null}
              {gatewayError ? (
                <div style={{ marginTop: 6 }}>
                  <Text variant="caption" style={{ color: 'var(--c-accent)' }}>
                    {gatewayError}
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
