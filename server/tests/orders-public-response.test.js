const test = require('node:test');
const assert = require('node:assert/strict');

const ordersRouter = require('../routes/orders');

test('public order responses omit payment provider metadata', () => {
  const order = {
    id: 41,
    status: 'AWAITING_PAYMENT',
    paymentChargeId: 'legacy-bank-order',
    paymentMeta: JSON.stringify({
      alfa: {
        orderId: 'legacy-bank-order',
        formUrl: 'https://bank.example/card-form',
      },
    }),
    deliveryQuoteKey: 'private-quote-key',
    deliveryQuoteDigest: 'private-quote-digest',
    deliveryInvoice: null,
  };

  const result = ordersRouter._test.publicOrder(order);

  assert.equal(result.id, 41);
  assert.equal(result.status, 'AWAITING_PAYMENT');
  assert.equal(result.paymentChargeId, undefined);
  assert.equal(result.paymentMeta, undefined);
  assert.equal(result.deliveryQuoteKey, undefined);
  assert.equal(result.deliveryQuoteDigest, undefined);
  assert.equal(JSON.stringify(result).includes('card-form'), false);

  assert.equal(order.paymentChargeId, 'legacy-bank-order');
  assert.match(order.paymentMeta, /card-form/);
});
