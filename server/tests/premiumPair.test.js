const test = require('node:test');
const assert = require('node:assert/strict');
const { formatOrderMessage } = require('../services/telegramOrders');

test('set gift and its quantity are explicit in the florist order, including two sets', () => {
  const text = formatOrderMessage({ id: 42, totalPrice: 27300, items: [{ quantity: 2, price: 13650, product: { name: 'Красный дуэт', tags: 'Комплекты,offer:red-duet' } }] }, 'ORDER_PAID');
  assert.match(text, /минибукет из 3 красных роз/);
  assert.match(text, /× 2/);
  assert.match(text, /упаковать отдельно/);
});
test('ordinary flowers do not gain a gift through their name', () => {
  const text = formatOrderMessage({ id: 43, totalPrice: 15000, items: [{ quantity: 1, price: 15000, product: { name: 'Angel', tags: '' } }] }, 'ORDER_PAID');
  assert.doesNotMatch(text, /Минибукеты комплектов/);
});
