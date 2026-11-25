import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PRODUCT_CARD_IMAGE_RATIO,
  PRODUCT_CARD_TITLE_LINES,
  getProductCardLayout,
} from './productCardLayout.js';

test('grid product cards reserve a square image before lazy media loads', () => {
  const layout = getProductCardLayout('grid');

  assert.equal(layout.imageFrame.aspectRatio, PRODUCT_CARD_IMAGE_RATIO);
  assert.equal(layout.imageFrame.width, '100%');
  assert.deepEqual(
    { position: layout.image.position, inset: layout.image.inset, width: layout.image.width, height: layout.image.height },
    { position: 'absolute', inset: 0, width: '100%', height: '100%' }
  );
});

test('grid titles reserve exactly two lines while list cards remain fluid', () => {
  const grid = getProductCardLayout('grid');
  const list = getProductCardLayout('list');

  assert.equal(PRODUCT_CARD_TITLE_LINES, 2);
  assert.equal(grid.title.WebkitLineClamp, 2);
  assert.equal(grid.title.height, '2.32em');
  assert.equal(list.title.height, 'auto');
  assert.match(list.imageFrame.width, /^clamp\(/);
});
