'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { generateImageVariants } = require('../services/imageVariants');

const ORIGINAL_EXTENSION = /\.(?:jpe?g|png|webp)$/i;
const ROOT_UUID_IMAGE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:jpe?g|png|webp)$/i;
const OWNED_TREES = ['flowwow-owned', 'import-products'];

function isOriginalImage(name) {
  return ORIGINAL_EXTENSION.test(name)
    && !/@[^/]+\.(?:avif|webp)$/i.test(name)
    && !/(?:^|\.)tmp(?:-|\.|$)/i.test(name);
}

async function walkOwnedTree(directory, output) {
  try {
    const stat = await fs.lstat(directory);
    if (stat.isSymbolicLink() || !stat.isDirectory()) return;
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  let entries;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  for (const entry of entries) {
    // Dirent symlinks are neither followed as files nor traversed as directories.
    if (entry.isSymbolicLink()) continue;
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) await walkOwnedTree(filename, output);
    else if (entry.isFile() && isOriginalImage(entry.name)) output.push(filename);
  }
}

async function collectOriginalImages(uploadsDir) {
  const output = [];
  let rootEntries = [];
  try {
    rootEntries = await fs.readdir(uploadsDir, { withFileTypes: true });
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  for (const entry of rootEntries) {
    if (entry.isFile() && ROOT_UUID_IMAGE.test(entry.name) && isOriginalImage(entry.name)) {
      output.push(path.join(uploadsDir, entry.name));
    }
  }
  for (const ownedTree of OWNED_TREES) {
    await walkOwnedTree(path.join(uploadsDir, ownedTree), output);
  }
  return output.sort();
}

async function backfillImages({ uploadsDir, dryRun = false, concurrency = 2, generate = generateImageVariants, onProgress }) {
  const originals = await collectOriginalImages(uploadsDir);
  const summary = { originals: originals.length, complete: 0, failed: 0, variants: 0, failures: [] };
  let cursor = 0;
  async function worker() {
    while (cursor < originals.length) {
      const filename = originals[cursor++];
      try {
        if (!dryRun) {
          const result = await generate(filename);
          summary.variants += result.created;
        }
        summary.complete += 1;
      } catch (error) {
        summary.failed += 1;
        summary.failures.push({ filename, message: error.message });
      }
      onProgress?.(summary, filename);
    }
  }
  const workerCount = Math.max(1, Math.min(2, Number(concurrency) || 1, originals.length || 1));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return summary;
}

async function main() {
  const uploadsDir = path.join(__dirname, '..', 'uploads');
  const dryRun = process.argv.includes('--dry-run');
  const summary = await backfillImages({
    uploadsDir,
    dryRun,
    onProgress(current) {
      if ((current.complete + current.failed) % 10 === 0) {
        console.log('[backfill] ' + (current.complete + current.failed) + '/' + current.originals + ', variants=' + current.variants + ', failed=' + current.failed);
      }
    },
  });
  console.log('[backfill] originals=' + summary.originals + ', dryRun=' + dryRun);
  for (const failure of summary.failures) console.error('[backfill] failed ' + failure.filename + ': ' + failure.message);
  console.log('[backfill] complete=' + summary.complete + ', variants=' + summary.variants + ', failed=' + summary.failed);
  if (summary.failed) process.exitCode = 1;
}

if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });

module.exports = { backfillImages, collectOriginalImages, isOriginalImage };
