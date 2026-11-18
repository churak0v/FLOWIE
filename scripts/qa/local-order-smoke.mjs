// Creates clearly marked test orders on the owner's local development stack only.
/* global process, URL, fetch, console */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const origin = process.env.FLOWIE_QA_ORIGIN || 'http://127.0.0.1:6212';
assert.equal(process.env.FLOWIE_LOCAL_QA, 'true', 'Set FLOWIE_LOCAL_QA=true explicitly');
assert.ok(['localhost', '127.0.0.1'].includes(new URL(origin).hostname), 'Local stack only');
async function request(path, { method = 'GET', body, cookie = '', status = 200 } = {}) {
  const response = await fetch(`${origin}/api${path}`, {
    method, headers: { Origin: origin, 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  assert.equal(response.status, status, `${path}: ${JSON.stringify(data)}`);
  return { data, cookie: response.headers.get('set-cookie')?.split(';')[0] || cookie };
}
const staff = (await request('/admin/me')).data.user;
assert.equal(staff.staffRole, 'admin', 'Only the local development admin is permitted');
const guest = await request('/auth/guest', { method: 'POST', body: {} });
const cookie = guest.cookie;
assert.ok(cookie);
const products = (await request('/products')).data;
const product = products.find(p => p.isActive !== false && !p.isUpsell);
assert.ok(product, 'Active catalog product required');
const body = {
  checkoutKey: randomUUID(), items: [{ productId: product.id, quantity: 1 }],
  askRecipientAddress: true, askRecipientTime: true, recipientName: 'ТЕСТ FLOWIE QA',
  recipientPhone: '+79990000001', senderPhone: '+79990000002', consentPersonal: true,
  floristComment: 'ЛОКАЛЬНАЯ ПРОВЕРКА — НЕ СОБИРАТЬ И НЕ ДОСТАВЛЯТЬ',
};
const order = (await request('/orders', { method: 'POST', body, cookie, status: 201 })).data;
assert.equal(order.totalPrice, Math.max(0, product.price - (product.discount || 0)));
assert.equal(order.deliveryCost, null);
const replay = await request('/orders', { method: 'POST', body, cookie, status: 200 });
assert.equal(replay.data.id, order.id, 'Retry must not create another order');
const other = await request('/auth/guest', { method: 'POST', body: {} });
await request(`/orders/${order.id}`, { cookie: other.cookie, status: 404 });
await request(`/admin/orders/${order.id}/confirm-payment`, { method: 'POST' });
await request(`/admin/orders/${order.id}/accept`, { method: 'POST' });
await request(`/admin/orders/${order.id}/photos`, { method: 'POST', body: { url: '/upsells/gift-note.jpg' } });
const quoteBody = {
  quoteKey: randomUUID(), deliveryAddress: 'ТЕСТ — Ижевск, Пушкинская улица, 10',
  deliveryTime: 'Тестовый интервал, без фактической доставки', amount: 700,
};
const quote = await request(`/admin/orders/${order.id}/delivery-quote`, { method: 'POST', body: quoteBody, status: 201 });
const repeatedQuote = await request(`/admin/orders/${order.id}/delivery-quote`, { method: 'POST', body: quoteBody });
assert.equal(repeatedQuote.data.invoice.id, quote.data.invoice.id);
const delivery = (await request(`/payments/delivery?orderId=${order.id}`, { cookie })).data;
assert.equal(delivery.invoice.amount, 700);
assert.equal(delivery.invoice.status, 'PAYMENT_PENDING');
const blocked = await request(`/admin/orders/${order.id}/dispatch`, { method: 'POST', status: 409 });
assert.equal(blocked.data.error, 'DELIVERY_PAYMENT_REQUIRED');
await request(`/admin/orders/${order.id}/cancel`, { method: 'POST', body: { reason: 'Локальная QA-проверка завершена' } });
const cancelled = (await request(`/orders/${order.id}`, { cookie })).data.order;
assert.equal(cancelled.status, 'CANCELLED');
assert.equal(cancelled.deliveryInvoice.status, 'CANCELLED');
await request('/auth/logout', { method: 'POST', cookie, body: {} });
await request('/auth/me', { cookie, status: 401 });
console.log(JSON.stringify({ ok: true, orderId: order.id, checks: ['guest-cookie', 'server-total', 'order-idempotency', 'ownership', 'admin-processing', 'delivery-quote-idempotency', 'unpaid-dispatch-blocked', 'cancel-invoice', 'logout-revokes-session'] }));
