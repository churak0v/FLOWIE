export function formatMoney(value) {
  const amount = Math.max(0, Number(value || 0));
  return `$${Math.round(amount).toLocaleString('en-US')}`;
}
