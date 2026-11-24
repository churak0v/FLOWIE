import test from 'node:test';
import assert from 'node:assert/strict';
import { isMothersDayCampaignActive } from './mothersDayCampaign.js';

test('shows the preorder campaign only from 25 through 29 November 2026', () => {
  assert.equal(isMothersDayCampaignActive(new Date(2026, 10, 24, 12)), false);
  assert.equal(isMothersDayCampaignActive(new Date(2026, 10, 25, 12)), true);
  assert.equal(isMothersDayCampaignActive(new Date(2026, 10, 29, 23, 59)), true);
  assert.equal(isMothersDayCampaignActive(new Date(2026, 10, 30, 0, 0)), false);
});
