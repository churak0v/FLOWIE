'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require('sharp');
const { generateImageVariants, variantPath, SIZES } = require('../services/imageVariants');

async function main() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'flowie-images-'));
  try {
    const source = path.join(dir, 'sample.jpg');
    await sharp({ create: { width: 1600, height: 1200, channels: 3, background: '#dd4477' } }).jpeg().toFile(source);
    const hash = () => fs.readFile(source).then(data => crypto.createHash('sha256').update(data).digest('hex'));
    const before = await hash();
    const first = await generateImageVariants(source);
    assert.equal(first.created, SIZES.length * 2);
    for (const width of SIZES) for (const ext of ['avif', 'webp']) {
      const file = variantPath(source, width, ext);
      const meta = await sharp(file).metadata();
      assert.equal(meta.format, ext);
      assert.equal(meta.width, width);
      assert.ok((await fs.stat(file)).size > 0);
    }
    assert.equal((await generateImageVariants(source)).created, 0);
    assert.equal(await hash(), before);
    console.log('PASS AVIF/WebP variants, dimensions, repeatability, originals unchanged');
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
