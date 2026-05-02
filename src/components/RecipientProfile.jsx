import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Calendar, Check, X } from 'lucide-react';
import { api } from '../api';
import { useAppState } from '../state/AppState';
import { AppShell } from './layout/AppShell';
import { IconButton } from './ui/IconButton';
import { Surface } from './ui/Surface';
import { Text } from './ui/Text';
import { Chip } from './ui/Chip';
import { AppImage } from './ui/AppImage';
import { ProductCard } from './domain/ProductCard';

function normalizeName(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizePhone(value) {
  return String(value || '').replace(/\D/g, '');
}

function parseDeliveryDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (/уточнить/i.test(raw)) return null;
  const iso = raw.includes(' ') ? raw.replace(' ', 'T') : raw;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    const fallback = new Date(raw);
    if (Number.isNaN(fallback.getTime())) return null;
    return fallback;
  }
  return d;
}

function isDeliveredStatus(status) {
  return String(status || '').toUpperCase() === 'DELIVERED';
}

function isCancelledStatus(status) {
  return String(status || '').toUpperCase() === 'CANCELLED';
}

function formatPlannedLabel(order) {
  const dt = parseDeliveryDate(order?.deliveryTime);
  if (dt && Number.isFinite(dt.getTime())) {
    return dt.toLocaleDateString('ru-RU', { weekday: 'long' });
  }
  const raw = String(order?.deliveryTime || '').trim();
  return raw || 'Скоро';
}

function formatDeliveredLabel(order) {
  const deliveredAt = order?.deliveredAt ? new Date(order.deliveredAt) : null;
  const dt = deliveredAt && Number.isFinite(deliveredAt.getTime()) ? deliveredAt : parseDeliveryDate(order?.deliveryTime);
  const fallback = order?.createdAt ? new Date(order.createdAt) : null;
  const final = dt && Number.isFinite(dt.getTime()) ? dt : (fallback && Number.isFinite(fallback.getTime()) ? fallback : null);
  if (final) return final.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
  const raw = String(order?.deliveryTime || '').trim();
  return raw || 'Доставлен';
}

export function RecipientProfile() {
  const navigate = useNavigate();
  const params = useParams();
  const { state, actions } = useAppState();

  const id = Number(params.id);
  const recipient = useMemo(() => state.recipients.items.find((r) => Number(r.id) === id) || null, [id, state.recipients.items]);

  const picks = useMemo(() => (state.products.items || []).slice(0, 6), [state.products.items]);
  const [orders, setOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setOrdersLoading(true);
    api
      .getOrders()
      .then((list) => {
        if (!alive) return;
        setOrders(Array.isArray(list) ? list : []);
      })
      .catch(() => {
        if (alive) setOrders([]);
      })
      .finally(() => {
        if (alive) setOrdersLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [recipient?.id]);

  const recipientOrders = useMemo(() => {
    if (!recipient) return [];
    const nameKey = normalizeName(recipient.name);
    const phoneKey = normalizePhone(recipient.phone);
    return (orders || []).filter((o) => {
      const oName = normalizeName(o?.recipientName);
      const oPhone = normalizePhone(o?.recipientPhone);
      if (nameKey && oName && nameKey === oName) return true;
      if (phoneKey && oPhone && phoneKey.slice(-10) === oPhone.slice(-10)) return true;
      return false;
    });
  }, [orders, recipient]);

  const visibleOrders = useMemo(() => {
    const filtered = recipientOrders.filter((o) => !isCancelledStatus(o?.status));
    const withDates = filtered.map((o) => {
      const dt =
        (o?.deliveredAt ? new Date(o.deliveredAt) : null) ||
        parseDeliveryDate(o?.deliveryTime) ||
        (o?.createdAt ? new Date(o.createdAt) : null);
      return { order: o, ts: dt && Number.isFinite(dt.getTime()) ? dt.getTime() : 0 };
    });
    withDates.sort((a, b) => b.ts - a.ts);
    return withDates.map((row) => row.order);
  }, [recipientOrders]);

  if (!Number.isFinite(id) || !recipient) {
    return (
      <AppShell style={{ display: 'flex', flexDirection: 'column', '--app-content-inset-bottom': '0px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Text variant="title">Профиль</Text>
        </div>

        <div style={{ flex: 1, display: 'grid', placeItems: 'center' }}>
          <Surface variant="soft" style={{ padding: 16, borderRadius: 'var(--r-lg)', border: '1px solid var(--border)', textAlign: 'center' }}>
            <Text variant="subtitle">Профиль не найден</Text>
          </Surface>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell style={{ '--app-content-inset-bottom': '0px' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <IconButton
          onClick={() => navigate(-1)}
          aria-label="Закрыть"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          <X size={18} />
        </IconButton>
      </div>

      <div style={{ marginTop: 'var(--sp-6)', display: 'grid', justifyItems: 'center' }}>
        <div
          style={{
            width: 184,
            height: 184,
            borderRadius: 'var(--r-lg)',
            overflow: 'hidden',
            border: '1px solid var(--border)',
            background: 'var(--surface)',
          }}
        >
          <AppImage
            src={recipient.image}
            alt={recipient.name}
            fallback="https://images.unsplash.com/photo-1526045612212-70caf35c14df?auto=format&fit=crop&w=900&q=80"
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        </div>

        <div style={{ marginTop: 12 }}>
          <Text variant="title" style={{ textAlign: 'center' }}>
            {recipient.name}
          </Text>
        </div>

        <button
          type="button"
          onClick={() => navigate(`/recipients/new?edit=${encodeURIComponent(String(recipient.id))}`)}
          style={{
            marginTop: 14,
            width: '100%',
            height: 54,
            borderRadius: 'var(--r-lg)',
            border: '1px solid var(--border)',
            background: 'var(--surface)',
            cursor: 'pointer',
            fontWeight: 1000,
          }}
        >
          Редактировать данные
        </button>
      </div>

      <div className="hide-scrollbar" style={{ marginTop: 'var(--sp-8)', display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 2 }}>
        <Surface
          variant="soft"
          style={{
            position: 'relative',
            flexShrink: 0,
            width: 160,
            borderRadius: 'var(--r-lg)',
            background: 'var(--c-accent-2)',
            color: 'var(--c-white)',
            padding: 14,
            border: '1px solid rgba(0,0,0,0.06)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            overflow: 'hidden',
          }}
        >
          <span
            className="ui-chip"
            style={{
              position: 'absolute',
              top: 10,
              right: 10,
              height: 24,
              padding: '0 10px',
              borderColor: 'rgba(255,255,255,0.3)',
              background: 'rgba(255,255,255,0.18)',
              color: 'var(--c-white)',
              fontSize: 11,
              fontWeight: 900,
            }}
          >
            Скоро
          </span>
          <Text variant="subtitle" style={{ color: 'var(--c-white)' }}>
            Подписка
          </Text>
          <div style={{ fontSize: 44, fontWeight: 1000, letterSpacing: -1, opacity: 0.95 }}>PASS</div>
        </Surface>

        {ordersLoading ? (
          <Surface
            variant="soft"
            style={{
              flexShrink: 0,
              width: 170,
              borderRadius: 'var(--r-lg)',
              border: '1px solid var(--border)',
              background: 'var(--bg)',
              padding: 12,
              display: 'grid',
              placeItems: 'center',
              textAlign: 'center',
            }}
          >
            <Text variant="caption" muted>
              Загружаем заказы…
            </Text>
          </Surface>
        ) : visibleOrders.length ? (
          visibleOrders.map((order) => {
            const delivered = isDeliveredStatus(order?.status);
            const image = order?.items?.[0]?.product?.image || picks[0]?.image;
            const label = delivered ? formatDeliveredLabel(order) : formatPlannedLabel(order);
            return (
              <Surface
                key={order.id}
                variant="soft"
                style={{
                  flexShrink: 0,
                  width: 170,
                  borderRadius: 'var(--r-lg)',
                  border: '1px solid var(--border)',
                  overflow: 'hidden',
                  background: 'var(--bg)',
                }}
              >
                <AppImage
                  src={image}
                  alt=""
                  style={{ width: '100%', aspectRatio: '1 / 1', objectFit: 'cover' }}
                />
                <div style={{ padding: 12 }}>
                  <Text variant="subtitle">{delivered ? 'Доставлен' : 'Запланирован'}</Text>
                  <div style={{ marginTop: 10 }}>
                    <Chip tone={delivered ? 'success' : 'accent'} icon={delivered ? <Check size={16} color="var(--success)" /> : <Calendar size={16} color="var(--accent)" />}>
                      {label}
                    </Chip>
                  </div>
                </div>
              </Surface>
            );
          })
        ) : (
          <Surface
            variant="soft"
            style={{
              flexShrink: 0,
              width: 200,
              borderRadius: 'var(--r-lg)',
              border: '1px dashed var(--border)',
              background: 'var(--bg)',
              padding: 14,
              display: 'grid',
              gap: 10,
              alignContent: 'center',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: 34, fontWeight: 1000, lineHeight: 1 }}>+</div>
            <Text variant="caption" muted>
              Пока тут пусто! Давайте порадуем букетом!
            </Text>
          </Surface>
        )}
      </div>

      <div style={{ marginTop: 'var(--sp-8)' }}>
        <Text variant="title" style={{ marginBottom: 'var(--sp-4)' }}>
          Ей может понравиться
        </Text>

        <div className="hide-scrollbar" style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 2 }}>
          {(picks || []).slice(0, 3).map((p) => (
            <div key={p.id} style={{ width: 190, flexShrink: 0 }}>
              <ProductCard
                id={p.id}
                title={p.title}
                subtitle={p.subtitle}
                price={p.price}
                image={p.image}
                onOpen={() => navigate(`/product/${p.id}`)}
                onAdd={(pid) => actions.addToCart(pid, 1)}
              />
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
