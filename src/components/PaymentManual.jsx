import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Copy, ChevronLeft, Clock } from 'lucide-react';
import { api } from '../api';
import { useAppState } from '../state/AppState';
import { buildActiveOrderPreview } from '../lib/orderPreview';
import { formatMoney } from '../lib/money';
import { AppShell } from './layout/AppShell';
import { IconButton } from './ui/IconButton';
import { Surface } from './ui/Surface';
import { Text } from './ui/Text';
import { AppImage } from './ui/AppImage';

const FALLBACK_RECIPIENT_IMAGE = '/vivienne-avatar.jpeg';

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
        aria-label="Copy"
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
  { key: 'ACCEPTED', label: 'Accepted' },
  { key: 'ASSEMBLED', label: 'Packed' },
  { key: 'IN_DELIVERY', label: 'On the way' },
  { key: 'DELIVERED', label: 'Delivered' },
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
  const isVivienne =
    String(recipient?.name || '').trim().toLowerCase() === 'vivienne' ||
    String(recipient?.id || '') === '2' ||
    String(recipient?.id || '') === '2002';
  const image = isVivienne ? FALLBACK_RECIPIENT_IMAGE : recipient?.image || FALLBACK_RECIPIENT_IMAGE;
  const name = isVivienne ? 'Vivienne' : recipient?.name || 'Recipient';

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
          Recipient
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
  const title = product.name || product.title || `Item #${item?.productId || ''}`;
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
          Qty {qty}
        </Text>
      </div>
      <div style={{ fontWeight: 1000, color: 'var(--accent)', whiteSpace: 'nowrap' }}>{formatMoney(price)}</div>
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
      setError('Invalid order');
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
        setError(e?.data?.error || e?.message || 'Could not load payment');
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

  if (loading) {
    return (
      <AppShell style={{ '--app-shell-bottom-space': '0px', '--app-content-inset-bottom': '0px' }}>
        <Text variant="title">Payment</Text>
        <div style={{ marginTop: 'var(--sp-6)' }}>
          <Surface variant="soft" style={{ padding: 16, borderRadius: 'var(--r-lg)', border: '1px solid var(--border)', background: 'var(--bg)' }}>
            <Text variant="subtitle">Loading...</Text>
          </Surface>
        </div>
      </AppShell>
    );
  }

  if (error) {
    return (
      <AppShell style={{ '--app-shell-bottom-space': '0px', '--app-content-inset-bottom': '0px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <IconButton onClick={() => navigate(-1)} aria-label="Back">
            <ChevronLeft size={22} />
          </IconButton>
          <Text variant="title">Payment</Text>
        </div>
        <div style={{ marginTop: 'var(--sp-6)' }}>
          <Surface variant="soft" style={{ padding: 16, borderRadius: 'var(--r-lg)', border: '1px solid var(--border)', background: 'var(--bg)' }}>
            <Text variant="subtitle">Error</Text>
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
    const deliveredStr = deliveredAt ? deliveredAt.toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'long' }) : null;
    const canCancel = !['DELIVERED', 'CANCELLED'].includes(current);
    const orderRecipient = (state.recipients.items || []).find(
      (r) => String(r?.name || '').trim().toLowerCase() === String(order?.recipientName || '').trim().toLowerCase()
    ) || { name: order?.recipientName || 'Recipient', image: FALLBACK_RECIPIENT_IMAGE };

    return (
      <AppShell style={{ '--app-shell-bottom-space': '0px', '--app-shell-extra-bottom': '0px', '--app-content-inset-bottom': '0px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <IconButton onClick={() => navigate(-1)} aria-label="Back">
            <ChevronLeft size={22} />
          </IconButton>
          <Text variant="title">Order #{order?.id}</Text>
        </div>

        <div style={{ marginTop: 16 }}>
          <OrderStatusTimeline current={current} />
        </div>

        <div style={{ marginTop: 16 }}>
          <RecipientOrderCard recipient={orderRecipient} />
        </div>

        {order?.floristComment ? (
          <div style={{ marginTop: 16 }}>
            <Text variant="subtitle">Comment</Text>
            <Surface variant="soft" style={{ marginTop: 8, padding: 12, borderRadius: 'var(--r-lg)', border: '1px solid var(--border)' }}>
              <Text variant="body">{order.floristComment}</Text>
            </Surface>
          </div>
        ) : null}

        <div style={{ marginTop: 16 }}>
          <Text variant="subtitle">Items</Text>
          <div style={{ marginTop: 10, display: 'grid', gap: 10 }}>
            {(order?.items || []).map((it) => (
              <OrderItemCard key={it.id} item={it} />
            ))}
          </div>
          <div style={{ marginTop: 10, fontWeight: 1000, fontSize: 18 }}>Total: {formatMoney(amount)}</div>
        </div>

        {deliveredStr ? (
          <div style={{ marginTop: 16 }}>
            <Text variant="body" muted>Delivered {deliveredStr}</Text>
          </div>
        ) : null}

        {canCancel ? (
        <div style={{ marginTop: 20 }}>
          {cancelConfirm ? (
            <Surface variant="soft" style={{ padding: 12, borderRadius: 'var(--r-lg)', border: '1px solid var(--border)' }}>
              <Text variant="subtitle">Cancel this order?</Text>
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
                      setCancelError(e?.data?.error || e?.message || 'Could not cancel');
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
                  {cancelling ? 'Cancelling...' : 'Cancel order'}
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
                  Keep
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
              Cancel
            </button>
          )}
        </div>
        ) : null}
      </AppShell>
    );
  }

  // Payment screen
  return (
    <AppShell style={{ '--app-shell-bottom-space': '0px', '--app-shell-extra-bottom': '0px', '--app-content-inset-bottom': '0px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <IconButton onClick={() => navigate(-1)} aria-label="Back">
          <ChevronLeft size={22} />
        </IconButton>
        <Text variant="title">Payment</Text>
      </div>

      <div style={{ marginTop: 'var(--sp-6)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <Text variant="title" style={{ fontSize: 24 }}>
          Pay {formatMoney(amount)}
        </Text>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span className="ui-chip">
            <Clock size={14} />
            {remainingMs > 0 ? `Left ${fmtMmSs(remainingMs)}` : 'Time expired'}
          </span>
          {paymentStatus === 'CONFIRMED' ? (
            <span className="ui-chip ui-chip--success">Payment confirmed</span>
          ) : (
            <span className="ui-chip ui-chip--accent">Waiting for confirmation</span>
          )}
          {copied ? <span className="ui-chip">Copied</span> : null}
        </div>
      </div>

      <div style={{ marginTop: 'var(--sp-6)', display: 'grid', gap: 12 }}>
        <Row
          icon={<div style={{ width: 18, height: 12, border: '2px solid currentColor', borderRadius: 4 }} />}
          label="Payment details"
          value={payment?.cardNumber || '—'}
          onCopy={async () => {
            const ok = await copyToClipboard(payment?.cardNumber || '');
            if (ok) setCopied('card');
          }}
        />
        <Row
          icon={<div style={{ fontWeight: 1000 }}>$</div>}
          label="Payment amount"
          value={formatMoney(amount)}
          onCopy={async () => {
            const ok = await copyToClipboard(String(amount || ''));
            if (ok) setCopied('amount');
          }}
        />
        <Row
          icon={<div style={{ width: 18, height: 18, borderRadius: 999, border: '2px solid currentColor' }} />}
          label="Recipient"
          value={payment?.receiverName || '—'}
          onCopy={async () => {
            const ok = await copyToClipboard(payment?.receiverName || '');
            if (ok) setCopied('receiver');
          }}
        />
        <Row
          icon={<div style={{ width: 18, height: 14, border: '2px solid currentColor', borderRadius: 4 }} />}
          label="Recipient bank"
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
            To order
          </button>
        ) : remainingMs <= 0 ? (
          <Surface variant="soft" style={{ padding: 14, borderRadius: 'var(--r-lg)', border: '1px solid var(--border)', background: 'var(--bg)' }}>
            <Text variant="body" muted>
              Payment time expired. Please create a new order.
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
                  actions.clearActiveOrder(); // hide FAB
                  setConfirmDone(true);
                  setOrder((prev) => ({
                    ...(prev || {}),
                    paymentClientConfirmed: true,
                    paymentStatus: res?.order?.paymentStatus || prev?.paymentStatus,
                  }));
                  navigate('/'); // show the card on home without FAB
                } catch (e) {
                  setConfirmError(e?.data?.error || e?.message || 'Could not send confirmation');
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
              {confirming ? 'Sending...' : 'Confirm payment'}
            </button>
            <Surface variant="soft" style={{ padding: 14, borderRadius: 'var(--r-lg)', border: '1px solid var(--border)', background: 'var(--bg)' }}>
              <Text variant="body" muted>
                We will confirm payment after the transfer arrives. This page updates automatically.
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
