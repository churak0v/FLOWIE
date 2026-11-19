const test = require('node:test');
const assert = require('node:assert/strict');
const { isMerchantConfirmedOrder } = require('../routes/admin')._test;

test('admin operational queue accepts only merchant-confirmed captured orders', () => {
  assert.equal(isMerchantConfirmedOrder({ paymentStatus: 'CONFIRMED', paidAt: new Date() }), true);
  assert.equal(isMerchantConfirmedOrder({ paymentStatus: 'CONFIRMED', paidAt: null }), false);
  assert.equal(isMerchantConfirmedOrder({ paymentStatus: 'PENDING', paidAt: new Date() }), false);
  assert.equal(isMerchantConfirmedOrder({ paymentStatus: 'EXPIRED', paidAt: null }), false);
});
