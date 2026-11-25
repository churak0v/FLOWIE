'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const { analyzeGiftPickerPhoto } = require('../services/giftPickerPhoto');

test('secure photo analysis returns controlled tokens and zeroes the input buffer', async () => {
  const input = await sharp({ create: { width: 12, height: 12, channels: 3, background: '#df7ba0' } })
    .withMetadata({ orientation: 6 }).png().toBuffer();
  const result = await analyzeGiftPickerPhoto(input);
  assert.equal(result.version, 'photo-palette-v1');
  assert.ok(result.palette.includes('pink') || result.palette.includes('blush'));
  assert.deepEqual([...input], new Array(input.length).fill(0));
  assert.deepEqual(Object.keys(result).sort(), ['lightness', 'palette', 'tone', 'version']);
});

test('secure photo analysis rejects invalid bytes without retaining them', async () => {
  const input = Buffer.from('not-an-image');
  await assert.rejects(() => analyzeGiftPickerPhoto(input), (error) => error.code === 'PHOTO_DECODE_FAILED');
  assert.deepEqual([...input], new Array(input.length).fill(0));
});
