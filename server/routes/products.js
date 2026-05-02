
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

// POST new product (Admin)
router.post('/', async (req, res) => {
    try {
        const { name, price, image, images = [], description, tags, deliveryTime } = req.body;
        if (!name || !price || !image) {
            return res.status(400).json({ error: 'name, price, image are required' });
        }
        const product = await prisma.product.create({
            data: {
                name,
                price: Number(price),
                image,
                description,
                tags,
                deliveryTime,
                images: {
                    create: Array.isArray(images) ? images.map((url) => ({ url })) : []
                }
            },
            include: { images: true }
        });
        res.json(product);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
