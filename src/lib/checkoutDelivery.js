export function normalizeCheckoutPhone(value) {
  let digits = String(value || '').replace(/\D/g, '').slice(0, 15);
  if (digits.length === 11 && digits.startsWith('8')) digits = `7${digits.slice(1)}`;
  return digits ? `+${digits}` : '';
}

export function isValidCheckoutPhone(value) {
  const count = String(value || '').replace(/\D/g, '').length;
  return count >= 10 && count <= 15;
}

export function buildCheckoutDeliveryTime({ askRecipientTime, date, time }) {
  if (askRecipientTime) return '';
  const safeDate = String(date || '').trim();
  const safeTime = String(time || '').trim();
  return safeDate && safeTime ? `${safeDate}, ${safeTime}` : '';
}

export function calculateCheckoutPayment({ itemsTotal, upsellsTotal, deliveryCost, bonusesApplied, deliverySeparate }) {
  const products = Math.max(0, Number(itemsTotal || 0) + Number(upsellsTotal || 0));
  const delivery = deliverySeparate ? 0 : Math.max(0, Number(deliveryCost || 0));
  return Math.max(0, products + delivery - Number(bonusesApplied || 0));
}
