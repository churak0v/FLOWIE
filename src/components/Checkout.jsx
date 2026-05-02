import React, { useMemo } from 'react';
import { ChevronLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAppState } from '../state/AppState';
import { buildActiveOrderPreview } from '../lib/orderPreview';
import { AppShell } from './layout/AppShell';
import { IconButton } from './ui/IconButton';
import { Text } from './ui/Text';
import { Surface } from './ui/Surface';
import { RecipientSelector } from './domain/RecipientSelector';
import { AddressSection } from './domain/AddressSection';
import { DeliveryTimeSection } from './domain/DeliveryTimeSection';
import { PaymentMethods } from './domain/PaymentMethods';
import { PriceBreakdown } from './domain/PriceBreakdown';
import { CheckoutFooterCTA } from './domain/CheckoutFooterCTA';

export function Checkout() {
  const navigate = useNavigate();
  const { state, actions } = useAppState();
  const [phoneInput, setPhoneInput] = React.useState(() => String(state.auth.me?.phone || '+7'));
  const [consentLocal, setConsentLocal] = React.useState(() => Boolean(state.auth.me?.consentPersonal));

  const productsById = useMemo(() => new Map(state.products.items.map((p) => [p.id, p])), [state.products.items]);
  const itemsTotal = useMemo(() => state.cart.items.reduce((sum, it) => sum + (productsById.get(it.productId)?.price || 0) * it.qty, 0), [productsById, state.cart.items]);
  const upsellsById = useMemo(() => new Map(state.upsells.items.map((u) => [String(u.id), u])), [state.upsells.items]);
  const upsellsTotal = useMemo(() => {
    return Object.entries(state.cart.upsells || {}).reduce((sum, [id, qty]) => sum + (Number(upsellsById.get(String(id))?.price || 0) * Number(qty || 0)), 0);
  }, [state.cart.upsells, upsellsById]);
  const deliveryCost = 0;
  const subtotal = itemsTotal + upsellsTotal + deliveryCost;
  const bonusesApplied = state.cart.useBonuses ? Math.min(state.auth.bonusBalance, subtotal) : 0;
  const total = Math.max(0, subtotal - bonusesApplied);

  const recipientId = state.checkout.recipientId ?? state.recipients.selectedId;
  const addressOk = state.checkout.askRecipientAddress || (state.checkout.address.street.trim() && state.checkout.address.house.trim());
  const timeOk = state.checkout.askRecipientTime || (state.checkout.deliveryDate && state.checkout.deliveryTime);
  const senderPhone = String(phoneInput || '').trim();
  const hasSenderPhone = senderPhone.replace(/\\D/g, '').length >= 10;
  const consentChecked = Boolean(state.auth.me?.consentPersonal || consentLocal);
  const canPay =
    Boolean(state.cart.items.length) &&
    Boolean(recipientId) &&
    Boolean(addressOk) &&
    Boolean(timeOk) &&
    Boolean(state.checkout.paymentMethod) &&
    hasSenderPhone &&
    consentChecked;

  const selectedRecipient = useMemo(
    () => state.recipients.items.find((r) => r.id === recipientId) || null,
    [recipientId, state.recipients.items]
  );

  function buildDeliveryAddress() {
    if (state.checkout.askRecipientAddress) return 'Уточнить у получателя';
    const a = state.checkout.address;
    const parts = [];
    if (a.street) parts.push(a.street);
    if (a.house) parts.push(a.house);
    if (a.flat) parts.push(`кв/офис ${a.flat}`);
    if (a.entrance) parts.push(`подъезд ${a.entrance}`);
    if (a.floor) parts.push(`этаж ${a.floor}`);
    return parts.join(', ') || 'Адрес не указан';
  }

  function buildDeliveryTime() {
    if (state.checkout.askRecipientTime) return 'Уточнить у получателя';
    const d = state.checkout.deliveryDate;
    const t = state.checkout.deliveryTime;
    return d && t ? `${d} ${t}` : '';
  }

  return (
    <>
      <AppShell style={{ '--app-shell-bottom-space': '0px', '--app-shell-extra-bottom': '140px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <IconButton onClick={() => navigate(-1)} aria-label="Назад">
            <ChevronLeft size={22} />
          </IconButton>
          <Text variant="title">Оформление</Text>
        </div>

        <div style={{ marginTop: 'var(--sp-6)', display: 'grid', gap: 16 }}>
          <Surface variant="soft" style={{ padding: 14, borderRadius: 18, border: '1px solid var(--border)' }}>
            <RecipientSelector
              recipients={state.recipients.items}
              selectedId={recipientId}
              onSelect={actions.selectRecipient}
              onAddClick={() => navigate('/recipients/new')}
            />
          </Surface>

          <Surface variant="soft" style={{ padding: 14, borderRadius: 18, border: '1px solid var(--border)', display: 'grid', gap: 10 }}>
            <AddressSection
              askRecipientAddress={state.checkout.askRecipientAddress}
              address={state.checkout.address}
              onToggleAsk={actions.toggleAskAddress}
              onChange={actions.setAddress}
            />
            <DeliveryTimeSection
              askRecipientTime={state.checkout.askRecipientTime}
              date={state.checkout.deliveryDate}
              time={state.checkout.deliveryTime}
              onToggleAsk={actions.toggleAskTime}
              onChange={actions.setDeliveryTime}
            />
          </Surface>

          <Surface variant="soft" style={{ padding: 14, borderRadius: 18, border: '1px solid var(--border)' }}>
            <PaymentMethods value={state.checkout.paymentMethod} onChange={actions.setPaymentMethod} />
          </Surface>

          <Surface variant="soft" style={{ padding: 14, borderRadius: 18, border: '1px solid var(--border)', display: 'grid', gap: 10 }}>
            <Text variant="title">Ваш номер</Text>
            {state.auth.me?.phone ? (
              <Surface variant="soft" style={{ padding: 12, borderRadius: 16, border: '1px solid var(--border)' }}>
                <Text variant="subtitle">{state.auth.me.phone}</Text>
                <Text variant="caption" muted>Телефон из профиля</Text>
              </Surface>
            ) : (
              <>
                <input
                  value={phoneInput}
                  onChange={(e) => {
                    const raw = e.target.value;
                    const digits = raw.replace(/[^0-9]/g, '');
                    const next = digits.startsWith('7') ? `+7${digits.slice(1)}` : `+7${digits}`;
                    setPhoneInput(next);
                  }}
                  onBlur={async () => { if (hasSenderPhone) await actions.updateMyPhone(senderPhone); }}
                  placeholder="+7"
                  inputMode="tel"
                  style={{
                    width: '100%',
                    borderRadius: 16,
                    border: '1px solid var(--border)',
                    padding: 12,
                    fontSize: 16,
                  }}
                />
                {!hasSenderPhone ? (
                  <Text variant="caption" style={{ color: 'var(--c-accent)' }}>
                    Укажите телефон, чтобы мы могли связаться при необходимости
                  </Text>
                ) : null}
              </>
            )}

            {state.auth.me?.consentPersonal ? null : (
              <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={consentChecked}
                  onChange={async (e) => { setConsentLocal(e.target.checked); await actions.setConsent?.(e.target.checked); }}
                  style={{ width: 20, height: 20, marginTop: 2 }}
                />
                <span style={{ fontSize: 14 }}>
                  Даю согласие на обработку персональных данных
                </span>
              </label>
            )}
          </Surface>

          <Surface variant="soft" style={{ padding: 14, borderRadius: 18, border: '1px solid var(--border)' }}>
            <Text variant="title" style={{ marginBottom: 'var(--sp-4)' }}>
              Итог
            </Text>
            <PriceBreakdown itemsTotal={itemsTotal} upsellsTotal={upsellsTotal} deliveryCost={deliveryCost} bonusesApplied={bonusesApplied} />
          </Surface>
        </div>
      </AppShell>

      <CheckoutFooterCTA
        total={total}
        disabled={!canPay}
        onClick={async () => {
          if (!canPay) return;
          try {
            const items = [];

            for (const it of state.cart.items) {
              items.push({
                productId: it.productId,
                quantity: it.qty,
                price: productsById.get(it.productId)?.price || 0,
              });
            }

            // Add upsells as regular order items, so they are visible in admin and included in totals.
            for (const [id, qty] of Object.entries(state.cart.upsells || {})) {
              const pid = Number(id);
              const q = Number(qty || 0);
              if (!Number.isFinite(pid) || q <= 0) continue;
              const p = upsellsById.get(String(pid));
              if (!p) continue;
              items.push({
                productId: pid,
                quantity: q,
                price: Number(p.price || 0),
              });
            }

            const order = await api.createOrder({
              items,
              deliveryAddress: buildDeliveryAddress(),
              deliveryTime: buildDeliveryTime(),
              recipientName: selectedRecipient?.name || '',
              recipientPhone: selectedRecipient?.phone || '',
              deliveryCost,
              paymentMethod: state.checkout.paymentMethod,
              floristComment: state.cart.floristComment || '',
              senderPhone: state.auth.me?.phone || '',
              consentPersonal: consentChecked,
            });

            if (order?.id != null) actions.setActiveOrder(order.id, order?.paymentExpiresAt || null, buildActiveOrderPreview(order));
            actions.clearCart();
            navigate(`/pay/${encodeURIComponent(String(order?.id || ''))}`);
            // eslint-disable-next-line no-console
            console.log('Order created:', order?.id);
          } catch (e) {
            const code = String(e?.data?.error || e?.message || '').trim();
            if (code === 'DELIVERY_OUT_OF_SERVICE_AREA') {
              alert('Доставка доступна только в Санкт-Петербурге и Ленинградской области.');
              return;
            }
            if (code === 'DELIVERY_ADDRESS_NOT_FOUND') {
              alert('Не удалось найти адрес. Проверьте улицу и дом (Санкт-Петербург или Ленинградская область).');
              return;
            }
            if (code === 'ADDRESS_VALIDATION_UNAVAILABLE') {
              alert('Не удалось проверить адрес. Попробуйте еще раз чуть позже.');
              return;
            }
            if (code === 'DELIVERY_ADDRESS_TOO_SHORT') {
              alert('Укажите адрес подробнее (улица и дом).');
              return;
            }
            alert(code || 'Не удалось создать заказ');
          }
        }}
      />
    </>
  );
}
