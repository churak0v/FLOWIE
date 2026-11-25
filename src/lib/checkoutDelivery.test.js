import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCheckoutDeliveryTime,
  calculateCheckoutPayment,
  isValidCheckoutPhone,
  normalizeCheckoutPhone,
} from './checkoutDelivery.js';

test('normalizes and validates recipient phone', () => {
  assert.equal(normalizeCheckoutPhone('8 (999) 123-45-67'), '+79991234567');
  assert.equal(isValidCheckoutPhone('+79991234567'), true);
  assert.equal(isValidCheckoutPhone('123'), false);
});

test('omits delivery time only when recipient clarification is requested', () => {
  assert.equal(buildCheckoutDeliveryTime({ askRecipientTime: true, date: '', time: '' }), '');
  assert.equal(buildCheckoutDeliveryTime({ askRecipientTime: false, date: '2026-11-19', time: '18:00–20:00' }), '2026-11-19, 18:00–20:00');
  assert.equal(buildCheckoutDeliveryTime({ askRecipientTime: false, date: '2026-11-19', time: '' }), '');
});

test('main payment excludes delivery only when the recipient will clarify the address', () => {
  assert.equal(calculateCheckoutPayment({ itemsTotal: 5000, upsellsTotal: 700, bonusesApplied: 200, deliveryCost: 900, deliverySeparate: true }), 5500);
  assert.equal(calculateCheckoutPayment({ itemsTotal: 5000, upsellsTotal: 700, bonusesApplied: 200, deliveryCost: 900, deliverySeparate: false }), 6400);
  assert.equal(calculateCheckoutPayment({ itemsTotal: 5000, upsellsTotal: 0, bonusesApplied: 0, deliveryCost: null, deliverySeparate: true }), 5000);
});
