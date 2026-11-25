import test from 'node:test';
import assert from 'node:assert/strict';
import { formatUiSizeLabel, toUiComposition, toUiSize } from './productUi.js';

test('formats factual product dimensions for storefront cards', () => {
  assert.equal(toUiSize(35, 45), '35×45');
  assert.equal(formatUiSizeLabel('35 x 45'), '35×45 см');
  assert.equal(formatUiSizeLabel('S'), '');
  assert.equal(formatUiSizeLabel(''), '');
});

test('keeps composition quantities supplied by the catalog', () => {
  assert.deepEqual(toUiComposition([
    { name: 'Роза', quantity: 15 },
    'Эвкалипт',
    { name: '', quantity: '' },
  ]), ['Роза · 15', 'Эвкалипт']);
});
