import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getMothersDayPriceTiers,
  getMothersDayDeliveryDateSuggestion,
  hasMothersDayCampaignEnded,
  isMothersDayCampaignActive,
  pickMothersDayPromoProduct,
  selectMothersDayProducts,
} from './mothersDayCampaign.js';

test('shows the preorder campaign only from 25 through 29 November 2026', () => {
  assert.equal(isMothersDayCampaignActive(new Date(2026, 10, 24, 12)), false);
  assert.equal(isMothersDayCampaignActive(new Date(2026, 10, 25, 12)), true);
  assert.equal(isMothersDayCampaignActive(new Date(2026, 10, 29, 23, 59)), true);
  assert.equal(isMothersDayCampaignActive(new Date(2026, 10, 30, 0, 0)), false);
});

test('redirect cutoff starts after 29 November, not during the delivery day', () => {
  assert.equal(hasMothersDayCampaignEnded(new Date(2026, 10, 29, 23, 59)), false);
  assert.equal(hasMothersDayCampaignEnded(new Date(2026, 10, 30, 0, 0)), true);
});

test('suggests 29 November only when the customer has not selected a date', () => {
  assert.equal(getMothersDayDeliveryDateSuggestion(''), '2026-11-29');
  assert.equal(getMothersDayDeliveryDateSuggestion('2026-11-28'), '2026-11-28');
});

test('starts with active value offers, then uses the curated collection and configured fallback ids', () => {
  const products = [
    { id: 75, title: 'Value offer', price: 3_000, image: '/75.jpg' },
    { id: 70, title: 'Inactive value offer', price: 3_790, image: '/70.jpg', isActive: false },
    { id: 55, title: 'Fallback', price: 4_000, image: '/55.jpg' },
    { id: 3, title: 'Third', price: 7_000, image: '/3.jpg' },
    { id: 2, title: 'Second', price: 5_000, image: '/hero.jpg' },
    { id: 20, title: 'Inactive', price: 6_000, image: '/20.jpg', isActive: false },
    { id: 999, title: 'Not configured', price: 3_000, image: '/999.jpg' },
  ];
  const collections = [{ slug: 'день-матери', productIds: [3, 2, 20] }];

  assert.deepEqual(selectMothersDayProducts(products, collections, '/hero.jpg').map((product) => product.id), [75, 3, 55]);
});

test('builds only populated price tiers from actual selected prices', () => {
  assert.deepEqual(
    getMothersDayPriceTiers([{ price: 4_999 }, { price: 5_000 }, { price: 6_000 }, { price: 7_000 }]).map(({ id, count }) => ({ id, count })),
    [{ id: 'under-5000', count: 2 }, { id: '5001-6999', count: 1 }, { id: 'from-7000', count: 1 }]
  );
});

test('selects a distinct active catalog image for the secondary banner', () => {
  const products = [
    { id: 1, name: 'Букет роз', image: '/hero.jpg', isActive: true },
    { id: 2, name: 'Авторский букет из кустовых роз и эустомы', image: '/catalog-author.jpg', isActive: true },
    { id: 3, name: 'Авторский букет из эустомы', image: '/inactive.jpg', isActive: false },
    { id: 4, name: 'Авторская открытка', image: '/upsell.jpg', isActive: true, isUpsell: true },
  ];

  assert.equal(pickMothersDayPromoProduct(products, '/hero.jpg')?.id, 2);
  assert.equal(pickMothersDayPromoProduct([{ image: '/hero.jpg', isActive: true }], '/hero.jpg'), null);
});
