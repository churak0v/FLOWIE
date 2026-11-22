'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require('sharp');

const SIZES = [320, 640, 1280];
const FORMATS = [
  { extension: 'avif', quality: 52, effort: 3 },
  { extension: 'webp', quality: 82, effort: 4 },
];

function variantPath(sourcePath, width, extension) {
  return sourcePath + '@' + width + '.' + extension;
}

async function existingFile(filename) {
  try {
    const stat = await fs.stat(filename);
    return stat.isFile() && stat.size > 0;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

async function generateImageVariants(sourcePath) {
  const ext = path.extname(sourcePath).toLowerCase();
  if (!['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
    return { skipped: true, created: 0 };
  }

  const metadata = await sharp(sourcePath, { limitInputPixels: 40_000_000 }).metadata();
  if (!metadata.width || !metadata.height) throw new Error('IMAGE_DIMENSIONS_UNAVAILABLE');

  let created = 0;
  for (const width of SIZES) {
    for (const format of FORMATS) {
      const dest = variantPath(sourcePath, width, format.extension);
      if (await existingFile(dest)) continue;

      const temp = dest + '.tmp-' + process.pid + '-' + crypto.randomUUID();
      try {
        const encoder = sharp(sourcePath, { limitInputPixels: 40_000_000 })
          .rotate()
          .resize({ width, fit: 'inside', withoutEnlargement: true })
          .toColourspace('srgb');
        if (format.extension === 'avif') encoder.avif({ quality: format.quality, effort: format.effort });
        else encoder.webp({ quality: format.quality, effort: format.effort });
        await encoder.toFile(temp);
        await fs.rename(temp, dest);
        created++;
      } finally {
        await fs.unlink(temp).catch(() => {});
      }
    }
  }
  return { skipped: created === 0, created };
}

module.exports = { generateImageVariants, variantPath, SIZES };
