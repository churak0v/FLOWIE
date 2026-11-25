'use strict';

const sharp = require('sharp');

const MAX_INPUT_PIXELS = 40_000_000;
const TOKEN_COLORS = new Set(['cream', 'blush', 'pink', 'red', 'berry', 'orange', 'yellow', 'green', 'blue', 'lilac', 'white']);

function rgbToHsl(red, green, blue) {
  const r = red / 255; const g = green / 255; const b = blue / 255;
  const max = Math.max(r, g, b); const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  if (max === min) return { hue: 0, saturation: 0, lightness };
  const delta = max - min;
  const saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let hue;
  if (max === r) hue = ((g - b) / delta) + (g < b ? 6 : 0);
  else if (max === g) hue = ((b - r) / delta) + 2;
  else hue = ((r - g) / delta) + 4;
  return { hue: hue * 60, saturation, lightness };
}

function tokenFor({ hue, saturation, lightness }) {
  if (lightness > 0.9 && saturation < 0.22) return 'white';
  if (saturation < 0.16) return lightness > 0.68 ? 'cream' : 'berry';
  if ((hue >= 345 || hue < 15) && lightness > 0.72) return 'blush';
  if ((hue >= 325 || hue < 15) && lightness < 0.48) return 'berry';
  if (hue >= 345 || hue < 15) return 'red';
  if (hue < 45) return lightness > 0.72 ? 'blush' : 'orange';
  if (hue < 72) return 'yellow';
  if (hue < 165) return 'green';
  if (hue < 250) return 'blue';
  if (hue < 300) return 'lilac';
  return lightness > 0.72 ? 'blush' : 'pink';
}

function analyzeRawRgb(data) {
  const counts = new Map();
  let samples = 0; let saturationTotal = 0; let lightnessTotal = 0;
  for (let index = 0; index + 2 < data.length; index += 3) {
    const hsl = rgbToHsl(data[index], data[index + 1], data[index + 2]);
    const token = tokenFor(hsl);
    counts.set(token, (counts.get(token) || 0) + 1);
    samples += 1; saturationTotal += hsl.saturation; lightnessTotal += hsl.lightness;
  }
  if (!samples) throw Object.assign(new Error('PHOTO_EMPTY'), { code: 'PHOTO_EMPTY', status: 415 });
  const palette = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 3).map(([token]) => token).filter((token) => TOKEN_COLORS.has(token));
  const saturation = saturationTotal / samples; const lightness = lightnessTotal / samples;
  return {
    version: 'photo-palette-v1', palette,
    tone: saturation < 0.24 ? 'soft' : saturation > 0.58 ? 'vivid' : 'balanced',
    lightness: lightness > 0.68 ? 'light' : lightness < 0.38 ? 'dark' : 'medium',
  };
}

async function analyzeGiftPickerPhoto(buffer) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw Object.assign(new Error('PHOTO_EMPTY'), { code: 'PHOTO_EMPTY', status: 400 });
  let sanitized;
  let raw;
  try {
    // Re-encoding deliberately strips EXIF, GPS and the original container before analysis.
    sanitized = await sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'warning' })
      .rotate().resize({ width: 512, height: 512, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' }).toColourspace('srgb').jpeg({ quality: 82 }).toBuffer();
    const result = await sharp(sanitized, { limitInputPixels: MAX_INPUT_PIXELS })
      .resize({ width: 96, height: 96, fit: 'inside', withoutEnlargement: true })
      .removeAlpha().toColourspace('srgb').raw().toBuffer({ resolveWithObject: true });
    raw = result.data;
    if (result.info.channels !== 3) throw Object.assign(new Error('PHOTO_DECODE_FAILED'), { code: 'PHOTO_DECODE_FAILED', status: 415 });
    return analyzeRawRgb(raw);
  } catch (error) {
    if (error?.code && String(error.code).startsWith('PHOTO_')) throw error;
    throw Object.assign(new Error('PHOTO_DECODE_FAILED'), { code: 'PHOTO_DECODE_FAILED', status: 415 });
  } finally {
    if (Buffer.isBuffer(raw)) raw.fill(0);
    if (Buffer.isBuffer(sanitized)) sanitized.fill(0);
    buffer.fill(0);
  }
}

module.exports = { analyzeGiftPickerPhoto, analyzeRawRgb };
