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
    askRecipientAddress: true,
    askRecipientTime: true,
    deliveryAddress: 'Внутренний адрес получателя',
    deliveryTime: '18:00–20:00',
    photos: [
      { id: 1, url: '/uploads/draft.jpg', sentToClientAt: null },
      { id: 2, url: '/uploads/sent.jpg', sentToClientAt: new Date('2026-11-19T12:00:00Z') },
    ],
    deliveryInvoice: null,
  };

  const result = ordersRouter._test.publicOrder(order);

  assert.equal(result.id, 41);
  assert.equal(result.status, 'AWAITING_PAYMENT');
  assert.equal(result.paymentChargeId, undefined);
  assert.equal(result.paymentMeta, undefined);
  assert.equal(result.deliveryQuoteKey, undefined);
  assert.equal(result.deliveryQuoteDigest, undefined);
  assert.equal(result.deliveryAddress, null);
  assert.equal(result.deliveryTime, null);
  assert.equal(result.recipientDetailsReceived, true);
  assert.deepEqual(result.photos.map((photo) => photo.id), [2]);
  assert.equal(JSON.stringify(result).includes('card-form'), false);

  assert.equal(order.paymentChargeId, 'legacy-bank-order');
  assert.match(order.paymentMeta, /card-form/);
});
