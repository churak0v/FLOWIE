export function moreProductDeckCards(products, active = 0) {
  const ready = (products || []).filter(Boolean);
  const count = ready.length;
  if (!count) return [];
  const current = Math.max(0, Math.floor(Number(active) || 0)) % count;
  if (count === 1) return [{ product: ready[0], role: 'center' }];
  if (count === 2) return [{ product: ready[current], role: 'center' }, { product: ready[(current + 1) % count], role: 'right' }];
  return [
    { product: ready[(current - 1 + count) % count], role: 'left' },
    { product: ready[(current + 1) % count], role: 'right' },
    { product: ready[current], role: 'center' },
  ];
}
