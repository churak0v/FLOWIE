export const PHOTO_MAX_BYTES = 15_000_000;
export const PHOTO_MAX_SIDE = 96;

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const TOKEN_COLORS = {
  cream: '#f3e1c4',
  blush: '#e9b8b7',
  pink: '#dc789e',
  red: '#bf3346',
  berry: '#7d294c',
  orange: '#df8743',
  yellow: '#e3c65d',
  green: '#71906d',
  blue: '#6f8ead',
  lilac: '#9a7eb1',
  white: '#f7f4ef',
};

function photoError(code) {
  return Object.assign(new Error(code), { code });
}

function rgbToHsl(red, green, blue) {
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
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

function paletteToken({ hue, saturation, lightness }) {
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

export function analyzePixelData(data) {
  if (!data || typeof data.length !== 'number' || data.length < 4) throw photoError('PHOTO_DECODE_FAILED');
  const counts = new Map();
  let samples = 0;
  let saturationTotal = 0;
  let lightnessTotal = 0;
  for (let index = 0; index + 3 < data.length; index += 4) {
    if (Number(data[index + 3]) < 180) continue;
    const hsl = rgbToHsl(Number(data[index]), Number(data[index + 1]), Number(data[index + 2]));
    const token = paletteToken(hsl);
    counts.set(token, (counts.get(token) || 0) + 1);
    samples += 1;
    saturationTotal += hsl.saturation;
    lightnessTotal += hsl.lightness;
  }
  if (!samples) throw photoError('PHOTO_EMPTY');
  const averageSaturation = saturationTotal / samples;
  const averageLightness = lightnessTotal / samples;
  const palette = [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 3)
    .map(([token]) => token);
  return {
    version: 'photo-palette-v1',
    palette,
    tone: averageSaturation < 0.24 ? 'soft' : averageSaturation > 0.58 ? 'vivid' : 'balanced',
    lightness: averageLightness > 0.68 ? 'light' : averageLightness < 0.38 ? 'dark' : 'medium',
  };
}

export function paletteTokenColor(token) {
  return TOKEN_COLORS[token] || TOKEN_COLORS.cream;
}

async function loadDrawable(file) {
  if (typeof globalThis.createImageBitmap === 'function') {
    try {
      const bitmap = await globalThis.createImageBitmap(file, { imageOrientation: 'from-image' });
      return { drawable: bitmap, width: bitmap.width, height: bitmap.height, cleanup: () => bitmap.close?.() };
    } catch {
      // Older Safari versions require the fallback below.
    }
  }
  if (typeof Image !== 'function' || typeof URL?.createObjectURL !== 'function') throw photoError('PHOTO_DECODE_UNAVAILABLE');
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.decoding = 'async';
  image.src = url;
  try {
    if (typeof image.decode === 'function') await image.decode();
    else await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; });
    return {
      drawable: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      cleanup: () => { image.src = ''; URL.revokeObjectURL(url); },
    };
  } catch {
    URL.revokeObjectURL(url);
    throw photoError('PHOTO_DECODE_FAILED');
  }
}

export async function analyzePhotoLocally(file, { maxBytes = PHOTO_MAX_BYTES, maxSide = PHOTO_MAX_SIDE } = {}) {
  if (!file || !ALLOWED_TYPES.has(String(file.type || '').toLowerCase())) throw photoError('PHOTO_TYPE_NOT_ALLOWED');
  if (!Number.isFinite(file.size) || file.size <= 0) throw photoError('PHOTO_EMPTY');
  if (file.size > maxBytes) throw photoError('PHOTO_TOO_LARGE');
  const loaded = await loadDrawable(file);
  let canvas;
  try {
    if (!loaded.width || !loaded.height) throw photoError('PHOTO_DECODE_FAILED');
    const scale = Math.min(1, maxSide / Math.max(loaded.width, loaded.height));
    const width = Math.max(1, Math.round(loaded.width * scale));
    const height = Math.max(1, Math.round(loaded.height * scale));
    canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw photoError('PHOTO_PROCESSING_UNAVAILABLE');
    context.drawImage(loaded.drawable, 0, 0, width, height);
    return analyzePixelData(context.getImageData(0, 0, width, height).data);
  } catch (error) {
    if (error?.code) throw error;
    throw photoError('PHOTO_PROCESSING_FAILED');
  } finally {
    loaded.cleanup();
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }
  }
}
