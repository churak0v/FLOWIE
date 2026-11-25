import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAppState } from '../state/AppState';
import { buildActiveOrderPreview } from '../lib/orderPreview';
import { formatMoney } from '../lib/money';
import { AppShell } from './layout/AppShell';
import { IconButton } from './ui/IconButton';
import { Text } from './ui/Text';
import { Surface } from './ui/Surface';
import { PriceBreakdown } from './domain/PriceBreakdown';
import { CheckoutFooterCTA } from './domain/CheckoutFooterCTA';
import { AppImage } from './ui/AppImage';
import { trackAnalytics } from '../lib/analytics';
import { buildCheckoutDeliveryTime, calculateCheckoutPayment, isValidCheckoutPhone, normalizeCheckoutPhone } from '../lib/checkoutDelivery';
import { YandexDeliveryMap } from './domain/YandexDeliveryMap';
import { isMothersDayCampaignActive, MOTHERS_DAY_DELIVERY_DATE } from '../lib/mothersDayCampaign';

const PHONE_COUNTRIES = [
  { iso: 'RU', flag: '🇷🇺', name: 'Russia', dial: '+7', placeholder: '999 000-00-00', max: 10 },
  { iso: 'US', flag: '🇺🇸', name: 'United States', dial: '+1', placeholder: '(555) 000-0000', max: 10 },
  { iso: 'CA', flag: '🇨🇦', name: 'Canada', dial: '+1', placeholder: '(555) 000-0000', max: 10 },
  { iso: 'PK', flag: '🇵🇰', name: 'Pakistan', dial: '+92', placeholder: '300 1234567', max: 10 },
  { iso: 'BD', flag: '🇧🇩', name: 'Bangladesh', dial: '+880', placeholder: '1712 345678', max: 10 },
  { iso: 'ID', flag: '🇮🇩', name: 'Indonesia', dial: '+62', placeholder: '812 3456 7890', max: 11 },
  { iso: 'MY', flag: '🇲🇾', name: 'Malaysia', dial: '+60', placeholder: '12 345 6789', max: 10 },
  { iso: 'PH', flag: '🇵🇭', name: 'Philippines', dial: '+63', placeholder: '917 123 4567', max: 10 },
  { iso: 'TH', flag: '🇹🇭', name: 'Thailand', dial: '+66', placeholder: '81 234 5678', max: 9 },
  { iso: 'VN', flag: '🇻🇳', name: 'Vietnam', dial: '+84', placeholder: '91 234 56 78', max: 9 },
  { iso: 'CN', flag: '🇨🇳', name: 'China', dial: '+86', placeholder: '131 2345 6789', max: 11 },
  { iso: 'JP', flag: '🇯🇵', name: 'Japan', dial: '+81', placeholder: '90 1234 5678', max: 10 },
  { iso: 'KR', flag: '🇰🇷', name: 'South Korea', dial: '+82', placeholder: '10 1234 5678', max: 10 },
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
  { iso: 'QA', flag: '🇶🇦', name: 'Qatar', dial: '+974', placeholder: '3000 0000', max: 8 },
  { iso: 'KW', flag: '🇰🇼', name: 'Kuwait', dial: '+965', placeholder: '500 00000', max: 8 },
  { iso: 'BH', flag: '🇧🇭', name: 'Bahrain', dial: '+973', placeholder: '3600 0000', max: 8 },
  { iso: 'OM', flag: '🇴🇲', name: 'Oman', dial: '+968', placeholder: '9000 0000', max: 8 },
  { iso: 'IN', flag: '🇮🇳', name: 'India', dial: '+91', placeholder: '98765 43210', max: 10 },
  { iso: 'ZA', flag: '🇿🇦', name: 'South Africa', dial: '+27', placeholder: '71 123 4567', max: 9 },
  { iso: 'NG', flag: '🇳🇬', name: 'Nigeria', dial: '+234', placeholder: '801 234 5678', max: 10 },
  { iso: 'KE', flag: '🇰🇪', name: 'Kenya', dial: '+254', placeholder: '712 345678', max: 9 },
  { iso: 'EG', flag: '🇪🇬', name: 'Egypt', dial: '+20', placeholder: '100 123 4567', max: 10 },
  { iso: 'BR', flag: '🇧🇷', name: 'Brazil', dial: '+55', placeholder: '11 91234-5678', max: 11 },
  { iso: 'MX', flag: '🇲🇽', name: 'Mexico', dial: '+52', placeholder: '55 1234 5678', max: 10 },
  { iso: 'AR', flag: '🇦🇷', name: 'Argentina', dial: '+54', placeholder: '9 11 2345 6789', max: 11 },
  { iso: 'CL', flag: '🇨🇱', name: 'Chile', dial: '+56', placeholder: '9 1234 5678', max: 9 },
  { iso: 'CO', flag: '🇨🇴', name: 'Colombia', dial: '+57', placeholder: '300 1234567', max: 10 },
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
  return byDial || PHONE_COUNTRIES.find((country) => country.iso === 'RU') || PHONE_COUNTRIES[0];
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

function createCheckoutUuid() {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === 'function') return cryptoApi.randomUUID();
  const bytes = new Uint8Array(16);
  if (typeof cryptoApi?.getRandomValues === 'function') cryptoApi.getRandomValues(bytes);
  else bytes.forEach((_, index) => { bytes[index] = Math.floor(Math.random() * 256); });
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function getCheckoutKey(fingerprint) {
  const storageKey = 'flowie:checkout-submit:v1';
  try {
    const saved = JSON.parse(sessionStorage.getItem(storageKey) || 'null');
    if (saved?.fingerprint === fingerprint && typeof saved?.key === 'string') return saved.key;
    const key = createCheckoutUuid();
    sessionStorage.setItem(storageKey, JSON.stringify({ key, fingerprint }));
    return key;
  } catch {
    return createCheckoutUuid();
  }
}

function clearCheckoutKey(key) {
  try {
    const storageKey = 'flowie:checkout-submit:v1';
    const saved = JSON.parse(sessionStorage.getItem(storageKey) || 'null');
    if (saved?.key === key) sessionStorage.removeItem(storageKey);
  } catch {
    // ignore unavailable storage
  }
}

function CheckoutItemsPreview({ items, productsById }) {
  const shown = (items || [])
    .map((it) => ({ ...it, product: productsById.get(String(it.productId)) }))
    .filter((it) => it.product);

  if (!shown.length) return null;

  return (
    <Surface variant="default" style={{ padding: 14, borderRadius: 'var(--r-lg)', border: '1px solid var(--border)', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
        <Text variant="title">Ваши цветы</Text>
        <Text variant="caption" muted>{shown.length} шт.</Text>
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
                <Text variant="caption" muted style={{ marginTop: 4 }}>Кол-во: {qty}</Text>
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

function RecipientDetailsBlock({ receiveSelf, onModeChange, name, phone, onNameChange, onPhoneChange, selfName, selfPhone }) {
  return (
    <Surface
      variant="default"
      style={{
        padding: 14,
        borderRadius: 'var(--r-lg)',
        border: '1px solid var(--border)',
        display: 'grid',
        gap: 12,
      }}
    >
      <Text variant="title">Кто получит заказ?</Text>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: 4, borderRadius: 16, background: 'var(--surface-2)' }}>
        {[
          { value: false, label: 'Другой человек' },
          { value: true, label: 'Получу сам' },
        ].map((option) => {
          const active = receiveSelf === option.value;
          return (
            <button
              key={option.label}
              type="button"
              onClick={() => onModeChange(option.value)}
              style={{
                minHeight: 44,
                border: active ? '1px solid var(--c-accent-border)' : '1px solid transparent',
                borderRadius: 13,
                background: active ? 'var(--surface)' : 'transparent',
                color: active ? 'var(--accent)' : 'var(--muted)',
                fontWeight: 900,
                cursor: 'pointer',
                boxShadow: active ? 'var(--shadow-sm)' : 'none',
              }}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      {receiveSelf ? (
        <Surface variant="soft" style={{ padding: 12, borderRadius: 14, border: '1px solid var(--border)' }}>
          <Text variant="subtitle">{selfName || 'Укажите имя покупателя ниже'}</Text>
          <Text variant="caption" muted style={{ marginTop: 4 }}>{selfPhone || 'Телефон возьмём из контакта покупателя'}</Text>
        </Surface>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          <input className="ym-disable-keys"
            value={name}
            onChange={(event) => onNameChange(event.target.value)}
            placeholder="Имя получателя"
            autoComplete="name"
            aria-label="Имя получателя"
            style={{ height: 48, borderRadius: 14, border: '1px solid var(--border)', padding: '0 12px', background: 'var(--surface)' }}
          />
          <input className="ym-disable-keys"
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(event) => onPhoneChange(normalizeCheckoutPhone(event.target.value))}
            placeholder="+7 999 000-00-00"
            autoComplete="tel"
            aria-label="Телефон получателя"
            style={{ height: 48, borderRadius: 14, border: '1px solid var(--border)', padding: '0 12px', background: 'var(--surface)' }}
          />
        </div>
      )}
    </Surface>
  );
}

export function Checkout() {
  const navigate = useNavigate();
  const { state, actions } = useAppState();
  const isVerifiedBuyer = Boolean(state.auth.me?.phoneVerified);
  const initialPhoneCountry = React.useMemo(() => inferPhoneCountry(state.auth.me?.phone), [state.auth.me?.phone]);
  const [phoneCountryIso, setPhoneCountryIso] = React.useState(initialPhoneCountry.iso);
  const phoneCountry = PHONE_COUNTRIES.find((c) => c.iso === phoneCountryIso) || PHONE_COUNTRIES[0];
  const [phoneDigits, setPhoneDigits] = React.useState(() => stripDialCode(state.auth.me?.phone, initialPhoneCountry));
  const [buyerName, setBuyerName] = React.useState(() => isVerifiedBuyer ? String(state.auth.me?.name || '') : '');
  const [receiveSelf, setReceiveSelf] = React.useState(false);
  const [consentLocal, setConsentLocal] = React.useState(() => Boolean(state.auth.me?.consentPersonal));
  const [deliveryEstimate, setDeliveryEstimate] = useState(null);
  const [deliveryError, setDeliveryError] = useState('');
  const [mapConfig, setMapConfig] = useState(null);
  const [addressSuggestions, setAddressSuggestions] = useState([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const mothersDayCampaignActive = isMothersDayCampaignActive();

  const productsById = useMemo(() => new Map(state.products.items.map((p) => [String(p.id), p])), [state.products.items]);
  const itemsTotal = useMemo(() => state.cart.items.reduce((sum, it) => sum + (productsById.get(String(it.productId))?.price || 0) * it.qty, 0), [productsById, state.cart.items]);
  const upsellsById = useMemo(() => new Map(state.upsells.items.map((u) => [String(u.id), u])), [state.upsells.items]);
  const upsellsTotal = useMemo(() => {
    return Object.entries(state.cart.upsells || {}).reduce((sum, [id, qty]) => sum + (Number(upsellsById.get(String(id))?.price || 0) * Number(qty || 0)), 0);
  }, [state.cart.upsells, upsellsById]);
  const recipientId = state.checkout.recipientId ?? state.recipients.selectedId;
  const selectedRecipient = useMemo(
    () => state.recipients.items.find((r) => r.id === recipientId) || null,
    [recipientId, state.recipients.items]
  );
  const [recipientName, setRecipientName] = useState(() => String(selectedRecipient?.name || ''));
  const [recipientPhone, setRecipientPhone] = useState(() => normalizeCheckoutPhone(selectedRecipient?.phone || ''));

  useEffect(() => {
    setRecipientName(String(selectedRecipient?.name || ''));
    setRecipientPhone(normalizeCheckoutPhone(selectedRecipient?.phone || ''));
  }, [selectedRecipient?.id, selectedRecipient?.name, selectedRecipient?.phone]);

  useEffect(() => {
    if (isVerifiedBuyer && state.auth.me?.name) setBuyerName(String(state.auth.me.name));
  }, [isVerifiedBuyer, state.auth.me?.name]);

  useEffect(() => {
    if (!state.checkout.address?.street && selectedRecipient?.address) {
      actions.setAddress({ street: selectedRecipient.address });
    }
  }, [actions, selectedRecipient?.address, selectedRecipient?.id, state.checkout.address?.street]);

  useEffect(() => {
    let alive = true;
    api.getDeliveryMapConfig()
      .then((config) => { if (alive) setMapConfig(config || { enabled: false }); })
      .catch(() => { if (alive) setMapConfig({ enabled: false, suggestEnabled: false, geocodeEnabled: false }); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const query = String(state.checkout.address?.street || '').trim();
    if (state.checkout.askRecipientAddress || mapConfig?.suggestEnabled !== true || query.length < 3) {
      setAddressSuggestions([]);
      setSuggestionsLoading(false);
      return undefined;
    }
    let alive = true;
    setSuggestionsLoading(true);
    const timer = window.setTimeout(() => {
      api.suggestDeliveryAddresses(query)
        .then((result) => {
          if (!alive) return;
          setAddressSuggestions(Array.isArray(result?.items) ? result.items.slice(0, 6) : []);
        })
        .catch(() => { if (alive) setAddressSuggestions([]); })
        .finally(() => { if (alive) setSuggestionsLoading(false); });
    }, 350);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [mapConfig?.suggestEnabled, state.checkout.address?.street, state.checkout.askRecipientAddress]);

  const deliveryAddress = useMemo(() => {
    const address = state.checkout.address || {};
    const primary = [address.street, address.house].map((value) => String(value || '').trim()).filter(Boolean).join(', ');
    const details = [
      address.flat ? `кв. ${String(address.flat).trim()}` : '',
      address.entrance ? `подъезд ${String(address.entrance).trim()}` : '',
      address.floor ? `этаж ${String(address.floor).trim()}` : '',
      address.comment ? String(address.comment).trim() : '',
    ].filter(Boolean).join(', ');
    return [primary || String(selectedRecipient?.address || '').trim(), details].filter(Boolean).join(', ');
  }, [selectedRecipient?.address, state.checkout.address]);

  const geocodeAddress = useMemo(() => {
    const address = state.checkout.address || {};
    return [address.street || selectedRecipient?.address, address.house]
      .map((value) => String(value || '').trim())
      .filter(Boolean)
      .join(', ');
  }, [selectedRecipient?.address, state.checkout.address]);

  useEffect(() => {
    setDeliveryEstimate(null);
    setDeliveryError('');
    actions.setDeliveryCoords(null);
    if (state.checkout.askRecipientAddress || geocodeAddress.length < 6) {
      return undefined;
    }
    let alive = true;
    const timer = setTimeout(async () => {
      try {
        const [estimateResult, geocodeResult] = await Promise.allSettled([
          api.estimateDelivery({ address: geocodeAddress }),
          mapConfig?.geocodeEnabled === true && geocodeAddress.length >= 6 ? api.geocodeDeliveryAddress(geocodeAddress) : Promise.resolve(null),
        ]);
        if (!alive) return;
        const geocoded = geocodeResult.status === 'fulfilled' ? geocodeResult.value : null;
        if (geocoded?.coords) actions.setDeliveryCoords(geocoded.coords);
        if (estimateResult.status === 'rejected') throw estimateResult.reason;
        setDeliveryEstimate(estimateResult.value);
        setDeliveryError('');
      } catch (error) {
        if (!alive) return;
        setDeliveryEstimate(null);
        const code = String(error?.data?.error || error?.message || 'DELIVERY_ESTIMATE_FAILED');
        trackAnalytics('checkout_error', { meta: { errorCode: code } });
        setDeliveryError(code);
      }
    }, 350);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [actions, geocodeAddress, mapConfig?.geocodeEnabled, state.checkout.askRecipientAddress]);

  const deliverySeparate = Boolean(state.checkout.askRecipientAddress);
  const deliveryCost = deliverySeparate ? null : (deliveryEstimate?.ok ? Number(deliveryEstimate.price || 0) : null);
  const bonusesApplied = 0;
  const total = calculateCheckoutPayment({ itemsTotal, upsellsTotal, deliveryCost, bonusesApplied, deliverySeparate });

  const senderPhone = `${phoneCountry.dial}${digitsOnly(phoneDigits)}`;
  const hasSenderPhone = isValidCheckoutPhone(senderPhone);
  const effectiveRecipientName = receiveSelf ? buyerName.trim() : recipientName.trim();
  const effectiveRecipientPhone = receiveSelf ? senderPhone : normalizeCheckoutPhone(recipientPhone);
  const hasBuyerName = isVerifiedBuyer || buyerName.trim().length >= 2;
  const hasRecipientName = effectiveRecipientName.length >= 2;
  const hasRecipientPhone = isValidCheckoutPhone(effectiveRecipientPhone);
  const deliveryTime = buildCheckoutDeliveryTime({
    askRecipientTime: state.checkout.askRecipientTime,
    date: state.checkout.deliveryDate,
    time: state.checkout.deliveryTime,
  });
  const hasDeliveryAddress = deliverySeparate || (deliveryAddress.length >= 6 && Boolean(deliveryEstimate?.ok));
  const hasDeliveryTime = state.checkout.askRecipientTime || Boolean(deliveryTime);
  const consentChecked = Boolean(state.auth.me?.consentPersonal || consentLocal);
  const canPay =
    Boolean(state.cart.items.length) &&
    hasBuyerName &&
    hasSenderPhone &&
    hasRecipientName &&
    hasRecipientPhone &&
    consentChecked &&
    hasDeliveryAddress &&
    hasDeliveryTime &&
    !submitting;

  function buildDeliveryAddress() {
    return deliverySeparate ? '' : deliveryAddress;
  }

  function buildDeliveryTime() {
    return deliveryTime;
  }

  return (
    <>
      <AppShell style={{ '--app-shell-bottom-space': '0px', '--app-shell-extra-bottom': '140px' }}>
        <div style={{ display: 'grid', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <IconButton onClick={() => navigate(-1)} aria-label="Назад">
              <ChevronLeft size={22} />
            </IconButton>
            <div style={{ minWidth: 0 }}>
              <Text variant="title">Оформление</Text>
            </div>
          </div>
        </div>

        <div data-analytics-section="checkout_form" data-analytics-placement="checkout" style={{ marginTop: 'var(--sp-6)', display: 'grid', gap: 16 }}>
          <CheckoutItemsPreview items={state.cart.items} productsById={productsById} />

          <div className="ym-hide-content">
          <RecipientDetailsBlock
            receiveSelf={receiveSelf}
            onModeChange={setReceiveSelf}
            name={recipientName}
            phone={recipientPhone}
            onNameChange={setRecipientName}
            onPhoneChange={setRecipientPhone}
            selfName={buyerName}
            selfPhone={hasSenderPhone ? `${phoneCountry.dial} ${formatPhoneDigits(phoneDigits, phoneCountry)}` : ''}
          />
          </div>

          <Surface variant="default" style={{ padding: 14, borderRadius: 'var(--r-lg)', border: '1px solid var(--border)', display: 'grid', gap: 12 }}>
            <Text variant="title">Детали доставки</Text>

            <label style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14, cursor: 'pointer' }}>
              <span>
                <Text variant="subtitle">Уточнить адрес у получателя</Text>
                <span style={{ display: 'block', marginTop: 4 }}>
                  <Text variant="caption" muted>FLOWIE свяжется с получателем. Доставка будет рассчитана и оплачена отдельно.</Text>
                </span>
              </span>
              <input className="ym-disable-keys"
                type="checkbox"
                checked={state.checkout.askRecipientAddress}
                onChange={actions.toggleAskAddress}
                style={{ width: 22, height: 22, flexShrink: 0 }}
              />
            </label>

            <div style={{ height: 1, background: 'var(--border)' }} />

            <label style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14, cursor: 'pointer' }}>
              <span>
                <Text variant="subtitle">Уточнить время у получателя</Text>
                <span style={{ display: 'block', marginTop: 4 }}>
                  <Text variant="caption" muted>FLOWIE согласует удобный интервал напрямую с получателем.</Text>
                </span>
              </span>
              <input className="ym-disable-keys"
                type="checkbox"
                checked={state.checkout.askRecipientTime}
                onChange={actions.toggleAskTime}
                style={{ width: 22, height: 22, flexShrink: 0 }}
              />
            </label>

          </Surface>

          {state.checkout.askRecipientAddress ? (
            <Surface variant="soft" style={{ padding: 14, borderRadius: 'var(--r-lg)', border: '1px solid var(--c-accent-border)', background: 'var(--c-accent-10)' }}>
              <Text variant="subtitle">Адрес уточним</Text>
              <Text variant="body" muted style={{ marginTop: 6 }}>
                Если адрес будет вне зоны бесплатной доставки, вышлем счёт на доплату.
              </Text>
            </Surface>
          ) : (
            <Surface variant="default" style={{ padding: 14, borderRadius: 'var(--r-lg)', border: '1px solid var(--border)', display: 'grid', gap: 10 }}>
              <Text variant="title">Адрес доставки</Text>
              <input className="ym-disable-keys"
                value={state.checkout.address?.street || ''}
                onChange={(event) => actions.setAddress({ street: event.target.value })}
                placeholder="Город, улица, дом"
                autoComplete="street-address"
                aria-label="Адрес доставки"
                style={{ height: 48, borderRadius: 14, border: '1px solid var(--border)', padding: '0 12px', fontSize: 16, background: 'var(--surface)' }}
              />
              {suggestionsLoading ? <Text variant="caption" muted>Ищем адрес...</Text> : null}
              {addressSuggestions.length ? (
                <div className="ym-hide-content">
                <Surface variant="soft" style={{ padding: 6, borderRadius: 14, border: '1px solid var(--border)', display: 'grid', gap: 2 }}>
                  {addressSuggestions.map((item, index) => (
                    <button
                      key={`${item.value || item.title}-${index}`}
                      type="button"
                      onClick={() => {
                        actions.setAddress({ street: item.value || item.title || '', house: '' });
                        setAddressSuggestions([]);
                      }}
                      style={{ border: 0, background: 'transparent', padding: '10px 8px', textAlign: 'left', cursor: 'pointer', borderRadius: 10 }}
                    >
                      <Text variant="subtitle">{item.title || item.value}</Text>
                      {item.subtitle ? <Text variant="caption" muted style={{ marginTop: 3 }}>{item.subtitle}</Text> : null}
                    </button>
                  ))}
                </Surface>
                </div>
              ) : null}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
                <input className="ym-disable-keys" value={state.checkout.address?.flat || ''} onChange={(event) => actions.setAddress({ flat: event.target.value })} placeholder="Квартира" aria-label="Квартира" style={{ height: 44, minWidth: 0, borderRadius: 12, border: '1px solid var(--border)', padding: '0 9px', background: 'var(--surface)' }} />
                <input className="ym-disable-keys" value={state.checkout.address?.entrance || ''} onChange={(event) => actions.setAddress({ entrance: event.target.value })} placeholder="Подъезд" aria-label="Подъезд" style={{ height: 44, minWidth: 0, borderRadius: 12, border: '1px solid var(--border)', padding: '0 9px', background: 'var(--surface)' }} />
                <input className="ym-disable-keys" value={state.checkout.address?.floor || ''} onChange={(event) => actions.setAddress({ floor: event.target.value })} placeholder="Этаж" aria-label="Этаж" style={{ height: 44, minWidth: 0, borderRadius: 12, border: '1px solid var(--border)', padding: '0 9px', background: 'var(--surface)' }} />
              </div>
              <YandexDeliveryMap config={mapConfig} coords={state.delivery.coords} />
              {deliveryError ? (
                <Text variant="caption" style={{ color: 'var(--c-accent)' }}>
                  {deliveryError === 'DELIVERY_TARIFF_NOT_CONFIGURED'
                    ? 'Тариф доставки пока не настроен. Можно выбрать уточнение адреса у получателя и оплатить доставку позже.'
                    : deliveryError === 'DELIVERY_OUTSIDE_ZONES'
                      ? 'Адрес вне наших зон доставки. Выберите уточнение у получателя — менеджер согласует возможность и стоимость доставки.'
                      : deliveryError === 'DELIVERY_ADDRESS_NOT_PRECISE'
                        ? 'Не удалось точно определить дом. Укажите город, улицу и номер дома.'
                        : 'Не удалось рассчитать доставку. Проверьте адрес или выберите уточнение у получателя.'}
                </Text>
              ) : deliveryEstimate?.ok ? (
                <div style={{ display: 'grid', gap: 4 }}><Text variant="caption" muted>Доставка {formatMoney(deliveryCost)} войдёт в текущую оплату.{deliveryEstimate.zoneName ? ` Зона: ${deliveryEstimate.zoneName}.` : ''}</Text>{deliveryEstimate.conditions ? <Text variant="caption" muted>{deliveryEstimate.conditions}</Text> : null}</div>
              ) : (
                <Text variant="caption" muted>Укажите адрес для расчёта доставки. Ручной ввод доступен даже без карты.</Text>
              )}
            </Surface>
          )}

          {state.checkout.askRecipientTime ? null : (
            <Surface variant="default" style={{ padding: 14, borderRadius: 'var(--r-lg)', border: '1px solid var(--border)', display: 'grid', gap: 10 }}>
              <Text variant="title">Время доставки</Text>
              {mothersDayCampaignActive ? <button
                type="button"
                onClick={() => actions.setDeliveryTime({ date: MOTHERS_DAY_DELIVERY_DATE, time: state.checkout.deliveryTime })}
                aria-pressed={state.checkout.deliveryDate === MOTHERS_DAY_DELIVERY_DATE}
                style={{
                  minHeight: 44,
                  padding: '0 13px',
                  borderRadius: 13,
                  border: state.checkout.deliveryDate === MOTHERS_DAY_DELIVERY_DATE ? '1px solid var(--accent)' : '1px solid var(--c-accent-border)',
                  background: state.checkout.deliveryDate === MOTHERS_DAY_DELIVERY_DATE ? 'var(--c-accent-10)' : 'var(--surface)',
                  color: 'var(--text)',
                  fontWeight: 900,
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                День матери · воскресенье, 29 ноября
              </button> : null}
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 10 }}>
                <input className="ym-disable-keys" type="date" value={state.checkout.deliveryDate || ''} onChange={(event) => actions.setDeliveryTime({ date: event.target.value, time: state.checkout.deliveryTime })} aria-label="Дата доставки" style={{ height: 48, minWidth: 0, borderRadius: 14, border: '1px solid var(--border)', padding: '0 10px', background: 'var(--surface)' }} />
                <input className="ym-disable-keys" value={state.checkout.deliveryTime || ''} onChange={(event) => actions.setDeliveryTime({ date: state.checkout.deliveryDate, time: event.target.value })} placeholder="Например, 18:00–20:00" aria-label="Интервал доставки" style={{ height: 48, minWidth: 0, borderRadius: 14, border: '1px solid var(--border)', padding: '0 10px', background: 'var(--surface)' }} />
              </div>
              {state.checkout.deliveryDate === MOTHERS_DAY_DELIVERY_DATE ? (
                <Text variant="caption" muted>Укажите удобный интервал. Если детали потребуется уточнить, FLOWIE свяжется по контакту покупателя.</Text>
              ) : null}
              {!hasDeliveryTime ? <Text variant="caption" style={{ color: 'var(--accent)' }}>Укажите дату и интервал либо выберите уточнение времени у получателя.</Text> : null}
            </Surface>
          )}

          <Surface variant="default" style={{ padding: 14, borderRadius: 'var(--r-lg)', border: '1px solid var(--border)', display: 'grid', gap: 10, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <Text variant="title">Контакт покупателя</Text>
              <ShieldCheck size={18} color="var(--accent)" />
            </div>
            {isVerifiedBuyer ? (
              <Surface variant="soft" style={{ padding: 12, borderRadius: 16, border: '1px solid var(--border)', overflow: 'hidden' }}>
                <Text variant="subtitle">{state.auth.me?.name || 'Покупатель'}</Text>
                <Text variant="body" muted style={{ marginTop: 3 }}>{state.auth.me?.phone}</Text>
                <Text variant="caption" muted>Сохранено в профиле</Text>
              </Surface>
            ) : (
              <>
                <input className="ym-disable-keys"
                  value={buyerName}
                  onChange={(event) => setBuyerName(event.target.value.slice(0, 100))}
                  placeholder="Ваше имя"
                  autoComplete="name"
                  aria-label="Имя покупателя"
                  style={{ width: '100%', height: 52, borderRadius: 16, border: hasBuyerName || !buyerName ? '1px solid var(--border)' : '1px solid var(--accent)', padding: '0 12px', background: 'var(--surface)' }}
                />
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '96px minmax(0, 1fr)',
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
                    aria-label="Страна телефона"
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
                        {country.flag} {country.iso}
                      </option>
                    ))}
                  </select>

                  <div
                    style={{
                      width: '100%',
                      height: 52,
                      minWidth: 0,
                      background: 'var(--surface)',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    <span style={{ paddingLeft: 12, fontWeight: 900, whiteSpace: 'nowrap' }}>{phoneCountry.dial}</span>
                    <input className="ym-disable-keys"
                      value={formatPhoneDigits(phoneDigits, phoneCountry)}
                      onChange={(e) => setPhoneDigits(digitsOnly(e.target.value).slice(0, phoneCountry.max))}
                      placeholder={phoneCountry.placeholder}
                      inputMode="tel"
                      aria-label="Номер телефона"
                      style={{ width: '100%', height: 52, border: 0, padding: '0 10px', fontSize: 16, outline: 'none', minWidth: 0, background: 'transparent' }}
                    />
                  </div>
                </div>
                {!hasBuyerName ? (
                  <Text variant="caption" style={{ color: 'var(--c-accent)' }}>
                    Укажите имя покупателя.
                  </Text>
                ) : null}
                {!hasSenderPhone ? (
                  <Text variant="caption" style={{ color: 'var(--c-accent)' }}>
                    Номер для связи по заказу обязателен.
                  </Text>
                ) : null}
              </>
            )}

            {state.auth.me?.consentPersonal ? null : (
              <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}>
                <input className="ym-disable-keys"
                  type="checkbox"
                  checked={consentChecked}
                  onChange={async (e) => { setConsentLocal(e.target.checked); await actions.setConsent?.(e.target.checked); }}
                  style={{ width: 20, height: 20, marginTop: 2, flexShrink: 0 }}
                />
                <span style={{ fontSize: 14, lineHeight: 1.35 }}>
                  Я согласен с политикой конфиденциальности и обработкой данных для выполнения заказа.
                </span>
              </label>
            )}
          </Surface>

          <Surface variant="default" style={{ padding: 14, borderRadius: 'var(--r-lg)', border: '1px solid var(--border)' }}>
            <Text variant="title" style={{ marginBottom: 'var(--sp-4)' }}>
              Итого
            </Text>
            <PriceBreakdown
              itemsTotal={itemsTotal}
              upsellsTotal={upsellsTotal}
              deliveryCost={deliveryCost}
              bonusesApplied={bonusesApplied}
              deliverySeparate={deliverySeparate}
            />
            {submitError ? (
              <div style={{ marginTop: 10 }}>
                <Text variant="caption" style={{ color: 'var(--c-accent)' }}>{submitError}</Text>
              </div>
            ) : null}
          </Surface>
        </div>
      </AppShell>

      <CheckoutFooterCTA
        total={total}
        disabled={!canPay}
        loading={submitting}
        onClick={async () => {
          if (!canPay) return;
          setSubmitting(true);
          setSubmitError('');
          try {
            if (!isVerifiedBuyer) {
              await actions.updateMyContact({ name: buyerName.trim(), phone: senderPhone });
            }
            const items = [];

            for (const it of state.cart.items) {
              items.push({
                productId: it.productId,
                quantity: it.qty,
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
              });
            }

            const payload = {
              items,
              deliveryAddress: buildDeliveryAddress(),
              deliveryTime: buildDeliveryTime(),
              deliveryCoords: !deliverySeparate && Number.isFinite(Number(state.delivery.coords?.lat)) && Number.isFinite(Number(state.delivery.coords?.lon))
                ? { lat: Number(state.delivery.coords.lat), lon: Number(state.delivery.coords.lon) }
                : null,
              askRecipientAddress: Boolean(state.checkout.askRecipientAddress),
              askRecipientTime: Boolean(state.checkout.askRecipientTime),
              recipientName: effectiveRecipientName,
              recipientPhone: effectiveRecipientPhone,
              paymentMethod: 'alfa',
              floristComment: state.cart.floristComment || '',
              senderPhone,
              consentPersonal: consentChecked,
            };
            const fingerprint = JSON.stringify(payload);
            const checkoutKey = getCheckoutKey(fingerprint);
            const order = await api.createOrder({ ...payload, checkoutKey });

            if (order?.id != null) actions.setActiveOrder(order.id, order?.paymentExpiresAt || null, buildActiveOrderPreview(order));
            trackAnalytics('payment_start', { orderId: order?.id });
            const payment = await api.createAlfaPayment(order?.id);
            if (payment?.alreadyPaid) {
              clearCheckoutKey(checkoutKey);
              actions.clearCart();
              navigate(`/pay/${encodeURIComponent(String(order?.id || ''))}?payment=success`);
              return;
            }
            if (!payment?.formUrl) throw new Error('ALFA_PAYMENT_URL_MISSING');
            clearCheckoutKey(checkoutKey);
            actions.clearCart();
            window.location.assign(payment.formUrl);
          } catch (e) {
            const code = String(e?.data?.error || e?.message || '').trim();
            trackAnalytics('checkout_error', { meta: { errorCode: code || 'ORDER_CREATE_FAILED' } });
            setSubmitError(code || 'Не удалось создать заказ');
          } finally {
            setSubmitting(false);
          }
        }}
      />
    </>
  );
}
