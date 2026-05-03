import React, { useMemo } from 'react';
import { ChevronLeft, ShieldCheck, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAppState } from '../state/AppState';
import { buildActiveOrderPreview } from '../lib/orderPreview';
import { formatMoney } from '../lib/money';
import { AppShell } from './layout/AppShell';
import { IconButton } from './ui/IconButton';
import { Text } from './ui/Text';
import { Surface } from './ui/Surface';
import { PaymentMethods } from './domain/PaymentMethods';
import { PriceBreakdown } from './domain/PriceBreakdown';
import { CheckoutFooterCTA } from './domain/CheckoutFooterCTA';
import { AppImage } from './ui/AppImage';

const DEFAULT_SAFE_ACCOUNT = {
  name: 'Vivienne',
  label: 'Safe delivery account',
  image: '/vivienne-avatar.jpeg',
};

function normalizeRecipientAccount(recipient) {
  const account = recipient || DEFAULT_SAFE_ACCOUNT;
  const isVivienne =
    String(account?.name || '').trim().toLowerCase() === 'vivienne' ||
    String(account?.id || '') === '2' ||
    String(account?.id || '') === '2002';
  if (!isVivienne) return account;
  return { ...account, name: 'Vivienne', image: DEFAULT_SAFE_ACCOUNT.image, handle: '@_v.morel' };
}

const PHONE_COUNTRIES = [
  { iso: 'US', flag: '🇺🇸', name: 'United States', dial: '+1', placeholder: '(555) 000-0000', max: 10 },
  { iso: 'CA', flag: '🇨🇦', name: 'Canada', dial: '+1', placeholder: '(555) 000-0000', max: 10 },
  { iso: 'GB', flag: '🇬🇧', name: 'United Kingdom', dial: '+44', placeholder: '7400 000000', max: 10 },
  { iso: 'DE', flag: '🇩🇪', name: 'Germany', dial: '+49', placeholder: '1512 3456789', max: 11 },
  { iso: 'FR', flag: '🇫🇷', name: 'France', dial: '+33', placeholder: '6 12 34 56 78', max: 9 },
  { iso: 'IT', flag: '🇮🇹', name: 'Italy', dial: '+39', placeholder: '312 345 6789', max: 10 },
  { iso: 'ES', flag: '🇪🇸', name: 'Spain', dial: '+34', placeholder: '612 34 56 78', max: 9 },
  { iso: 'NL', flag: '🇳🇱', name: 'Netherlands', dial: '+31', placeholder: '6 12345678', max: 9 },
  { iso: 'PL', flag: '🇵🇱', name: 'Poland', dial: '+48', placeholder: '512 345 678', max: 9 },
  { iso: 'TR', flag: '🇹🇷', name: 'Turkey', dial: '+90', placeholder: '532 000 0000', max: 10 },
  { iso: 'AE', flag: '🇦🇪', name: 'United Arab Emirates', dial: '+971', placeholder: '50 000 0000', max: 9 },
  { iso: 'SA', flag: '🇸🇦', name: 'Saudi Arabia', dial: '+966', placeholder: '50 000 0000', max: 9 },
  { iso: 'IN', flag: '🇮🇳', name: 'India', dial: '+91', placeholder: '98765 43210', max: 10 },
  { iso: 'BR', flag: '🇧🇷', name: 'Brazil', dial: '+55', placeholder: '11 91234-5678', max: 11 },
  { iso: 'MX', flag: '🇲🇽', name: 'Mexico', dial: '+52', placeholder: '55 1234 5678', max: 10 },
  { iso: 'RU', flag: '🇷🇺', name: 'Russia', dial: '+7', placeholder: '999 000-00-00', max: 10 },
  { iso: 'UA', flag: '🇺🇦', name: 'Ukraine', dial: '+380', placeholder: '67 000 0000', max: 9 },
  { iso: 'KZ', flag: '🇰🇿', name: 'Kazakhstan', dial: '+7', placeholder: '700 000 0000', max: 10 },
  { iso: 'GE', flag: '🇬🇪', name: 'Georgia', dial: '+995', placeholder: '555 12 34 56', max: 9 },
  { iso: 'AM', flag: '🇦🇲', name: 'Armenia', dial: '+374', placeholder: '77 123456', max: 8 },
];

function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '');
}

function inferPhoneCountry(phone) {
  const raw = String(phone || '').trim();
  const byDial = PHONE_COUNTRIES.find((c) => raw.startsWith(c.dial));
  return byDial || PHONE_COUNTRIES[0];
}

function stripDialCode(phone, country) {
  const raw = String(phone || '').trim();
  if (raw.startsWith(country.dial)) return digitsOnly(raw.slice(country.dial.length)).slice(0, country.max);
  return digitsOnly(raw).slice(0, country.max);
}

function formatPhoneDigits(digits, country) {
  const d = digitsOnly(digits).slice(0, country.max);
  if (country.iso === 'US') {
    if (d.length <= 3) return d ? `(${d}` : '';
    if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
    return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6, 10)}`;
  }
  if (country.iso === 'RU') {
    if (d.length <= 3) return d;
    if (d.length <= 6) return `${d.slice(0, 3)} ${d.slice(3)}`;
    if (d.length <= 8) return `${d.slice(0, 3)} ${d.slice(3, 6)}-${d.slice(6)}`;
    return `${d.slice(0, 3)} ${d.slice(3, 6)}-${d.slice(6, 8)}-${d.slice(8, 10)}`;
  }
  if (country.iso === 'AE') {
    if (d.length <= 2) return d;
    if (d.length <= 5) return `${d.slice(0, 2)} ${d.slice(2)}`;
    return `${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5, 9)}`;
  }
  if (country.iso === 'GB') {
    if (d.length <= 4) return d;
    return `${d.slice(0, 4)} ${d.slice(4, 10)}`;
  }
  if (d.length <= 4) return d;
  if (d.length <= 7) return `${d.slice(0, 4)} ${d.slice(4)}`;
  return `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7, 11)}`;
}

function CheckoutItemsPreview({ items, productsById }) {
  const shown = (items || [])
    .map((it) => ({ ...it, product: productsById.get(String(it.productId)) }))
    .filter((it) => it.product);

  if (!shown.length) return null;

  return (
    <Surface variant="default" style={{ padding: 14, borderRadius: 'var(--r-lg)', border: '1px solid var(--border)', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
        <Text variant="title">Your gift</Text>
        <Text variant="caption" muted>{shown.length} item{shown.length === 1 ? '' : 's'}</Text>
      </div>

      <div style={{ display: 'grid', gap: 10 }}>
        {shown.map((it) => {
          const p = it.product;
          const qty = Number(it.qty || 1);
          return (
            <div
              key={it.productId}
              style={{
                display: 'grid',
                gridTemplateColumns: '58px minmax(0, 1fr) auto',
                alignItems: 'center',
                gap: 12,
                minWidth: 0,
              }}
            >
              <AppImage
                src={p.image}
                alt={p.title}
                style={{ width: 58, height: 58, borderRadius: 14, objectFit: 'cover' }}
              />
              <div style={{ minWidth: 0 }}>
                <Text variant="subtitle" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {p.title}
                </Text>
                <Text variant="caption" muted style={{ marginTop: 4 }}>Qty {qty}</Text>
              </div>
              <div style={{ fontWeight: 1000, color: 'var(--accent)', whiteSpace: 'nowrap' }}>
                {formatMoney((p.price || 0) * qty)}
              </div>
            </div>
          );
        })}
      </div>
    </Surface>
  );
}

function SafeDeliveryAccount({ recipient }) {
  const account = normalizeRecipientAccount(recipient);
  const image = account.image || account.avatar || DEFAULT_SAFE_ACCOUNT.image;

  return (
    <Surface
      variant="default"
      style={{
        padding: 0,
        borderRadius: 'var(--r-xl)',
        border: '1px solid var(--border)',
        overflow: 'hidden',
        background: 'var(--surface)',
        boxShadow: '0 18px 46px rgba(13,13,13,0.08)',
      }}
    >
      <div
        style={{
          padding: 14,
          background: 'linear-gradient(135deg, rgba(198,83,109,0.14), rgba(255,255,255,0.88) 68%)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <Text variant="title">Recipient</Text>
          <span
            style={{
              height: 30,
              padding: '0 10px',
              borderRadius: 999,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: 'var(--c-white)',
              color: 'var(--accent)',
              fontSize: 12,
              fontWeight: 1000,
              boxShadow: 'inset 0 0 0 1px var(--c-accent-border)',
              whiteSpace: 'nowrap',
            }}
          >
            <ShieldCheck size={15} />
            Safe delivery
          </span>
        </div>

        <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '76px minmax(0, 1fr)', gap: 14, alignItems: 'center' }}>
          <div style={{ position: 'relative', width: 76, height: 76 }}>
            <AppImage
              src={image}
              alt={account.name}
              style={{
                width: 76,
                height: 76,
                borderRadius: 24,
                objectFit: 'cover',
                boxShadow: '0 14px 30px rgba(13,13,13,0.16)',
              }}
            />
            <span
              aria-hidden="true"
              style={{
                position: 'absolute',
                right: -3,
                bottom: -3,
                width: 26,
                height: 26,
                borderRadius: 999,
                background: 'var(--accent)',
                color: 'var(--c-white)',
                border: '3px solid var(--surface)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Sparkles size={13} />
            </span>
          </div>

          <div style={{ minWidth: 0 }}>
            <Text variant="title" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {account.name}
            </Text>
            <Text variant="body" muted style={{ marginTop: 8 }}>
              She confirms the best time and place after your payment.
            </Text>
          </div>
        </div>
      </div>
    </Surface>
  );
}

export function Checkout() {
  const navigate = useNavigate();
  const { state, actions } = useAppState();
  const initialPhoneCountry = React.useMemo(() => inferPhoneCountry(state.auth.me?.phone), [state.auth.me?.phone]);
  const [phoneCountryIso, setPhoneCountryIso] = React.useState(initialPhoneCountry.iso);
  const phoneCountry = PHONE_COUNTRIES.find((c) => c.iso === phoneCountryIso) || PHONE_COUNTRIES[0];
  const [phoneDigits, setPhoneDigits] = React.useState(() => stripDialCode(state.auth.me?.phone, initialPhoneCountry));
  const [consentLocal, setConsentLocal] = React.useState(() => Boolean(state.auth.me?.consentPersonal));

  const productsById = useMemo(() => new Map(state.products.items.map((p) => [String(p.id), p])), [state.products.items]);
  const itemsTotal = useMemo(() => state.cart.items.reduce((sum, it) => sum + (productsById.get(String(it.productId))?.price || 0) * it.qty, 0), [productsById, state.cart.items]);
  const upsellsById = useMemo(() => new Map(state.upsells.items.map((u) => [String(u.id), u])), [state.upsells.items]);
  const upsellsTotal = useMemo(() => {
    return Object.entries(state.cart.upsells || {}).reduce((sum, [id, qty]) => sum + (Number(upsellsById.get(String(id))?.price || 0) * Number(qty || 0)), 0);
  }, [state.cart.upsells, upsellsById]);
  const deliveryCost = 0;
  const subtotal = itemsTotal + upsellsTotal + deliveryCost;
  const bonusesApplied = state.cart.useBonuses ? Math.min(state.auth.bonusBalance, subtotal) : 0;
  const total = Math.max(0, subtotal - bonusesApplied);

  const recipientId = state.checkout.recipientId ?? state.recipients.selectedId;
  const senderPhone = `${phoneCountry.dial}${digitsOnly(phoneDigits)}`;
  const hasSenderPhone = digitsOnly(phoneDigits).length >= Math.min(9, phoneCountry.max);
  const consentChecked = Boolean(state.auth.me?.consentPersonal || consentLocal);
  const canPay =
    Boolean(state.cart.items.length) &&
    Boolean(state.checkout.paymentMethod) &&
    hasSenderPhone &&
    consentChecked;

  const selectedRecipient = useMemo(
    () => state.recipients.items.find((r) => r.id === recipientId) || null,
    [recipientId, state.recipients.items]
  );

  function buildDeliveryAddress() {
    return 'Recipient will choose safe delivery location';
  }

  function buildDeliveryTime() {
    return '';
  }

  return (
    <>
      <AppShell style={{ '--app-shell-bottom-space': '0px', '--app-shell-extra-bottom': '140px' }}>
        <div style={{ display: 'grid', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <IconButton onClick={() => navigate(-1)} aria-label="Back">
              <ChevronLeft size={22} />
            </IconButton>
            <div style={{ minWidth: 0 }}>
              <Text variant="title">Checkout</Text>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 'var(--sp-6)', display: 'grid', gap: 16 }}>
          <CheckoutItemsPreview items={state.cart.items} productsById={productsById} />

          <SafeDeliveryAccount recipient={selectedRecipient} />

          <Surface variant="default" style={{ padding: 14, borderRadius: 'var(--r-lg)', border: '1px solid var(--border)', overflow: 'hidden' }}>
            <PaymentMethods value={state.checkout.paymentMethod} onChange={actions.setPaymentMethod} totalUsd={total} />
          </Surface>

          <Surface variant="default" style={{ padding: 14, borderRadius: 'var(--r-lg)', border: '1px solid var(--border)', display: 'grid', gap: 10, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <Text variant="title">Buyer contact</Text>
              <ShieldCheck size={18} color="var(--accent)" />
            </div>
            {state.auth.me?.phone ? (
              <Surface variant="soft" style={{ padding: 12, borderRadius: 16, border: '1px solid var(--border)', overflow: 'hidden' }}>
                <Text variant="subtitle">{state.auth.me.phone}</Text>
                <Text variant="caption" muted>Saved in your profile</Text>
              </Surface>
            ) : (
              <>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '148px minmax(0, 1fr)',
                    alignItems: 'center',
                    width: '100%',
                    borderRadius: 16,
                    border: '1px solid var(--border)',
                    overflow: 'hidden',
                    minWidth: 0,
                  }}
                >
                  <select
                    value={phoneCountryIso}
                    onChange={(e) => {
                      const next = PHONE_COUNTRIES.find((c) => c.iso === e.target.value) || PHONE_COUNTRIES[0];
                      setPhoneCountryIso(next.iso);
                      setPhoneDigits((v) => digitsOnly(v).slice(0, next.max));
                    }}
                    aria-label="Phone country"
                    style={{
                      width: '100%',
                      height: 52,
                      border: 0,
                      borderRight: '1px solid var(--border)',
                      background: 'var(--surface-2)',
                      padding: '0 8px',
                      fontSize: 16,
                      fontWeight: 900,
                      outline: 'none',
                      minWidth: 0,
                    }}
                  >
                    {PHONE_COUNTRIES.map((country) => (
                      <option key={country.iso} value={country.iso}>
                        {country.flag} {country.iso} {country.dial}
                      </option>
                    ))}
                  </select>

                  <input
                    value={formatPhoneDigits(phoneDigits, phoneCountry)}
                    onChange={(e) => setPhoneDigits(digitsOnly(e.target.value).slice(0, phoneCountry.max))}
                    onBlur={async () => { if (hasSenderPhone) await actions.updateMyPhone(senderPhone); }}
                    placeholder={phoneCountry.placeholder}
                    inputMode="tel"
                    aria-label="Phone number"
                    style={{
                      width: '100%',
                      height: 52,
                      border: 0,
                      padding: '0 12px',
                      fontSize: 16,
                      outline: 'none',
                      minWidth: 0,
                      background: 'var(--surface)',
                    }}
                  />
                </div>
                {!hasSenderPhone ? (
                  <Text variant="caption" style={{ color: 'var(--c-accent)' }}>
                    Add a contact number in case fulfillment needs clarification.
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
                  style={{ width: 20, height: 20, marginTop: 2, flexShrink: 0 }}
                />
                <span style={{ fontSize: 14, lineHeight: 1.35 }}>
                  I agree to the privacy policy and data processing for order fulfillment.
                </span>
              </label>
            )}
          </Surface>

          <Surface variant="default" style={{ padding: 14, borderRadius: 'var(--r-lg)', border: '1px solid var(--border)' }}>
            <Text variant="title" style={{ marginBottom: 'var(--sp-4)' }}>
              Summary
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
                price: productsById.get(String(it.productId))?.price || 0,
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
              recipientName: selectedRecipient?.name || DEFAULT_SAFE_ACCOUNT.name,
              recipientPhone: selectedRecipient?.phone || '',
              deliveryCost,
              paymentMethod: state.checkout.paymentMethod,
              floristComment: state.cart.floristComment || '',
              senderPhone,
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
              alert('Delivery is not available for this address yet.');
              return;
            }
            if (code === 'DELIVERY_ADDRESS_NOT_FOUND') {
              alert('We could not find this address. Please check street and building.');
              return;
            }
            if (code === 'ADDRESS_VALIDATION_UNAVAILABLE') {
              alert('Address validation is temporarily unavailable. Please try again soon.');
              return;
            }
            if (code === 'DELIVERY_ADDRESS_TOO_SHORT') {
              alert('Please add a more specific delivery address.');
              return;
            }
            alert(code || 'Could not create the order');
          }
        }}
      />
    </>
  );
}
