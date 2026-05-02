import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppState } from '../state/AppState';
import { AppShell } from './layout/AppShell';
import { Text } from './ui/Text';
import { CartItemsList } from './domain/CartItemsList';
import { FloristComment } from './domain/FloristComment';
import { UpsellsBlock } from './domain/UpsellsBlock';
import { BonusesBlock } from './domain/BonusesBlock';
import { PriceBreakdown } from './domain/PriceBreakdown';
import { CartFooterCTA } from './domain/CartFooterCTA';

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

  const productsById = useMemo(() => new Map(state.products.items.map((p) => [p.id, p])), [state.products.items]);
  const itemsTotal = useMemo(() => state.cart.items.reduce((sum, it) => sum + (productsById.get(it.productId)?.price || 0) * it.qty, 0), [productsById, state.cart.items]);
  const upsellsTotal = useMemo(() => calcUpsellsTotal(state.cart.upsells, state.upsells.items), [state.cart.upsells, state.upsells.items]);
  const deliveryCost = 0;
  const subtotal = itemsTotal + upsellsTotal + deliveryCost;
  const bonusesApplied = state.cart.useBonuses ? Math.min(state.auth.bonusBalance, subtotal) : 0;
  const total = Math.max(0, subtotal - bonusesApplied);

  const canContinue = state.cart.items.length > 0;

  return (
    <>
      <AppShell style={{ '--app-shell-bottom-space': '0px', '--app-shell-extra-bottom': '140px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
          <Text variant="title">Корзина</Text>
          <button
            type="button"
            onClick={() => navigate(-1)}
            style={{ border: 0, background: 'transparent', cursor: 'pointer', color: 'var(--muted)', fontWeight: 800 }}
          >
            Назад
          </button>
        </div>

        <div style={{ marginTop: 'var(--sp-6)' }}>
          <CartItemsList
            items={state.cart.items}
            productsById={productsById}
            onDec={(pid) => actions.setCartQty(pid, Math.max(1, (state.cart.items.find((i) => i.productId === pid)?.qty || 1) - 1))}
            onInc={(pid) => actions.setCartQty(pid, Math.min(99, (state.cart.items.find((i) => i.productId === pid)?.qty || 1) + 1))}
            onRemove={(pid) => actions.removeFromCart(pid)}
          />
        </div>

        <div style={{ marginTop: 'var(--sp-6)' }}>
          <FloristComment value={state.cart.floristComment} onChange={actions.setFloristComment} />
        </div>

        <div style={{ marginTop: 'var(--sp-8)' }}>
          <UpsellsBlock upsells={state.upsells.items} qtyById={state.cart.upsells} onAdd={actions.setUpsellQty} />
        </div>

        <div style={{ marginTop: 'var(--sp-6)' }}>
          <BonusesBlock balance={state.auth.bonusBalance} useBonuses={state.cart.useBonuses} onToggle={actions.toggleBonuses} />
        </div>

        <div style={{ marginTop: 'var(--sp-6)' }}>
          <PriceBreakdown itemsTotal={itemsTotal} upsellsTotal={upsellsTotal} deliveryCost={deliveryCost} bonusesApplied={bonusesApplied} />
        </div>
      </AppShell>

      <CartFooterCTA
        total={total}
        disabled={!canContinue}
        label="Продолжить"
        onClick={() => navigate('/checkout')}
      />
    </>
  );
}
