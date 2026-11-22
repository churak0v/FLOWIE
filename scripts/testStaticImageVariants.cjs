'use strict';
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const sharp = require('sharp');
const { WIDTHS, generateStaticImageVariants, generateAllStaticImages } = require('./generateStaticImageVariants.cjs');

async function main() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'flowie-static-'));
  try {
    const folder = path.join(root, 'hero');
    await fs.mkdir(folder, { recursive: true });
    const original = path.join(folder, 'hero.jpg');
    await sharp({ create: { width: 2500, height: 1500, channels: 3, background: '#cd5572' } }).jpeg().toFile(original);
    const before = crypto.createHash('sha256').update(await fs.readFile(original)).digest('hex');
    assert.equal(await generateStaticImageVariants(original), WIDTHS.length * 2);
    for (const width of WIDTHS) for (const extension of ['avif', 'webp']) {
      const name = original + '@' + width + '.' + extension;
      const metadata = await sharp(name).metadata();
      assert.equal(metadata.width, width);
      assert.equal(metadata.format, extension === 'avif' ? 'heif' : 'webp');
      if (extension === 'avif') assert.equal(metadata.compression, 'av1');
      assert.ok((await fs.stat(name)).size > 0);
    }
    assert.equal((await generateAllStaticImages(root)).originals, 1);
    assert.equal(await generateStaticImageVariants(original), 0);
    assert.equal(crypto.createHash('sha256').update(await fs.readFile(original)).digest('hex'), before);
    console.log('PASS static responsive AVIF/WebP, codec, dimensions, originals');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}
main().catch(err => { console.error(err); process.exitCode = 1; });
