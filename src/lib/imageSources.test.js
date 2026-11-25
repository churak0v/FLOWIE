import test from 'node:test';
import assert from 'node:assert/strict';
import { imageSizes, imageVariantPlan } from './imageSources.js';
import { rememberDisplayedImage, wasImageDisplayed, imageMemoryStats } from './imageMemory.js';

test('nested imports and public banners receive real generated variant URLs', () => {
  for (const source of ['/uploads/abc-def.jpg','/uploads/flowwow-owned/abc123.jpg','/uploads/import-products/batch-id/abc.webp']) {
    const plan=imageVariantPlan(source,{buildSha:'release'});
    assert.equal(plan.kind,'upload');assert.equal(plan.widths.length,3);
    assert.ok(plan.avif.includes(source+'@640.avif 640w'));
    assert.equal(plan.fallback,source+'@640.webp');
    assert.equal(plan.original,source);
  }
  const banner=imageVariantPlan('/banners/review/basket-card.webp',{buildSha:'release'});
  assert.equal(banner.kind,'static');assert.match(banner.avif,/@640.avif\?v=release 640w/);
});

test('does not fabricate variants for external CDNs or rewrite private URLs', () => {
  assert.equal(imageVariantPlan('https://content2.flowwow-images.com/data/flowers/1000x1000/a.jpg'),null);
  assert.equal(imageVariantPlan('data:image/png;base64,test'),null);
  assert.equal(imageVariantPlan('/uploads/../private.jpg'),null);
  assert.equal(imageVariantPlan('https://flowie.art/uploads/flowwow-owned/abc.jpg').kind,'upload');
  assert.equal(imageSizes('card'),'(max-width: 430px) calc((100vw - 50px) / 2), 190px');
});

test('returning cards retain actual displayed resources and bypass native lazy deferral', () => {
  assert.equal(wasImageDisplayed('return-card'),false);
  rememberDisplayedImage('return-card',{complete:false,naturalWidth:0,src:'/broken.jpg'});
  assert.equal(wasImageDisplayed('return-card'),false);
  rememberDisplayedImage('return-card',{complete:true,naturalWidth:640,currentSrc:'/photo@640.avif'});
  assert.equal(wasImageDisplayed('return-card'),true);
  for(let i=0;i<70;i++)rememberDisplayedImage('bounded-'+i,{complete:true,naturalWidth:320,src:'/photo'+i+'@320.avif'});
  assert.ok(imageMemoryStats().retained<=32);
});
