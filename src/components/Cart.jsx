import { useMemo } from 'react';
import { ChevronLeft, Check } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAppState } from '../state/AppState';
import { AppShell } from './layout/AppShell';
import { IconButton } from './ui/IconButton';
import { Text } from './ui/Text';
import { Surface } from './ui/Surface';
import { CartItemsList } from './domain/CartItemsList';
import { FloristComment } from './domain/FloristComment';
import { UpsellsBlock } from './domain/UpsellsBlock';
import { PriceBreakdown } from './domain/PriceBreakdown';
import { CartFooterCTA } from './domain/CartFooterCTA';
import { trackAnalytics } from '../lib/analytics';

function calcUpsellsTotal(upsellsQty, upsellsItems) {
  const byId = new Map((upsellsItems || []).map((u) => [String(u.id), u]));
  return Object.entries(upsellsQty || {}).reduce((sum, [id, qty]) => {
    const p = byId.get(String(id));
    return sum + (Number(p?.price || 0) * Number(qty || 0));
  }, 0);
}

export function Cart() {
  const navigate = useNavigate();
  const { state, actions } = useAppState();

  const productsById = useMemo(() => new Map(state.products.items.map((p) => [String(p.id), p])), [state.products.items]);
  const itemsTotal = useMemo(() => state.cart.items.reduce((sum, it) => sum + (productsById.get(String(it.productId))?.price || 0) * it.qty, 0), [productsById, state.cart.items]);
  const validCartItemsCount = useMemo(() => state.cart.items.filter((it) => productsById.get(String(it.productId))).length, [productsById, state.cart.items]);
  const upsellsTotal = useMemo(() => calcUpsellsTotal(state.cart.upsells, state.upsells.items), [state.cart.upsells, state.upsells.items]);
  const deliveryCost = null;
  const subtotal = itemsTotal + upsellsTotal;
  const bonusesApplied = 0;
  const total = Math.max(0, subtotal - bonusesApplied);

  const canContinue = validCartItemsCount > 0;
  const cartUnits = state.cart.items.reduce((sum, item) => sum + Number(item.qty || 0), 0);

  return (
    <>
      <AppShell style={{ '--app-shell-bottom-space': '0px', '--app-shell-extra-bottom': '140px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <IconButton onClick={() => navigate(-1)} aria-label="Назад">
            <ChevronLeft size={22} />
          </IconButton>
          <div>
            <Text variant="title">Корзина</Text>
            {cartUnits ? <Text variant="caption" muted>{cartUnits} {cartUnits === 1 ? 'товар' : cartUnits < 5 ? 'товара' : 'товаров'}</Text> : null}
          </div>
        </div>

        <div style={{ marginTop: 'var(--sp-4)' }}>
          <Surface
            variant="default"
            style={{
              padding: 12,
              borderRadius: 'var(--r-lg)',
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <span style={{ width: 30, height: 30, borderRadius: 999, display: 'grid', placeItems: 'center', color: 'var(--success)', background: 'var(--c-success-bg)', flexShrink: 0 }}><Check size={17} strokeWidth={3} /></span>
            <div>
              <Text variant="subtitle">Открытка и фото перед доставкой</Text>
              <Text variant="caption" muted>Включены бесплатно</Text>
            </div>
          </Surface>
        </div>

        <div data-analytics-section="cart_items" data-analytics-placement="cart" style={{ marginTop: 'var(--sp-4)' }}>
          <CartItemsList
            items={state.cart.items}
            productsById={productsById}
            onDec={(pid) => {
              const current = state.cart.items.find((i) => i.productId === pid)?.qty || 1;
              if (current <= 1) actions.removeFromCart(pid, 1);
              else {
                trackAnalytics('cart_remove', { productId: pid, meta: { quantity: 1 } });
                actions.setCartQty(pid, current - 1);
              }
            }}
            onInc={(pid) => {
              const current = state.cart.items.find((i) => i.productId === pid)?.qty || 1;
              const next = Math.min(99, current + 1);
              if (next > current) trackAnalytics('cart_add', { productId: pid, meta: { quantity: next - current } });
              actions.setCartQty(pid, next);
            }}
            onRemove={(pid) => {
              const quantity = state.cart.items.find((i) => i.productId === pid)?.qty || 1;
              actions.removeFromCart(pid, quantity);
            }}
          />
        </div>

        <div style={{ marginTop: 'var(--sp-6)' }}>
          <FloristComment value={state.cart.floristComment} onChange={actions.setFloristComment} />
        </div>

        <div style={{ marginTop: 'var(--sp-8)' }}>
          <UpsellsBlock
            upsells={state.upsells.items}
            qtyById={state.cart.upsells}
            onAdd={(productId, quantity) => {
              const current = Number(state.cart.upsells?.[String(productId)] || 0);
              const next = Number(quantity || 0);
              if (next > current) trackAnalytics('cart_add', { productId, meta: { quantity: next - current } });
              if (next < current) trackAnalytics('cart_remove', { productId, meta: { quantity: current - next } });
              actions.setUpsellQty(productId, next);
            }}
          />
        </div>

        <div style={{ marginTop: 'var(--sp-6)' }}>
          <PriceBreakdown itemsTotal={itemsTotal} upsellsTotal={upsellsTotal} deliveryCost={deliveryCost} bonusesApplied={bonusesApplied} />
        </div>
      </AppShell>

      <CartFooterCTA
        total={total}
        disabled={!canContinue}
        label="Продолжить"
        onClick={() => {
          trackAnalytics('checkout_start');
          navigate('/checkout');
        }}
      />
    </>
  );
}
