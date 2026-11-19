const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
let prisma = new PrismaClient();
const { requireAuth } = require('../middleware/auth');
const { OrderCreationError, createOrder } = require('../services/orderCreation');
const { recordServerEventSafe } = require('../services/analytics');
const { publicDeliveryInvoice } = require('../services/deliveryPayment');

function publicOrder(order) {
    const safe = { ...order };
    delete safe.deliveryQuoteKey;
    delete safe.deliveryQuoteDigest;
    // Provider identifiers and raw metadata are server-side only. Historical
    // metadata may contain a card payment form URL, so never expose either
    // field through customer order endpoints.
    delete safe.paymentChargeId;
    delete safe.paymentMeta;
    const recipientDetailsRequested = Boolean(order.askRecipientAddress || order.askRecipientTime);
    safe.recipientDetailsReceived = recipientDetailsRequested &&
        (!order.askRecipientAddress || Boolean(String(order.deliveryAddress || '').trim())) &&
        (!order.askRecipientTime || Boolean(String(order.deliveryTime || '').trim()));
    if (order.askRecipientAddress) safe.deliveryAddress = null;
    if (order.askRecipientTime) safe.deliveryTime = null;
    if (Array.isArray(order.photos)) {
        safe.photos = order.photos.filter((photo) => Boolean(photo?.sentToClientAt));
    }
    safe.deliveryInvoice = publicDeliveryInvoice(order.deliveryInvoice);
    return safe;
}

// GET orders (with filters support for Admin)
router.get('/', requireAuth, async (req, res) => {
    try {
        const { status, statuses, date } = req.query;
        const where = { userId: req.user.id };

        if (statuses) {
            const arr = String(statuses).split(',').map((s) => s.trim()).filter(Boolean);
            if (arr.length) where.status = { in: arr };
        } else if (status) {
            where.status = status;
        }

        // Simple date filtering can be enhanced
        if (date === 'Today') {
            const start = new Date();
            start.setHours(0, 0, 0, 0);
            where.createdAt = { gte: start };
        }

        const orders = await prisma.order.findMany({
            where,
            include: { items: { include: { product: true } }, user: true, deliveryInvoice: true },
            orderBy: { createdAt: 'desc' }
        });
        res.json(orders.map(publicOrder));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET order by id (client)
router.get('/:id', requireAuth, async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isFinite(id)) return res.status(400).json({ error: 'BAD_ID' });

        const order = await prisma.order.findFirst({
            where: { id, userId: req.user.id },
            include: { items: { include: { product: true } }, user: true, photos: true, deliveryInvoice: true },
        });
        if (!order) return res.status(404).json({ error: 'NOT_FOUND' });
        return res.json({ ok: true, order: publicOrder(order) });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
});

// Client cancel order
router.post('/:id/cancel', requireAuth, async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: 'BAD_ID' });

        const order = await prisma.order.findFirst({ where: { id, userId: req.user.id } });
        if (!order) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
        const st = String(order.status || '').toUpperCase();
        if (['DELIVERED', 'CANCELLED'].includes(st)) return res.status(400).json({ ok: false, error: 'ALREADY_FINISHED' });

        const updated = await prisma.$transaction(async (tx) => {
            const up = await tx.order.update({
                where: { id },
                data: { status: 'CANCELLED', cancelReason: 'CLIENT_CANCEL' },
            });
            await tx.orderStatusHistory.create({ data: { orderId: id, status: 'CANCELLED', actorId: req.user.id } });
            return up;
        });

        return res.json({ ok: true, order: { id: updated.id, status: updated.status } });
    } catch (e) {
        return res.status(500).json({ ok: false, error: e?.message || 'CANCEL_FAILED' });
    }
});

// Client rates pre-delivery photo
router.post('/:id/photo-rating', requireAuth, async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: 'BAD_ID' });
        const rating = String(req.body?.rating || '').toUpperCase();
        if (rating !== 'UP' && rating !== 'DOWN') return res.status(400).json({ ok: false, error: 'BAD_RATING' });

        const order = await prisma.order.findFirst({ where: { id, userId: req.user.id } });
        if (!order) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });

        if (String(order.status || '').toUpperCase() !== 'ASSEMBLED') {
            return res.status(409).json({ ok: false, error: 'ORDER_NOT_ASSEMBLED' });
        }
        if (order.preDeliveryRating) {
            return res.status(409).json({ ok: false, error: 'PHOTO_ALREADY_RATED' });
        }
        const sentPhoto = await prisma.orderPhoto.findFirst({
            where: { orderId: id, sentToClientAt: { not: null } },
            select: { id: true },
        });
        if (!sentPhoto) return res.status(409).json({ ok: false, error: 'PHOTO_NOT_SENT' });

        const ratedAt = new Date();
        const claimed = await prisma.order.updateMany({
            where: { id, userId: req.user.id, status: 'ASSEMBLED', preDeliveryRating: null },
            data: { preDeliveryRating: rating, preDeliveryRatedAt: ratedAt },
        });
        if (claimed.count !== 1) {
            return res.status(409).json({ ok: false, error: 'PHOTO_ALREADY_RATED' });
        }

        return res.json({ ok: true, order: { id, preDeliveryRating: rating, preDeliveryRatedAt: ratedAt } });
    } catch (e) {
        return res.status(500).json({ ok: false, error: e?.message || 'PHOTO_RATE_FAILED' });
    }
});

// POST create order
router.post('/', requireAuth, async (req, res) => {
    try {
        const result = await createOrder({ prisma, userId: req.user.id, body: req.body });
        // Deterministic eventId makes this safe on an idempotent checkout replay and repairs a prior best-effort failure.
        await recordServerEventSafe(prisma, {
            event: 'order_created',
            userId: req.user.id,
            orderId: result.order.id,
        });
        return res.status(result.replayed ? 200 : 201).json(publicOrder(result.order));
    } catch (error) {
        if (error instanceof OrderCreationError) {
            return res.status(error.status).json({ error: error.code });
        }
        console.error('Order creation failed:', error?.message || error);
        return res.status(500).json({ error: 'ORDER_CREATE_FAILED' });
    }
});

module.exports = router;
module.exports._test = {
    publicOrder,
    setPrisma(client) {
        prisma = client;
    },
};
