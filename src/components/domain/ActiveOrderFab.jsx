import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock } from 'lucide-react';
import { useAppState } from '../../state/AppState';

export function ActiveOrderFab() {
  const { state, actions } = useAppState();
  const navigate = useNavigate();
  const orderId = state.orders.activeOrderId;
  const expiresAt = state.orders.activeOrderExpiresAt ? new Date(state.orders.activeOrderExpiresAt).getTime() : null;
  const expired = expiresAt && Date.now() > expiresAt;

  // Скрываем FAB, если карточка заказа уже показана на главной (orderId есть, но home сам рендерит карточку).
  const showFab = Boolean(orderId) && !expired && window.location?.pathname === '/';

  if (!orderId || expired) {
    if (expired) actions.clearActiveOrder();
    return null;
  }

  if (!showFab) return null;

  return (
    <button
      type="button"
      onClick={() => navigate(`/pay/${encodeURIComponent(String(orderId))}`)}
      style={{
        position: 'fixed',
        right: 'calc(12px + var(--app-inset-right))',
        bottom: 'calc(var(--app-nav-inset-bottom) + 70px)',
        zIndex: 60,
        background: 'var(--c-accent)',
        color: 'white',
        border: 0,
        borderRadius: 999,
        padding: '12px 16px',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 10,
        boxShadow: '0 10px 28px rgba(0,0,0,0.18)',
        fontWeight: 900,
        cursor: 'pointer',
      }}
      aria-label="Активный заказ"
    >
      <Clock size={18} color="white" />
      <span style={{ whiteSpace: 'nowrap' }}>Активный заказ</span>
    </button>
  );
}
