import test from 'node:test';
import assert from 'node:assert/strict';
import { createYandexMetricaGoal } from './yandexMetrica.js';

test('maps the first-party page view to a privacy-safe landing goal', () => {
  assert.deepEqual(createYandexMetricaGoal('page_view', {
    meta: {
      utm_source: 'vk_ads',
      utm_campaign: '123456789',
      utm_content: 'mother-day-video-1',
    },
    phone: '+79990000000',
  }), {
    goal: 'landing_view',
    params: {
      utm_source: 'vk_ads',
      utm_campaign: '123456789',
      utm_content: 'mother-day-video-1',
    },
  });
});

test('keeps commerce goal identifiers and revenue without arbitrary fields', () => {
  assert.deepEqual(createYandexMetricaGoal('purchase', {
    orderId: 8,
    revenue: 4590,
    deliveryAddress: 'private',
  }), {
    goal: 'purchase',
    params: { orderId: 8, revenue: 4590 },
  });
});
