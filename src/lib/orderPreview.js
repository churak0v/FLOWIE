function pickFirstProductImage(order) {
  const firstItem = Array.isArray(order?.items) ? order.items[0] : null;
  const product = firstItem?.product || null;
  const url = product?.image || product?.images?.[0]?.url || firstItem?.image || '';
  return String(url || '').trim();
}

export function buildActiveOrderPreview(order) {
  if (!order || order.id == null) return null;

  const img = pickFirstProductImage(order);
  const items = img ? [{ product: { image: img } }] : [];

  return {
    id: order.id,
    status: order.status,
    paymentStatus: order.paymentStatus,
    paymentExpiresAt: order.paymentExpiresAt || null,
    items,
  };
}

