import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, Copy, MapPin, MessageSquare, X } from 'lucide-react';
import { adminApi } from '../lib/adminApi';
import { SquareCropModal } from '../components/SquareCropModal';
import { Surface } from '../../src/components/ui/Surface';
import { Text } from '../../src/components/ui/Text';
import { AppImage } from '../../src/components/ui/AppImage';

function normalizeStatus(s) {
  const v = String(s || '').toUpperCase();
  if (v === 'PAID') return 'NEW';
  if (v === 'PAYMENT_PENDING') return 'NEW';
  if (v === 'DELIVERY') return 'IN_DELIVERY';
  if (v === 'COMPLETED') return 'DELIVERED';
  return v || 'NEW';
}

function statusMeta(status) {
  const s = normalizeStatus(status);
  if (s === 'NEW') return { label: 'Новый', color: 'var(--accent)' };
  if (s === 'ACCEPTED') return { label: 'Принят', color: 'var(--text)' };
  if (s === 'ASSEMBLED') return { label: 'Собран', color: 'var(--text)' };
  if (s === 'IN_DELIVERY') return { label: 'Доставляется', color: 'var(--success)' };
  if (s === 'DELIVERED') return { label: 'Завершен', color: 'var(--muted)' };
  if (s === 'CANCELLED') return { label: 'Отменен', color: '#d92d20' };
  return { label: s, color: 'var(--text)' };
}

function paymentMeta(paymentStatus) {
  const ps = String(paymentStatus || '').toUpperCase();
  if (ps === 'PENDING') return { label: 'Ожидает оплаты', color: 'var(--accent)' };
  if (ps === 'CONFIRMED') return { label: 'Оплачено', color: 'var(--success)' };
  if (ps === 'EXPIRED') return { label: 'Просрочен', color: '#d92d20' };
  return { label: ps || '—', color: 'var(--text)' };
}

function deliveryMeta(status, invoiceStatus) {
  const value = String(invoiceStatus || status || '').toUpperCase();
  if (value === 'DETAILS_PENDING') return { label: 'Нужно уточнить данные', color: 'var(--accent)', tone: 'pending' };
  if (value === 'PAYMENT_PENDING') return { label: 'Счёт доставки ожидает оплаты', color: 'var(--accent)', tone: 'pending' };
  if (value === 'PAID') return { label: 'Доставка оплачена отдельно', color: 'var(--success)', tone: 'ready' };
  if (value === 'INCLUDED_IN_MAIN') return { label: 'Доставка в основном счёте', color: 'var(--success)', tone: 'ready' };
  if (value === 'WAIVED') return { label: 'Стоимость доставки обнулена сотрудником', color: 'var(--success)', tone: 'ready' };
  if (value === 'NOT_REQUIRED') return { label: 'Отдельная оплата не требуется', color: 'var(--muted)', tone: 'ready' };
  if (value === 'EXPIRED') return { label: 'Счёт доставки просрочен', color: '#d92d20', tone: 'blocked' };
  if (value === 'CANCELLED') return { label: 'Счёт доставки отменён', color: '#d92d20', tone: 'blocked' };
  if (value === 'RECONCILIATION_REQUIRED') return { label: 'Нужна сверка оплаты доставки', color: '#d92d20', tone: 'blocked' };
  return { label: 'Статус доставки не определён', color: 'var(--muted)', tone: 'pending' };
}

function newQuoteKey() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function money(value) {
  return `${new Intl.NumberFormat('ru-RU').format(Number(value || 0))} ₽`;
}

const fieldStyle = {
  width: '100%',
  border: '1px solid var(--border)',
  borderRadius: 16,
  padding: 12,
  background: 'var(--c-white)',
  color: 'var(--text)',
};

function yandexMapsUrl(address) {
  const q = encodeURIComponent(String(address || '').trim());
  return `https://yandex.ru/maps/?text=${q}`;
}

function Divider() {
  return <div style={{ height: 1, background: 'var(--c-ink-06)', margin: 'var(--sp-6) 0' }} />;
}

function PrimaryButton({ label, onClick, disabled, style }) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{
        height: 46,
        borderRadius: 'var(--r-lg)',
        border: 0,
        background: disabled ? 'var(--c-ink-10)' : 'var(--text)',
        color: 'var(--c-white)',
        fontWeight: 1000,
        cursor: disabled ? 'default' : 'pointer',
        padding: '0 14px',
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {label}
    </button>
  );
}

function SecondaryButton({ label, onClick, disabled, style, children }) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{
        height: 46,
        borderRadius: 'var(--r-lg)',
        border: '1px solid var(--border)',
        background: 'transparent',
        color: 'var(--text)',
        fontWeight: 1000,
        cursor: disabled ? 'default' : 'pointer',
        padding: '0 14px',
        whiteSpace: 'nowrap',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        ...style,
      }}
    >
      {children || label}
    </button>
  );
}

function DangerButton({ label, onClick, disabled, style }) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{
        height: 52,
        width: '100%',
        borderRadius: 'var(--r-lg)',
        border: 0,
        background: disabled ? 'rgba(217,45,32,0.35)' : '#d92d20',
        color: 'var(--c-white)',
        fontWeight: 1000,
        cursor: disabled ? 'default' : 'pointer',
        padding: '0 16px',
        ...style,
      }}
    >
      {label}
    </button>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.32)',
          zIndex: 90,
        }}
      />
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 100,
          display: 'grid',
          placeItems: 'center',
          padding:
            'calc(var(--sp-4) + var(--app-inset-top)) calc(var(--sp-4) + var(--app-inset-right)) calc(var(--sp-4) + var(--app-inset-bottom)) calc(var(--sp-4) + var(--app-inset-left))',
          pointerEvents: 'none',
        }}
      >
        <div style={{ width: 'min(100%, var(--app-max))', pointerEvents: 'auto' }}>
          <Surface
            variant="soft"
            style={{ padding: 16, borderRadius: 'var(--r-lg)', boxShadow: 'var(--shadow-2)', border: '1px solid var(--border)' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
              <Text variant="subtitle">{title}</Text>
              <button
                type="button"
                onClick={onClose}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 'var(--r-pill)',
                  border: '1px solid var(--border)',
                  background: 'transparent',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                aria-label="Закрыть"
              >
                <X size={16} />
              </button>
            </div>
            <div style={{ marginTop: 12 }}>{children}</div>
          </Surface>
        </div>
      </div>
    </>
  );
}

export function OrderDetailsPage({ user }) {
  const navigate = useNavigate();
  const params = useParams();
  const role = String(user?.role || '');
  const canConfirmPayment = role === 'admin' || role === 'moderator';
  const canPrepare = canConfirmPayment || role === 'florist';
  const canComplete = canConfirmPayment || role === 'courier';
  const canManageOrder = canConfirmPayment;
  const orderId = Number(params.id);

  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [order, setOrder] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState('');

  const [deliveryOpen, setDeliveryOpen] = useState(false);
  const [deliveryForm, setDeliveryForm] = useState({ quoteKey: '', deliveryAddress: '', deliveryTime: '', amount: '' });
  const [deliveryBusy, setDeliveryBusy] = useState(false);
  const [deliveryError, setDeliveryError] = useState('');

  const [historyOpen, setHistoryOpen] = useState(false);

  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelSlide, setCancelSlide] = useState(0);

  const [promoOpen, setPromoOpen] = useState(false);
  const [promo, setPromo] = useState({ code: '', amount: '', expiresAt: '' });

  const fileRef = useRef(null);
  const pendingCropRef = useRef(null); // { file, objectUrl }
  const [cropOpen, setCropOpen] = useState(false);
  const [cropSrc, setCropSrc] = useState('');

  async function load() {
    setBusy(true);
    setError('');
    try {
      const res = await adminApi.getOrder(orderId);
      setOrder(res?.order || null);
    } catch (e) {
      setOrder(null);
      setError(e?.data?.error || e?.message || 'Не удалось загрузить заказ');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!Number.isFinite(orderId)) return;
    load();
  }, [orderId]);

  const status = useMemo(() => normalizeStatus(order?.status), [order?.status]);
  const st = useMemo(() => statusMeta(status), [status]);
  const paymentMetaInfo = useMemo(() => paymentMeta(order?.paymentStatus), [order?.paymentStatus]);

  const customerName = useMemo(() => {
    const u = order?.user;
    if (!u) return '—';
    return u.name || u.phone || `Клиент #${u.id}`;
  }, [order?.user]);
  const customerPhone = useMemo(() => order?.user?.phone || 'Телефон не указан', [order?.user?.phone]);

  const address = useMemo(() => order?.deliveryAddress || '', [order?.deliveryAddress]);
  const addressWasUnknown = Boolean(order?.askRecipientAddress);
  const addressPending = addressWasUnknown && !String(order?.deliveryAddress || '').trim();
  const timePending = Boolean(order?.askRecipientTime) && !String(order?.deliveryTime || '').trim();
  const deliveryInfo = useMemo(
    () => deliveryMeta(order?.deliveryStatus, order?.deliveryInvoice?.status),
    [order?.deliveryStatus, order?.deliveryInvoice?.status],
  );
  const deliveryReady = useMemo(() => {
    const value = String(order?.deliveryStatus || 'NOT_REQUIRED').toUpperCase();
    const statusReady = ['PAID', 'WAIVED', 'INCLUDED_IN_MAIN', 'NOT_REQUIRED'].includes(value);
    const hasAddress = Boolean(String(order?.deliveryAddress || '').trim());
    const hasRequestedTime = !order?.askRecipientTime || Boolean(String(order?.deliveryTime || '').trim());
    return statusReady && hasAddress && hasRequestedTime;
  }, [order?.askRecipientTime, order?.deliveryAddress, order?.deliveryStatus, order?.deliveryTime]);

  const topAction = useMemo(() => {
    if (!order) return null;
    if (status === 'NEW' && canPrepare && String(order.paymentStatus || '').toUpperCase() === 'CONFIRMED') return { type: 'accept' };
    if (status === 'ACCEPTED' && canPrepare) return { type: 'accepted' };
    if (status === 'ASSEMBLED' && canPrepare) return { type: 'dispatch' };
    if (status === 'IN_DELIVERY' && canComplete) return { type: 'complete' };
    return { type: 'none' };
  }, [order, status, canPrepare, canComplete]);

  async function confirmPayment() {
    if (!orderId) return;
    setConfirming(true);
    setConfirmError('');
    try {
      await adminApi.confirmOrderPayment(orderId);
      await load();
    } catch (e) {
      setConfirmError(e?.data?.error || e?.message || 'Не удалось подтвердить оплату');
    } finally {
      setConfirming(false);
    }
  }

  function openDeliveryForm() {
    setDeliveryError('');
    setDeliveryForm({
      quoteKey: newQuoteKey(),
      deliveryAddress: String(order?.deliveryAddress || ''),
      deliveryTime: String(order?.deliveryTime || ''),
      amount: order?.deliveryCost == null ? '' : String(order.deliveryCost),
    });
    setDeliveryOpen(true);
  }

  async function submitDeliveryQuote() {
    const deliveryAddress = String(deliveryForm.deliveryAddress || '').trim();
    const deliveryTime = String(deliveryForm.deliveryTime || '').trim();
    const amount = deliveryForm.amount === '' ? null : Number(deliveryForm.amount);
    if (addressPending && !deliveryAddress) {
      setDeliveryError('Укажите уточнённый адрес');
      return;
    }
    if (timePending && !deliveryTime) {
      setDeliveryError('Укажите уточнённое время');
      return;
    }
    if (addressWasUnknown && (!Number.isSafeInteger(amount) || amount < 0)) {
      setDeliveryError('Укажите стоимость доставки целым числом от 0 ₽');
      return;
    }

    const payload = { quoteKey: deliveryForm.quoteKey };
    if (addressWasUnknown || addressPending) payload.deliveryAddress = deliveryAddress;
    if (order?.askRecipientTime) payload.deliveryTime = deliveryTime;
    if (addressWasUnknown) payload.amount = amount;

    setDeliveryBusy(true);
    setDeliveryError('');
    try {
      const response = await adminApi.quoteOrderDelivery(orderId, payload);
      setOrder((current) => ({
        ...current,
        ...(response?.order || {}),
        deliveryInvoice: response?.invoice ?? current?.deliveryInvoice ?? null,
      }));
      setDeliveryOpen(false);
    } catch (e) {
      setDeliveryError(e?.data?.error || e?.message || 'Не удалось сохранить данные доставки');
    } finally {
      setDeliveryBusy(false);
    }
  }

  return (
    <div style={{ paddingBottom: 0 }}>
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 20,
          background: 'linear-gradient(to bottom, rgba(246,242,238,0.98), rgba(246,242,238,0.92))',
          backdropFilter: 'blur(10px)',
          padding: 'var(--sp-4)',
          borderBottom: '1px solid var(--c-ink-06)',
        }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: '36px 1fr 36px', alignItems: 'center', gap: 10 }}>
          <button
            type="button"
            onClick={() => navigate(-1)}
            aria-label="Назад"
            className="ui-iconButton"
            style={{ background: 'var(--surface)' }}
          >
            <ChevronLeft size={22} />
          </button>
          <div style={{ textAlign: 'center', fontWeight: 1000, fontSize: 16 }}>Заказ № {Number.isFinite(orderId) ? orderId : '—'}</div>
          <div />
        </div>
      </div>

      {busy ? (
        <div style={{ marginTop: 16 }}>
          <Surface variant="soft" style={{ padding: 16, borderRadius: 'var(--r-lg)', border: '1px solid var(--border)' }}>
            <Text variant="subtitle">Загружаем…</Text>
          </Surface>
        </div>
      ) : error ? (
        <div style={{ marginTop: 16 }}>
          <Surface variant="soft" style={{ padding: 16, borderRadius: 'var(--r-lg)', border: '1px solid var(--border)' }}>
            <Text variant="subtitle">Ошибка</Text>
            <div style={{ marginTop: 6 }}>
              <Text variant="body" muted>
                {error}
              </Text>
            </div>
          </Surface>
        </div>
      ) : !order ? (
        <div style={{ marginTop: 16 }}>
          <Surface variant="soft" style={{ padding: 16, borderRadius: 'var(--r-lg)', border: '1px solid var(--border)' }}>
            <Text variant="subtitle">Не найдено</Text>
          </Surface>
        </div>
      ) : (
        <>
          <div style={{ marginTop: 14, fontSize: 13, fontWeight: 1000, color: st.color }}>{st.label}</div>
          <div style={{ marginTop: 8, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="ui-chip" style={{ background: 'var(--surface-2)', color: paymentMetaInfo.color }}>
              Основной счёт: {paymentMetaInfo.label.toLowerCase()}
            </span>
            <span className="ui-chip">Клиент отметил: {order.paymentClientConfirmed ? 'да' : 'нет'}</span>
            {canConfirmPayment && String(order.paymentStatus || '').toUpperCase() === 'PENDING' ? (
              <>
                <PrimaryButton
                  label={confirming ? 'Подтверждаем…' : 'Подтвердить оплату'}
                  disabled={confirming}
                  onClick={confirmPayment}
                  style={{ height: 34 }}
                />
              </>
            ) : null}
            {confirmError ? (
              <Text variant="caption" style={{ color: '#d92d20' }}>
                {confirmError}
              </Text>
            ) : null}
          </div>

          {topAction?.type === 'accept' ? (
            <div style={{ marginTop: 12 }}>
              <Surface variant="soft" style={{ padding: 14, borderRadius: 'var(--r-lg)', border: '1px solid var(--border)' }}>
                <Text variant="subtitle">Новый заказ</Text>
                <div style={{ marginTop: 10 }}>
                  <PrimaryButton
                    label="Принять заказ"
                    onClick={async () => {
                      try {
                        await adminApi.acceptOrder(orderId);
                        await load();
                      } catch (e) {
                        alert(e?.data?.error || e?.message || 'Не удалось принять');
                      }
                    }}
                  />
                </div>
              </Surface>
            </div>
          ) : null}

          {topAction?.type === 'accepted' ? (
            <div style={{ marginTop: 12 }}>
              <Surface variant="soft" style={{ padding: 14, borderRadius: 'var(--r-lg)', border: '1px solid var(--border)' }}>
                <Text variant="subtitle">Заказ принят</Text>
                <div style={{ marginTop: 6 }}>
                  <Text variant="body" muted>
                    Загрузите фото букета, после загрузки заказ станет «Собран».
                  </Text>
                </div>
                <div style={{ marginTop: 10 }}>
                  <PrimaryButton label="Загрузить фото" onClick={() => fileRef.current?.click?.()} />
                </div>
              </Surface>
            </div>
          ) : null}

          {topAction?.type === 'dispatch' ? (
            <div style={{ marginTop: 12 }}>
              <Surface variant="soft" style={{ padding: 14, borderRadius: 'var(--r-lg)', border: '1px solid var(--border)' }}>
                <Text variant="subtitle">Букет собран</Text>
                {!deliveryReady ? (
                  <div style={{ marginTop: 6 }}>
                    <Text variant="body" style={{ color: '#d92d20' }}>
                      Нельзя передать в доставку: сначала уточните адрес/время и завершите оплату доставки.
                    </Text>
                  </div>
                ) : null}
                <div style={{ marginTop: 10 }}>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <PrimaryButton
                      label="Отвезу сам"
                      disabled={!deliveryReady}
                      onClick={async () => {
                        try {
                          await adminApi.dispatchOrder(orderId);
                          await load();
                        } catch (e) {
                          alert(e?.data?.error || e?.message || 'Не удалось отправить в доставку');
                        }
                      }}
                    />
                    <PrimaryButton
                      label="Назначить курьера"
                      disabled={!deliveryReady}
                      onClick={async () => {
                        const val = window.prompt('ID курьера');
                        const idNum = Number(val);
                        if (!Number.isFinite(idNum)) return;
                        try {
                          await adminApi.dispatchOrder(orderId, idNum);
                          await load();
                        } catch (e) {
                          alert(e?.data?.error || e?.message || 'Не удалось назначить курьера');
                        }
                      }}
                      style={{ background: 'var(--text)' }}
                    />
                  </div>
                </div>
              </Surface>
            </div>
          ) : null}

          {topAction?.type === 'complete' ? (
            <div style={{ marginTop: 12 }}>
              <Surface variant="soft" style={{ padding: 14, borderRadius: 'var(--r-lg)', border: '1px solid var(--border)' }}>
                <Text variant="subtitle">Заказ в доставке</Text>
                <div style={{ marginTop: 10 }}>
                  <PrimaryButton
                    label="Завершить заказ"
                    onClick={async () => {
                      try {
                        await adminApi.completeOrder(orderId);
                        await load();
                      } catch (e) {
                        alert(e?.data?.error || e?.message || 'Не удалось завершить');
                      }
                    }}
                  />
                </div>
              </Surface>
            </div>
          ) : null}

          <Divider />

          <Surface variant="soft" style={{ padding: 16, borderRadius: 'var(--r-lg)', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
              <Text variant="subtitle">Информация</Text>
              <SecondaryButton
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(String(orderId));
                  } catch {
                    // ignore
                  }
                }}
                style={{ height: 40, borderRadius: 'var(--r-pill)' }}
              >
                <Copy size={16} />
                Копировать
              </SecondaryButton>
            </div>
            <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontWeight: 900 }}>
                <span style={{ color: 'var(--muted)' }}>Создан</span>
                <span style={{ whiteSpace: 'nowrap' }}>{order.createdAt ? new Date(order.createdAt).toLocaleString('ru-RU') : '—'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontWeight: 900 }}>
                <span style={{ color: 'var(--muted)' }}>Основной счёт</span>
                <span style={{ whiteSpace: 'nowrap' }}>{money(order.totalPrice)} · {paymentMetaInfo.label}</span>
              </div>
            </div>
          </Surface>

          <Divider />

          <Surface variant="soft" style={{ padding: 16, borderRadius: 'var(--r-lg)', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
              <div>
                <Text variant="subtitle">Доставка</Text>
                <div style={{ marginTop: 6 }}>
                  <span className="ui-chip" style={{ color: deliveryInfo.color, background: 'var(--surface-2)' }}>
                    {deliveryInfo.label}
                  </span>
                </div>
              </div>
              {canPrepare && String(order.paymentStatus || '').toUpperCase() === 'CONFIRMED' && (addressPending || timePending) ? (
                <SecondaryButton label="Уточнить" onClick={openDeliveryForm} style={{ height: 38 }} />
              ) : null}
            </div>
            <div style={{ marginTop: 10, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <MapPin size={16} color="var(--muted)" style={{ marginTop: 2, flexShrink: 0 }} />
              <div style={{ minWidth: 0 }}>
                <Text variant="body" muted>
                  {address || (order.askRecipientAddress ? 'Ожидаем адрес от получателя' : 'Адрес не указан')}
                </Text>
                {order.deliveryTime ? (
                  <div style={{ marginTop: 6 }}>
                    <Text variant="caption">Время: {order.deliveryTime}</Text>
                  </div>
                ) : order.askRecipientTime ? (
                  <div style={{ marginTop: 6 }}><Text variant="caption">Ожидаем время от получателя</Text></div>
                ) : null}
              </div>
            </div>

            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--c-ink-06)', display: 'grid', gap: 8 }}>
              {order.deliveryCost == null ? (
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontWeight: 900 }}>
                  <span style={{ color: 'var(--muted)' }}>Стоимость доставки</span>
                  <span style={{ color: 'var(--accent)' }}>Ещё не рассчитана</span>
                </div>
              ) : (
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontWeight: 900 }}>
                  <span style={{ color: 'var(--muted)' }}>
                    {addressWasUnknown ? 'Отдельная доставка' : 'Доставка в основном счёте'}
                  </span>
                  <span>{money(order.deliveryCost)}</span>
                </div>
              )}
              {order.deliveryInvoice ? (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontWeight: 900 }}>
                    <span style={{ color: 'var(--muted)' }}>Отдельный счёт</span>
                    <span>{money(order.deliveryInvoice.amount)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontWeight: 900 }}>
                    <span style={{ color: 'var(--muted)' }}>Оплата доставки</span>
                    <span style={{ color: deliveryInfo.color }}>{deliveryInfo.label}</span>
                  </div>
                  {order.deliveryInvoice.paymentExpiresAt && String(order.deliveryInvoice.status || '').toUpperCase() === 'PAYMENT_PENDING' ? (
                    <Text variant="caption" muted>Счёт действует до {new Date(order.deliveryInvoice.paymentExpiresAt).toLocaleString('ru-RU')}.</Text>
                  ) : null}
                </>
              ) : addressWasUnknown && order.deliveryStatus === 'WAIVED' ? (
                <Text variant="caption" muted>0 ₽ — явное решение сотрудника. Это не значение по умолчанию.</Text>
              ) : null}
              {String(order.paymentStatus || '').toUpperCase() !== 'CONFIRMED' && (addressPending || timePending) ? (
                <Text variant="caption" muted>Уточнить данные и выставить доставку можно после подтверждения оплаты основного счёта.</Text>
              ) : null}
            </div>

            <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <SecondaryButton label="Яндекс.Карты" disabled={!address} onClick={() => window.open(yandexMapsUrl(address), '_blank', 'noopener,noreferrer')} />
              <SecondaryButton
                label="Копировать"
                disabled={!address}
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(String(address || ''));
                  } catch {
                    // ignore
                  }
                }}
              />
            </div>
          </Surface>

          <Divider />

          <Surface variant="soft" style={{ padding: 16, borderRadius: 'var(--r-lg)', border: '1px solid var(--border)' }}>
            <Text variant="subtitle">Состав заказа</Text>
            <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
              {(order.items || []).length ? (
                order.items.map((it) => {
                  const p = it.product;
                  const img = p?.image || null;
                  const qty = Number(it.quantity || 0);
                  const price = Number(it.price || 0);
                  const line = qty * price;
                  return (
                    <div
                      key={it.id}
                      style={{
                        display: 'flex',
                        gap: 12,
                        alignItems: 'center',
                        padding: 10,
                        borderRadius: 18,
                        border: '1px solid var(--c-ink-06)',
                        background: 'var(--surface)',
                      }}
                    >
                      <div
                        style={{
                          width: 64,
                          height: 64,
                          borderRadius: 20,
                          overflow: 'hidden',
                          border: '1px solid var(--border)',
                          background: 'var(--surface-2)',
                          flexShrink: 0,
                        }}
                      >
                        {img ? <AppImage src={img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : null}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <Text variant="subtitle" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {p?.name || `Товар #${it.productId}`}
                        </Text>
                        <div style={{ marginTop: 6, display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
                          <Text variant="caption">{qty} шт</Text>
                          <div style={{ fontWeight: 1000, color: 'var(--text)', whiteSpace: 'nowrap' }}>{line} ₽</div>
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <Text variant="body" muted>
                  Товары не найдены.
                </Text>
              )}
            </div>

            <div style={{ marginTop: 14, borderTop: '1px solid var(--c-ink-06)', paddingTop: 12, display: 'grid', gap: 8 }}>
              {order.recipientName || order.recipientPhone ? (
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontWeight: 900 }}>
                  <span style={{ color: 'var(--muted)' }}>Получатель</span>
                  <span style={{ whiteSpace: 'nowrap' }}>
                    {order.recipientName || '—'}
                    {order.recipientPhone ? ` · ${order.recipientPhone}` : ''}
                  </span>
                </div>
              ) : null}

              {order.floristComment ? (
                <div style={{ display: 'grid', gap: 4 }}>
                  <Text variant="caption">Комментарий</Text>
                  <Text variant="body" muted>
                    {order.floristComment}
                  </Text>
                </div>
              ) : null}

              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontWeight: 900 }}>
                <span style={{ color: 'var(--muted)' }}>Товары</span>
                <span style={{ whiteSpace: 'nowrap' }}>{order.itemsTotal ?? 0} ₽</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontWeight: 900 }}>
                <span style={{ color: 'var(--muted)' }}>Доставка</span>
                <span style={{ whiteSpace: 'nowrap' }}>
                  {order.deliveryCost == null
                    ? 'ожидает расчёта'
                    : addressWasUnknown
                      ? `${money(order.deliveryCost)} · отдельный счёт`
                      : `${money(order.deliveryCost)} · включена`}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontWeight: 1000 }}>
                <span style={{ color: 'var(--muted)' }}>Основной счёт</span>
                <span style={{ whiteSpace: 'nowrap', color: 'var(--accent)' }}>{money(order.totalPrice)}</span>
              </div>
              {order.deliveryInvoice ? (
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontWeight: 1000 }}>
                  <span style={{ color: 'var(--muted)' }}>Отдельный счёт доставки</span>
                  <span style={{ whiteSpace: 'nowrap', color: deliveryInfo.color }}>{money(order.deliveryInvoice.amount)}</span>
                </div>
              ) : null}
            </div>
          </Surface>

          <Divider />

          <Surface variant="soft" style={{ padding: 16, borderRadius: 'var(--r-lg)', border: '1px solid var(--border)' }}>
            <Text variant="subtitle">Заказчик</Text>
            <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
              <div style={{ minWidth: 0 }}>
                <Text variant="subtitle" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {customerName}
                </Text>
                <div style={{ marginTop: 6 }}>
                  <Text variant="body" muted>
                    {customerPhone}
                  </Text>
                </div>
              </div>
              <button
                type="button"
                onClick={async () => {
                  try {
                    const existing = (order.chats || [])[0];
                    if (existing?.id) {
                      navigate(`/chats/${existing.id}`);
                      return;
                    }
                    const res = await adminApi.ensureOrderChat(orderId);
                    if (res?.chat?.id) navigate(`/chats/${res.chat.id}`);
                  } catch (e) {
                    alert(e?.data?.error || e?.message || 'Не удалось открыть чат');
                  }
                }}
                style={{
                  height: 40,
                  padding: '0 14px',
                  borderRadius: 'var(--r-pill)',
                  border: 0,
                  background: 'var(--text)',
                  color: 'var(--c-white)',
                  cursor: 'pointer',
                  fontWeight: 1000,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  flexShrink: 0,
                }}
              >
                <MessageSquare size={16} />
                В чат
              </button>
            </div>
          </Surface>

          <Divider />

          <Surface variant="soft" style={{ padding: 16, borderRadius: 'var(--r-lg)', border: '1px solid var(--border)' }}>
            <Text variant="subtitle">Фото до доставки</Text>
            <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
              {(order.photos || []).length ? (
                <div className="hide-scrollbar" style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 2 }}>
                  {order.photos.map((p) => (
                    <div key={p.id} style={{ width: 160 }}>
                      <div
                        style={{
                          width: 160,
                          height: 160,
                          borderRadius: 26,
                          overflow: 'hidden',
                          border: '1px solid var(--border)',
                          background: 'var(--surface)',
                        }}
                      >
                        <AppImage src={p.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      </div>
                      <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                        <Text variant="caption">{p.sentToClientAt ? 'Отправлено клиенту' : 'Не отправлено'}</Text>
                        {!p.sentToClientAt ? (
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                await adminApi.sendOrderPhoto(orderId, p.id);
                                await load();
                              } catch (e) {
                                alert(e?.data?.error || e?.message || 'Не удалось отправить');
                              }
                            }}
                            style={{
                              height: 30,
                              padding: '0 12px',
                              borderRadius: 'var(--r-pill)',
                              border: 0,
                              background: 'var(--text)',
                              color: 'var(--c-white)',
                              cursor: 'pointer',
                              fontWeight: 1000,
                            }}
                          >
                            Отправить
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <Text variant="body" muted>
                  Пока нет фото.
                </Text>
              )}

              <SecondaryButton label="Загрузить фото" onClick={() => fileRef.current?.click?.()} style={{ width: 'fit-content' }} />
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  try {
                    const objectUrl = URL.createObjectURL(f);
                    pendingCropRef.current = { file: f, objectUrl };
                    setCropSrc(objectUrl);
                    setCropOpen(true);
                  } catch {
                    alert('Не удалось открыть фото');
                  } finally {
                    // Allow selecting the same file again.
                    e.target.value = '';
                  }
                }}
              />
            </div>
          </Surface>

          <SquareCropModal
            open={cropOpen}
            imageSrc={cropSrc}
            title="Кадрировать фото (1:1)"
            onCancel={() => {
              setCropOpen(false);
              setCropSrc('');
              try {
                if (pendingCropRef.current?.objectUrl) URL.revokeObjectURL(pendingCropRef.current.objectUrl);
              } catch {
                // ignore
              }
              pendingCropRef.current = null;
            }}
            onConfirm={async (blob) => {
              const pending = pendingCropRef.current;
              setCropOpen(false);
              setCropSrc('');
              pendingCropRef.current = null;
              try {
                if (!pending?.file) throw new Error('NO_FILE');
                const baseName = String(pending.file.name || 'photo').replace(/\.[^/.]+$/, '');
                const croppedFile = new File([blob], `${baseName}-square.jpg`, { type: blob.type || 'image/jpeg' });

                const url = await adminApi.uploadFile(croppedFile);
                await adminApi.addOrderPhoto(orderId, url);
                await load();
              } catch (err) {
                alert(err?.data?.error || err?.message || 'Не удалось загрузить фото');
              } finally {
                try {
                  if (pending?.objectUrl) URL.revokeObjectURL(pending.objectUrl);
                } catch {
                  // ignore
                }
              }
            }}
          />

          <Divider />

          <Surface variant="soft" style={{ padding: 16, borderRadius: 'var(--r-lg)', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
              <Text variant="subtitle">Статусы</Text>
              <SecondaryButton label="История" onClick={() => setHistoryOpen(true)} style={{ height: 40, borderRadius: 'var(--r-pill)' }} />
            </div>
          </Surface>

          <Divider />

          {canManageOrder ? <SecondaryButton label="Отправить промокод" onClick={() => setPromoOpen(true)} style={{ width: '100%' }} /> : null}

          {canManageOrder ? <div style={{ marginTop: 'var(--sp-6)' }}>
            <DangerButton
              label="Отменить заказ"
              disabled={status === 'CANCELLED' || status === 'DELIVERED'}
              onClick={() => {
                setCancelReason('');
                setCancelSlide(0);
                setCancelOpen(true);
              }}
            />
          </div> : null}

          {deliveryOpen ? (
            <Modal title="Уточнить доставку" onClose={() => { if (!deliveryBusy) setDeliveryOpen(false); }}>
              <div style={{ display: 'grid', gap: 12 }}>
                {order.askRecipientAddress ? (
                  <div>
                    <Text variant="caption">Адрес от получателя</Text>
                    <textarea
                      value={deliveryForm.deliveryAddress}
                      onChange={(e) => setDeliveryForm((value) => ({ ...value, deliveryAddress: e.target.value }))}
                      placeholder="Город, улица, дом, квартира"
                      style={{ ...fieldStyle, marginTop: 6, minHeight: 78, resize: 'vertical' }}
                    />
                  </div>
                ) : (
                  <Surface variant="soft" style={{ padding: 12, borderRadius: 16, border: '1px solid var(--border)' }}>
                    <Text variant="caption">Адрес уже был известен при оплате</Text>
                    <div style={{ marginTop: 4 }}><Text variant="body">{order.deliveryAddress || '—'}</Text></div>
                  </Surface>
                )}

                {order.askRecipientTime ? (
                  <div>
                    <Text variant="caption">Время от получателя</Text>
                    <input
                      value={deliveryForm.deliveryTime}
                      onChange={(e) => setDeliveryForm((value) => ({ ...value, deliveryTime: e.target.value }))}
                      placeholder="Например: 19 ноября, 18:00–20:00"
                      style={{ ...fieldStyle, marginTop: 6 }}
                    />
                  </div>
                ) : order.deliveryTime ? (
                  <Surface variant="soft" style={{ padding: 12, borderRadius: 16, border: '1px solid var(--border)' }}>
                    <Text variant="caption">Время доставки</Text>
                    <div style={{ marginTop: 4 }}><Text variant="body">{order.deliveryTime}</Text></div>
                  </Surface>
                ) : null}

                {addressWasUnknown ? (
                  <div>
                    <Text variant="caption">Стоимость отдельной доставки, ₽</Text>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      inputMode="numeric"
                      value={deliveryForm.amount}
                      onChange={(e) => setDeliveryForm((value) => ({ ...value, amount: e.target.value }))}
                      placeholder="Не подставляется автоматически"
                      style={{ ...fieldStyle, marginTop: 6 }}
                    />
                    <div style={{ marginTop: 6 }}>
                      <Text variant="caption" muted>
                        Тариф не рассчитывается автоматически. 0 ₽ — явное освобождение от оплаты, а пустое поле означает, что стоимость ещё не определена.
                      </Text>
                    </div>
                  </div>
                ) : (
                  <Surface variant="soft" style={{ padding: 12, borderRadius: 16, border: '1px solid var(--border)' }}>
                    <Text variant="body">Доплата не создаётся: доставка уже включена в основной счёт. Сохраняется только уточнённое время.</Text>
                  </Surface>
                )}

                {deliveryError ? <Text variant="caption" style={{ color: '#d92d20' }}>{deliveryError}</Text> : null}

                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <PrimaryButton
                    label={deliveryBusy
                      ? 'Сохраняем…'
                      : addressWasUnknown
                        ? Number(deliveryForm.amount) === 0 && deliveryForm.amount !== ''
                          ? 'Сохранить и подтвердить 0 ₽'
                          : 'Сохранить и выставить счёт'
                        : 'Сохранить время'}
                    disabled={deliveryBusy}
                    onClick={submitDeliveryQuote}
                  />
                  <SecondaryButton label="Отмена" disabled={deliveryBusy} onClick={() => setDeliveryOpen(false)} />
                </div>
              </div>
            </Modal>
          ) : null}

          {historyOpen ? (
            <Modal title="История статусов" onClose={() => setHistoryOpen(false)}>
              <div style={{ display: 'grid', gap: 10 }}>
                {(order.statusHistory || []).length ? (
                  order.statusHistory.map((h) => (
                    <Surface key={h.id} variant="soft" style={{ padding: 12, borderRadius: 'var(--r-lg)', border: '1px solid var(--c-ink-06)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                        <Text variant="subtitle">{statusMeta(h.status).label}</Text>
                        <Text variant="caption">{new Date(h.createdAt).toLocaleString('ru-RU')}</Text>
                      </div>
                    </Surface>
                  ))
                ) : (
                  <Text variant="body" muted>
                    История пуста.
                  </Text>
                )}
              </div>
            </Modal>
          ) : null}

          {promoOpen ? (
            <Modal title="Отправить промокод" onClose={() => setPromoOpen(false)}>
              <div style={{ display: 'grid', gap: 10 }}>
                <div>
                  <Text variant="caption">Код (опц.)</Text>
                  <input
                    value={promo.code}
                    onChange={(e) => setPromo((p) => ({ ...p, code: e.target.value }))}
                    placeholder="FLOWIE-XXXX"
                    style={{
                      width: '100%',
                      marginTop: 6,
                      border: '1px solid var(--border)',
                      borderRadius: 16,
                      padding: 12,
                      background: 'var(--c-white)',
                      textTransform: 'uppercase',
                    }}
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <Text variant="caption">Номинал (₽)</Text>
                    <input
                      type="number"
                      value={promo.amount}
                      onChange={(e) => setPromo((p) => ({ ...p, amount: e.target.value }))}
                      placeholder="500"
                      style={{
                        width: '100%',
                        marginTop: 6,
                        border: '1px solid var(--border)',
                        borderRadius: 16,
                        padding: 12,
                        background: 'var(--c-white)',
                      }}
                    />
                  </div>
                  <div>
                    <Text variant="caption">Срок (опц.)</Text>
                    <input
                      type="date"
                      value={promo.expiresAt}
                      onChange={(e) => setPromo((p) => ({ ...p, expiresAt: e.target.value }))}
                      style={{
                        width: '100%',
                        marginTop: 6,
                        border: '1px solid var(--border)',
                        borderRadius: 16,
                        padding: 12,
                        background: 'var(--c-white)',
                      }}
                    />
                  </div>
                </div>
              </div>

              <div style={{ marginTop: 12, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <PrimaryButton
                  label="Отправить"
                  disabled={!String(promo.amount || '').trim()}
                  onClick={async () => {
                    try {
                      await adminApi.sendOrderPromo(orderId, {
                        code: promo.code || null,
                        amount: promo.amount,
                        expiresAt: promo.expiresAt || null,
                      });
                      setPromoOpen(false);
                      setPromo({ code: '', amount: '', expiresAt: '' });
                      await load();
                    } catch (e) {
                      alert(e?.data?.error || e?.message || 'Не удалось отправить');
                    }
                  }}
                />
                <SecondaryButton label="Закрыть" onClick={() => setPromoOpen(false)} />
              </div>
            </Modal>
          ) : null}

          {cancelOpen ? (
            <Modal title="Отмена заказа" onClose={() => setCancelOpen(false)}>
              <Text variant="caption">Причина (опционально)</Text>
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Например: клиент попросил отменить"
                style={{
                  width: '100%',
                  marginTop: 6,
                  border: '1px solid var(--border)',
                  borderRadius: 16,
                  padding: 12,
                  background: 'var(--c-white)',
                  minHeight: 90,
                  resize: 'vertical',
                }}
              />

              <div style={{ marginTop: 12 }}>
                <Text variant="caption">Подтверждение (дотяни до конца)</Text>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={cancelSlide}
                  onChange={(e) => setCancelSlide(Number(e.target.value))}
                  style={{ width: '100%', marginTop: 8 }}
                />
              </div>

              <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
                <DangerButton
                  label="Отменить заказ"
                  disabled={cancelSlide < 100}
                  onClick={async () => {
                    try {
                      await adminApi.cancelOrder(orderId, cancelReason);
                      setCancelOpen(false);
                      await load();
                    } catch (e) {
                      alert(e?.data?.error || e?.message || 'Не удалось отменить');
                    }
                  }}
                />
                <SecondaryButton label="Закрыть" onClick={() => setCancelOpen(false)} style={{ width: '100%' }} />
              </div>
            </Modal>
          ) : null}
        </>
      )}
    </div>
  );
}
