'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { generateImageVariants } = require('../services/imageVariants');

async function main() {
  const dir = path.join(__dirname, '..', 'uploads');
  const dryRun = process.argv.includes('--dry-run');
  const names = (await fs.readdir(dir)).filter(name =>
    /^[0-9a-f-]+\.(?:jpg|jpeg|png|webp)$/i.test(name)
  ).sort();
  console.log('[backfill] originals=' + names.length + ', dryRun=' + dryRun);
  let complete = 0, failed = 0, variants = 0;
  for (const name of names) {
    try {
      if (!dryRun) {
        const result = await generateImageVariants(path.join(dir, name));
        variants += result.created;
      }
      complete++;
      if ((complete + failed) % 10 === 0)
        console.log('[backfill] ' + (complete + failed) + '/' + names.length + ', variants=' + variants + ', failed=' + failed);
    } catch (err) {
      failed++;
      console.error('[backfill] failed ' + name + ': ' + err.message);
    }
  }
  console.log('[backfill] complete=' + complete + ', variants=' + variants + ', failed=' + failed);
  if (failed) process.exitCode = 1;
}
main().catch(error => { console.error(error); process.exitCode = 1; });
