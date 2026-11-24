import test from 'node:test';
import assert from 'node:assert/strict';
import { isMothersDayCampaignActive, pickMothersDayPromoProduct } from './mothersDayCampaign.js';

test('shows the preorder campaign only from 25 through 29 November 2026', () => {
  assert.equal(isMothersDayCampaignActive(new Date(2026, 10, 24, 12)), false);
  assert.equal(isMothersDayCampaignActive(new Date(2026, 10, 25, 12)), true);
  assert.equal(isMothersDayCampaignActive(new Date(2026, 10, 29, 23, 59)), true);
  assert.equal(isMothersDayCampaignActive(new Date(2026, 10, 30, 0, 0)), false);
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
