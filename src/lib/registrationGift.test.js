import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeRegistrationGiftStatus,
  shouldShowRegistrationGiftAccountStatus,
  shouldShowRegistrationGift,
} from './registrationGift.js';

test('disabled or ineligible campaigns never render an offer', () => {
  assert.equal(shouldShowRegistrationGift(normalizeRegistrationGiftStatus({ enabled: false, eligible: true })), false);
  assert.equal(shouldShowRegistrationGift(normalizeRegistrationGiftStatus({ enabled: true, eligible: false })), false);
});

test('claimed gift is hidden while fulfillment remains server-visible', () => {
  const status = normalizeRegistrationGiftStatus({ enabled: true, eligible: true, exposed: true, claimed: true, fulfilled: false });
  assert.equal(shouldShowRegistrationGift(status), false);
  assert.equal(shouldShowRegistrationGiftAccountStatus(status), true);
  assert.equal(status.fulfilled, false);
});

test('existing verified customer without a campaign claim has no gift status', () => {
  const status = normalizeRegistrationGiftStatus({ enabled: true, eligible: false, exposed: false, claimed: false, fulfilled: false });
  assert.equal(shouldShowRegistrationGift(status), false);
  assert.equal(shouldShowRegistrationGiftAccountStatus(status), false);
});

test('an existing claim remains visible after campaign acquisition is disabled', () => {
  const status = normalizeRegistrationGiftStatus({ enabled: false, eligible: false, claimed: true, fulfilled: false });
  assert.equal(shouldShowRegistrationGiftAccountStatus(status), true);
});

test('campaign copy is normalized and cannot enable an offer by itself', () => {
  const status = normalizeRegistrationGiftStatus({ campaign: { id: 7, title: 'Дарим подарок', terms: 'Условия' } });
  assert.deepEqual(status.campaign, { id: '7', title: 'Дарим подарок', body: 'Условия', terms: 'Условия', ctaLabel: '' });
  assert.equal(shouldShowRegistrationGift(status), false);
});

