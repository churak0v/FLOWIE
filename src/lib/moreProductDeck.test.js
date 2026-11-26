import test from 'node:test';
import assert from 'node:assert/strict';
import { moreProductDeckCards } from './moreProductDeck.js';
test('loading and partial photo readiness never create undefined cards', () => {
  assert.deepEqual(moreProductDeckCards([]), []);
  for (let count = 1; count <= 4; count++) {
    const products = Array.from({length:count}, (_,i)=>({id:i+1}));
    for (let active = 0; active < 8; active++) {
      const cards = moreProductDeckCards(products,active);
      assert.equal(cards.length, Math.min(count,3));
      assert.ok(cards.every(card=>products.includes(card.product)));
      assert.equal(new Set(cards.map(card=>card.product.id)).size,cards.length);
      assert.equal(cards.filter(card=>card.role==='center').length,1);
    }
  }
});
test('fan keeps the current product central and changes it when cycling', () => {
  const products = [{id:1},{id:2},{id:3},{id:4}];
  assert.equal(moreProductDeckCards(products,0).find(card=>card.role==='center').product.id,1);
  assert.equal(moreProductDeckCards(products,1).find(card=>card.role==='center').product.id,2);
});
