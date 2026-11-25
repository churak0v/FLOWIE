'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');

function cleanName(value) {
  return String(value || 'Букет')
    .replace(/\((?:предварительный вариант|черновик)\)/gi, ' ')
    .replace(/(^|\s)(черновик|предположительно)(?=\s|$)/gi, ' ')
    .replace(/\s{2,}/g, ' ').trim().replace(/^[—–-]+\s*|\s*[—–-]+$/g, '').trim().slice(0, 240) || 'Букет';
}

function safeSegment(value) {
  return String(value).replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 80) || 'import';
}

function descriptionFor(draft) {
  const flowers = [...new Set((draft.likely_flowers || []).map((item) => String(item).trim()).filter(Boolean))].slice(0, 12);
  if (flowers.length) return `Возможный состав: ${flowers.join(', ')}. Состав и количество уточняются флористом.`;
  const proposal = [...new Set((draft.compositionProposal || []).map((item) => String(item?.name || '').trim()).filter(Boolean))].slice(0, 12);
  return proposal.length ? `Возможный состав: ${proposal.join(', ')}. Состав и количество уточняются флористом.` : 'Состав и количество уточняются флористом.';
}

async function derivativeFor({ buffer, importId, uploadsDir }) {
  const webp = await sharp(buffer, { limitInputPixels: 40_000_000, failOn: 'warning' })
    .rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
    .flatten({ background: '#ffffff' }).toColourspace('srgb').webp({ quality: 85 }).toBuffer();
  const hash = crypto.createHash('sha256').update(webp).digest('hex');
  const relativeDir = path.join('import-products', safeSegment(importId));
  const directory = path.join(uploadsDir, relativeDir);
  const filename = `${hash}.webp`;
  const destination = path.join(directory, filename);
  await fs.mkdir(directory, { recursive: true });
  try { await fs.access(destination); } catch {
    const temporary = `${destination}.tmp-${process.pid}-${crypto.randomUUID()}`;
    try { await fs.writeFile(temporary, webp, { flag: 'wx', mode: 0o644 }); await fs.rename(temporary, destination); }
    finally { await fs.unlink(temporary).catch(() => {}); }
  }
  return `/uploads/${relativeDir.split(path.sep).join('/')}/${filename}`;
}

async function materializeBouquetProductDrafts({ prisma, storage, importId, uploadsDir = path.join(__dirname, '..', 'uploads') }) {
  if (!prisma || !storage || !importId) throw new TypeError('BOUQUET_PRODUCT_DRAFT_CONFIG');
  const snapshot = await prisma.bouquetImportBatch.findUnique({ where: { id: importId } });
  if (!snapshot) throw new Error('BOUQUET_IMPORT_NOT_FOUND');
  const files = new Map((snapshot.state?.files || []).map((file) => [String(file.id), file]));
  const cachedUrls = snapshot.state?.productImageUrls || {};
  const newCachedUrls = {};
  const plans = [];
  for (const draft of snapshot.state?.drafts || []) {
    if (draft.mergedInto) continue;
    const urls = [];
    for (const photoId of [...new Set((draft.photoIds || []).map(String))]) {
      const file = files.get(photoId);
      if (!file?.storageKey || file.status !== 'STORED') continue;
      if (cachedUrls[photoId]) { urls.push(cachedUrls[photoId]); continue; }
      const stored = await storage.get(file.storageKey);
      const url = await derivativeFor({ buffer: stored.buffer, importId, uploadsDir });
      newCachedUrls[photoId] = url;
      urls.push(url);
    }
    const distinctUrls = [...new Set(urls)];
    if (distinctUrls.length) plans.push({ customId: draft.customId, productId: draft.productId || null, urls: distinctUrls });
  }

  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', String(importId));
    const latest = await tx.bouquetImportBatch.findUnique({ where: { id: importId } });
    if (!latest) throw new Error('BOUQUET_IMPORT_NOT_FOUND');
    const state = JSON.parse(JSON.stringify(latest.state || {}));
    state.productImageUrls = { ...(state.productImageUrls || {}), ...newCachedUrls };
    const created = [];
    let appendedImages = 0;
    for (const plan of plans) {
      const draft = (state.drafts || []).find((item) => item.customId === plan.customId);
      if (!draft || draft.mergedInto) continue;
      if (draft.productId) {
        const product = await tx.product.findUnique({ where: { id: draft.productId }, include: { images: true } });
        if (!product) continue;
        const existing = new Set([product.image, ...(product.images || []).map((image) => image.url)]);
        const missing = plan.urls.filter((url) => !existing.has(url));
        if (missing.length) {
          const start = Math.max(0, ...(product.images || []).map((image) => Number(image.sort) || 0));
          await tx.product.update({ where: { id: product.id }, data: { images: { create: missing.map((url, index) => ({ url, sort: start + index + 1 })) } } });
          appendedImages += missing.length;
        }
        continue;
      }
      const recipe = draft.recipeId ? await tx.bouquetRecipe.findUnique({ where: { id: draft.recipeId } }) : null;
      const confirmedLines = recipe?.confirmedAt && Array.isArray(recipe.lines) ? recipe.lines : [];
      const composition = confirmedLines.map((line, index) => ({
        name: String(line.name || '').trim(),
        quantity: `${line.quantity} ${line.unit || ''}`.trim(),
        sort: index + 1,
      })).filter((line) => line.name && line.quantity);
      const product = await tx.product.create({ data: {
        name: cleanName(draft.draft_name),
        price: 0,
        discount: 0,
        image: plan.urls[0],
        description: descriptionFor(draft),
        tags: '',
        isActive: false,
        images: { create: plan.urls.map((url, index) => ({ url, sort: index + 1 })) },
        composition: { create: composition },
      } });
      draft.productId = product.id;
      if (recipe && !recipe.productId) await tx.bouquetRecipe.update({ where: { id: recipe.id }, data: { productId: product.id } });
      created.push(product);
    }
    await tx.bouquetImportBatch.update({ where: { id: importId }, data: { state } });
    return { created, createdCount: created.length, appendedImages };
  });
}

module.exports = { materializeBouquetProductDrafts };
