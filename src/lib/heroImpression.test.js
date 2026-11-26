import test from 'node:test';
import assert from 'node:assert/strict';
import { isActuallyVisible } from './heroImpression.js';

function fixture({ rect = { left: 0, top: 0, right: 200, bottom: 100, width: 200, height: 100 }, focused = true, visibilityState = 'visible', occluded = false, transparentOffer = false } = {}) {
  const offerChild = {};
  const heroChild = {};
  const foreground = {};
  const element = { getBoundingClientRect: () => rect, contains: (target) => target === offerChild };
  const occlusionRoot = { contains: (target) => target === offerChild || target === heroChild };
  const documentLike = {
    visibilityState,
    hasFocus: () => focused,
    elementFromPoint: () => occluded ? foreground : transparentOffer ? heroChild : offerChild,
    documentElement: { clientWidth: 200, clientHeight: 100 },
  };
  return { element, occlusionRoot, documentLike, windowLike: { innerWidth: 200, innerHeight: 100 } };
}

function visible(options) {
  const { element, occlusionRoot, documentLike, windowLike } = fixture(options);
  return isActuallyVisible(element, { documentLike, windowLike, occlusionRoot });
}

test('requires focused visible document and at least half of the offer in the viewport', () => {
  assert.equal(visible(), true);
  assert.equal(visible({ focused: false }), false);
  assert.equal(visible({ visibilityState: 'hidden' }), false);
  assert.equal(visible({ rect: { left: 0, top: 60, right: 200, bottom: 160, width: 200, height: 100 } }), false);
});

test('rejects a geometrically visible sticky offer when foreground content covers it', () => {
  assert.equal(visible({ occluded: true }), false);
});

test('transparent offer may hit the slide inside hero but not foreground outside hero', () => {
  assert.equal(visible({ transparentOffer: true }), true);
  assert.equal(visible({ transparentOffer: true, occluded: true }), false);
});
