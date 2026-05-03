import React, { useMemo } from 'react';
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
import { PaymentQuoteStrip } from './domain/PaymentQuoteStrip';

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
  const deliveryCost = 0;
  const subtotal = itemsTotal + upsellsTotal + deliveryCost;
  const bonusesApplied = 0;
  const total = Math.max(0, subtotal - bonusesApplied);

  const canContinue = validCartItemsCount > 0;

  return (
    <>
      <AppShell style={{ '--app-shell-bottom-space': '0px', '--app-shell-extra-bottom': '140px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <IconButton onClick={() => navigate(-1)} aria-label="Back">
            <ChevronLeft size={22} />
          </IconButton>
          <Text variant="title">Cart</Text>
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
            <Text variant="subtitle">Review your gift</Text>
            <Text variant="body" muted style={{ marginTop: 4 }}>
              Add a note or a small extra before checkout.
            </Text>
          </Surface>
        </div>

        <div style={{ marginTop: 'var(--sp-4)' }}>
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
          <PriceBreakdown itemsTotal={itemsTotal} upsellsTotal={upsellsTotal} deliveryCost={deliveryCost} bonusesApplied={bonusesApplied} />
        </div>

        <div style={{ marginTop: 'var(--sp-4)' }}>
          <PaymentQuoteStrip totalUsd={total} />
        </div>
      </AppShell>

      <CartFooterCTA
        total={total}
        disabled={!canContinue}
        label="Continue"
        onClick={() => navigate('/checkout')}
      />
    </>
  );
}
