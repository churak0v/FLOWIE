'use strict';

const express = require('express');
const { requireAuth, requireSameOrigin } = require('../middleware/auth');
const {
  getRegistrationGiftStatus,
  recordRegistrationGiftExposure,
  fulfillRegistrationGift,
} = require('../services/registrationGift');

const STAFF_READ = new Set(['admin', 'moderator', 'florist']);
const STAFF_WRITE = new Set(['admin', 'moderator']);

function createRegistrationGiftRouter({ prisma, env = process.env, now = () => new Date() }) {
  const router = express.Router();

  router.get('/status', requireAuth, async (req, res) => {
    try {
      const user = await prisma.user.findUnique({ where: { id: req.user.id } });
      if (!user) return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });
      const status = await getRegistrationGiftStatus({ prisma, user, env });
      return res.json({ ok: true, ...status });
    } catch (error) {
      return res.status(500).json({ ok: false, error: 'REGISTRATION_GIFT_STATUS_FAILED' });
    }
  });

  router.post('/exposure', requireSameOrigin, requireAuth, async (req, res) => {
    try {
      const placement = req.body?.placement ?? null;
      if (placement !== null && !['home', 'product', 'product_details'].includes(placement)) {
        return res.status(400).json({ ok: false, error: 'BAD_PLACEMENT' });
      }
      const user = await prisma.user.findUnique({ where: { id: req.user.id } });
      if (!user) return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });
      const status = await recordRegistrationGiftExposure({ prisma, user, placement, env, now });
      return res.json({ ok: true, ...status });
    } catch (error) {
      return res.status(500).json({ ok: false, error: 'REGISTRATION_GIFT_EXPOSURE_FAILED' });
    }
  });

  return router;
}

function createRegistrationGiftAdminRouter({ prisma, now = () => new Date() }) {
  const router = express.Router();

  const staff = (roles) => async (req, res, next) => {
    try {
      if (!req.user?.id) return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });
      const user = await prisma.user.findUnique({ where: { id: req.user.id } });
      if (!user?.staffActive || !user.staffRole || !roles.has(user.staffRole)) {
        return res.status(403).json({ ok: false, error: 'FORBIDDEN' });
      }
      req.giftStaff = { id: user.id, role: user.staffRole };
      return next();
    } catch {
      return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });
    }
  };

  router.get('/', requireAuth, staff(STAFF_READ), async (req, res) => {
    try {
      const status = String(req.query.status || 'outstanding');
      if (!['outstanding', 'fulfilled', 'all'].includes(status)) {
        return res.status(400).json({ ok: false, error: 'BAD_STATUS' });
      }
      const limit = req.query.limit == null ? 50 : Number(req.query.limit);
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
        return res.status(400).json({ ok: false, error: 'BAD_LIMIT' });
      }
      const where = { claimedAt: { not: null } };
      if (status === 'outstanding') where.fulfilledAt = null;
      if (status === 'fulfilled') where.fulfilledAt = { not: null };
      const gifts = await prisma.registrationGiftLedger.findMany({
        where,
        take: limit,
        orderBy: [{ claimedAt: 'asc' }, { id: 'asc' }],
        include: {
          user: {
            select: {
              id: true,
              name: true,
              verifiedPhone: true,
            },
          },
        },
      });
      const enriched = await Promise.all(gifts.map(async (gift) => ({
        gift,
        firstEligibleOrder: gift.fulfillmentMode === 'first_order'
          ? await prisma.order.findFirst({
            where: {
              userId: gift.userId,
              paymentStatus: 'CONFIRMED',
              paidAt: { gte: gift.claimedAt },
              status: { notIn: ['CANCELLED', 'cancelled'] },
            },
            orderBy: [{ paidAt: 'asc' }, { createdAt: 'asc' }],
            select: { id: true, status: true, deliveredAt: true, createdAt: true },
          }) : null,
      })));
      return res.json({
        ok: true,
        gifts: enriched.map(({ gift, firstEligibleOrder }) => ({
          id: gift.id,
          campaignId: gift.campaignId,
          giftName: gift.giftName,
          giftQuantity: gift.giftQuantity,
          fulfillmentMode: gift.fulfillmentMode,
          exposedAt: gift.exposedAt,
          claimedAt: gift.claimedAt,
          fulfilledAt: gift.fulfilledAt,
          fulfillmentOrderId: gift.fulfillmentOrderId,
          customer: {
            id: gift.user.id,
            name: gift.user.name,
            phone: gift.verifiedPhone || gift.user.verifiedPhone,
          },
          firstEligibleOrder,
          readyToFulfill: gift.fulfillmentMode !== 'first_order'
            || ['DELIVERED', 'COMPLETED'].includes(String(firstEligibleOrder?.status || '').toUpperCase()),
        })),
      });
    } catch {
      return res.status(500).json({ ok: false, error: 'REGISTRATION_GIFT_LIST_FAILED' });
    }
  });

  router.get('/order/:orderId', requireAuth, staff(STAFF_READ), async (req, res) => {
    try {
      const orderId = Number(req.params.orderId);
      if (!Number.isSafeInteger(orderId) || orderId <= 0) {
        return res.status(400).json({ ok: false, error: 'BAD_ORDER_ID' });
      }
      const order = await prisma.order.findUnique({ where: { id: orderId }, select: { id: true, userId: true } });
      if (!order) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
      const gift = await prisma.registrationGiftLedger.findFirst({
        where: { userId: order.userId, claimedAt: { not: null }, fulfilledAt: null },
        orderBy: { claimedAt: 'asc' },
      });
      if (!gift) return res.json({ ok: true, gift: null });
      const firstPaidOrder = await prisma.order.findFirst({
        where: {
          userId: order.userId,
          paymentStatus: 'CONFIRMED',
          paidAt: { gte: gift.claimedAt },
          status: { notIn: ['CANCELLED', 'cancelled'] },
        },
        orderBy: [{ paidAt: 'asc' }, { createdAt: 'asc' }],
        select: { id: true, status: true },
      });
      if (firstPaidOrder?.id !== orderId) return res.json({ ok: true, gift: null });
      return res.json({
        ok: true,
        gift: {
          id: gift.id,
          giftName: gift.giftName,
          giftQuantity: gift.giftQuantity,
          claimedAt: gift.claimedAt,
          readyToFulfill: ['DELIVERED', 'COMPLETED'].includes(String(firstPaidOrder.status || '').toUpperCase()),
        },
      });
    } catch {
      return res.status(500).json({ ok: false, error: 'REGISTRATION_GIFT_ORDER_FAILED' });
    }
  });

  router.post('/:id/fulfill', requireSameOrigin, requireAuth, staff(STAFF_WRITE), async (req, res) => {
    try {
      const id = String(req.params.id || '').trim();
      const orderId = req.body?.orderId == null ? null : Number(req.body.orderId);
      const note = req.body?.note == null ? null : String(req.body.note).trim();
      if (!id || id.length > 100) return res.status(400).json({ ok: false, error: 'BAD_ID' });
      if (note && note.length > 300) return res.status(400).json({ ok: false, error: 'BAD_NOTE' });
      if (orderId != null && (!Number.isSafeInteger(orderId) || orderId <= 0)) {
        return res.status(400).json({ ok: false, error: 'BAD_ORDER_ID' });
      }
      const result = await fulfillRegistrationGift({
        prisma,
        giftId: id,
        orderId,
        fulfilledById: req.giftStaff.id,
        note: note || null,
        now,
      });
      if (result.error) return res.status(result.status).json({ ok: false, error: result.error });
      return res.json({ ok: true, gift: result.gift, replayed: result.replayed });
    } catch {
      return res.status(500).json({ ok: false, error: 'REGISTRATION_GIFT_FULFILL_FAILED' });
    }
  });

  return router;
}

module.exports = { createRegistrationGiftRouter, createRegistrationGiftAdminRouter };
