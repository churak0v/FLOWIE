
const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// GET all products
router.get('/', async (req, res) => {
    try {
        const kindRaw = String(req.query?.kind || 'main').toLowerCase();
        const kind = ['main', 'upsell', 'all'].includes(kindRaw) ? kindRaw : 'main';

        const where = { isActive: true };
        if (kind === 'main') where.isUpsell = false;
        if (kind === 'upsell') where.isUpsell = true;

        const products = await prisma.product.findMany({
            where,
            include: {
                images: { orderBy: [{ sort: 'asc' }, { createdAt: 'asc' }] },
                composition: { orderBy: [{ sort: 'asc' }, { createdAt: 'asc' }] },
            },
            orderBy:
                kind === 'upsell'
                    ? [{ upsellSort: 'asc' }, { updatedAt: 'desc' }, { id: 'desc' }]
                    : [{ sort: 'asc' }, { createdAt: 'desc' }, { id: 'desc' }],
        });
        res.json(products);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET product by id (client)
router.get('/:id', async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isFinite(id)) return res.status(400).json({ error: 'BAD_ID' });

        const product = await prisma.product.findFirst({
            where: { id, isActive: true },
            include: {
                images: { orderBy: [{ sort: 'asc' }, { createdAt: 'asc' }] },
                composition: { orderBy: [{ sort: 'asc' }, { createdAt: 'asc' }] },
            },
        });
        if (!product) return res.status(404).json({ error: 'NOT_FOUND' });
        return res.json(product);
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
});

// Catalog writes are available only through /api/admin/products, which enforces staff roles.
router.post('/', (_req, res) => res.status(405).json({ error: 'METHOD_NOT_ALLOWED' }));

module.exports = router;
