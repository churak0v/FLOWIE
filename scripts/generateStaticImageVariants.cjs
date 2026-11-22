'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require('sharp');

const WIDTHS = [320, 640, 1280, 1920];
const FORMATS = [
  { extension: 'avif', quality: 52, effort: 3 },
  { extension: 'webp', quality: 82, effort: 4 },
];
const PUBLIC_ROOT = path.resolve(__dirname, '..', 'public');

function isOriginalImage(name) {
  return /\.(?:jpe?g|png|webp)$/i.test(name) && !/@\d+\.(?:avif|webp)$/i.test(name);
}

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const filename = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(filename));
    else if (entry.isFile() && isOriginalImage(entry.name)) files.push(filename);
  }
  return files;
}

async function isFresh(original, dest) {
  try {
    const [source, output] = await Promise.all([fs.stat(original), fs.stat(dest)]);
    return output.size > 0 && output.mtimeMs >= source.mtimeMs;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

async function generateStaticImageVariants(source) {
  const meta = await sharp(source, { limitInputPixels: 40_000_000 }).metadata();
  if (!meta.width || !meta.height) throw new Error('INVALID_IMAGE_DIMENSIONS: ' + source);
  let created = 0;
  for (const width of WIDTHS) {
    for (const format of FORMATS) {
      const dest = source + '@' + width + '.' + format.extension;
      if (await isFresh(source, dest)) continue;
      const tmp = dest + '.tmp-' + process.pid + '-' + crypto.randomUUID();
      try {
        const pipeline = sharp(source, { limitInputPixels: 40_000_000 })
          .rotate()
          .resize({ width, fit: 'inside', withoutEnlargement: true })
          .toColourspace('srgb');
        if (format.extension === 'avif') pipeline.avif({ quality: format.quality, effort: format.effort });
        else pipeline.webp({ quality: format.quality, effort: format.effort });
        await pipeline.toFile(tmp);
        await fs.rename(tmp, dest);
        created++;
      } finally {
        await fs.unlink(tmp).catch(() => {});
      }
    }
  }
  return created;
}

async function generateAllStaticImages(directory = PUBLIC_ROOT) {
  const originals = await walk(directory);
  let variants = 0;
  for (const file of originals) {
    variants += await generateStaticImageVariants(file);
    console.log('[static-images] ' + path.relative(directory, file));
  }
  console.log('[static-images] originals=' + originals.length + ' variants=' + variants);
  return { originals: originals.length, variants };
}

if (require.main === module) {
  generateAllStaticImages().catch(err => { console.error(err); process.exitCode = 1; });
}
module.exports = { WIDTHS, generateStaticImageVariants, generateAllStaticImages };
