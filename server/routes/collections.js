const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

function toPublicCollection(c) {
  const productIds = Array.isArray(c?.items) ? c.items.map((it) => it.productId).filter(Boolean) : [];
  return {
    id: Number(c.id),
    slug: String(c.slug || ''),
    type: String(c.type || 'thematic'),
    title: String(c.title || ''),
    description: c.description == null ? '' : String(c.description),
    sort: Number(c.sort || 0),
    productIds,
  };
}

// GET /api/collections
router.get('/', async (req, res) => {
  try {
    const rows = await prisma.collection.findMany({
      where: { isActive: true },
      include: {
        items: {
          orderBy: [{ sort: 'asc' }, { id: 'asc' }],
          select: { productId: true },
        },
      },
      orderBy: [{ sort: 'asc' }, { updatedAt: 'desc' }, { id: 'desc' }],
    });

    const all = rows.map(toPublicCollection).filter((c) => c.slug && c.title);
    const collections = all.filter((c) => c.type === 'thematic');
    const scenarios = all.filter((c) => c.type === 'scenario');

    return res.json({ ok: true, collections, scenarios });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || 'COLLECTIONS_FAILED' });
  }
});

module.exports = router;

