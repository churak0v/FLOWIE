import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzePixelData, paletteTokenColor } from './photoPalette.js';

test('extracts controlled palette tokens without retaining raw pixels', () => {
  const pixels = new Uint8ClampedArray([
    245, 238, 224, 255,
    244, 235, 220, 255,
    214, 93, 137, 255,
    116, 39, 75, 255,
  ]);
  const result = analyzePixelData(pixels);
  assert.equal(result.version, 'photo-palette-v1');
  assert.ok(result.palette.length >= 1 && result.palette.length <= 3);
  assert.ok(result.palette.every((token) => typeof paletteTokenColor(token) === 'string'));
  assert.equal('pixels' in result, false);
  assert.equal('face' in result, false);
});

test('ignores transparent pixels and rejects an empty image', () => {
  assert.throws(() => analyzePixelData(new Uint8ClampedArray([255, 0, 0, 0])), (error) => error.code === 'PHOTO_EMPTY');
});
