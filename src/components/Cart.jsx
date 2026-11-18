import { useMemo } from 'react';
import { ChevronLeft } from 'lucide-react';
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

  return (
    <>
      <AppShell style={{ '--app-shell-bottom-space': '0px', '--app-shell-extra-bottom': '140px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <IconButton onClick={() => navigate(-1)} aria-label="Назад">
            <ChevronLeft size={22} />
          </IconButton>
          <Text variant="title">Корзина</Text>
        </div>

        <div style={{ marginTop: 'var(--sp-4)' }}>
          <Surface
            variant="soft"
            style={{
              padding: 14,
              borderRadius: 'var(--r-lg)',
              border: '1px solid var(--border)',
              background: 'linear-gradient(135deg, rgba(198,83,109,0.12), rgba(255,255,255,0.82))',
            }}
          >
            <Text variant="subtitle">Проверьте букет</Text>
            <Text variant="body" muted style={{ marginTop: 4 }}>
              Добавьте открытку или небольшой комплимент перед оплатой.
            </Text>
          </Surface>
        </div>

        <div style={{ marginTop: 'var(--sp-4)' }}>
          <CartItemsList
            items={state.cart.items}
            productsById={productsById}
            onDec={(pid) => {
              const current = state.cart.items.find((i) => i.productId === pid)?.qty || 1;
              const next = Math.max(1, current - 1);
              if (next < current) trackAnalytics('cart_remove', { productId: pid, meta: { quantity: current - next } });
              actions.setCartQty(pid, next);
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
