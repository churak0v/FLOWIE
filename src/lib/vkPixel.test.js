import test from 'node:test';
import assert from 'node:assert/strict';
import { createVkPixelCommand } from './vkPixel.js';

test('builds official VK goal commands without personal data', () => {
  assert.deepEqual(createVkPixelCommand('landing_view', {
    meta: { utm_campaign: '123456789', utm_content: 'mother-day-video-1' },
  }, '3817937'), {
    id: '3817937',
    type: 'reachGoal',
    goal: 'landing_view',
    params: { utm_campaign: '123456789', utm_content: 'mother-day-video-1' },
  });
  assert.deepEqual(createVkPixelCommand('product_view', { productId: 42 }, '3817937'), {
    id: '3817937',
    type: 'reachGoal',
    goal: 'product_view',
    params: { product_id: '42' },
  });
  assert.deepEqual(createVkPixelCommand('purchase', {
    orderId: 8,
    revenue: 4590,
    meta: { utm_source: 'vk_ads', utm_campaign: '123456789', utm_content: 'mother-day-video-1' },
    phone: '+79990000000',
  }, '3817937'), {
    id: '3817937',
    type: 'reachGoal',
    goal: 'purchase',
    value: 4590,
    params: {
      order_id: '8',
      utm_source: 'vk_ads',
      utm_campaign: '123456789',
      utm_content: 'mother-day-video-1',
    },
  });
});
