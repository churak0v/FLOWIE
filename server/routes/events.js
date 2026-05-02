const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { validate, parse } = require('@tma.js/init-data-node');

const router = express.Router();
const prisma = new PrismaClient();

function getBotToken() {
  const token = process.env.BOT_TOKEN || process.env.ADMIN_BOT_TOKEN;
  if (!token) throw new Error('BOT_TOKEN_NOT_SET');
  return token;
}

function getInitDataFromHeader(req) {
  const raw = req.headers['x-tg-initdata'];
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw)) return raw[0] || '';
  return '';
}

function normalizeRefTag(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  return raw
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 64);
}

// POST /api/events
// Minimal analytics ingestion for admin "КЭШ" dashboards.
router.post('/', async (req, res) => {
  try {
    // Identify user either via initData (Telegram WebApp) or auth cookie.
    let userId = null;
    try {
      const initData = getInitDataFromHeader(req);
      if (initData) {
        validate(initData, getBotToken(), { expiresIn: 86400 });
        const data = parse(initData);
        const tgUser = data.user;
        if (tgUser?.id) {
          const user = await prisma.user.upsert({
            where: { telegramId: String(tgUser.id) },
            update: {},
            create: { telegramId: String(tgUser.id) },
          });
          userId = user.id;
        }
      } else if (req.user?.id) {
        userId = req.user.id;
      }
    } catch {
      // ignore identification errors; events are best-effort
    }

    const event = String(req.body?.event || '').trim();
    if (!event) return res.status(400).json({ ok: false, error: 'NO_EVENT' });

    const productId = req.body?.productId == null ? null : Number(req.body.productId);
    const orderId = req.body?.orderId == null ? null : Number(req.body.orderId);
    const meta = req.body?.meta == null ? null : req.body.meta;

    try {
      console.info('[event]', { userId, event, productId, orderId, meta });
    } catch {
      // ignore
    }

    await prisma.analyticsEvent.create({
      data: {
        userId,
        event,
        productId: Number.isFinite(productId) ? productId : null,
        orderId: Number.isFinite(orderId) ? orderId : null,
        meta: meta == null ? undefined : meta,
      },
    });

    if (event === 'ref_open') {
      const tag = normalizeRefTag(meta?.tag || '');
      if (tag) {
        const link = await prisma.referralLink.upsert({
          where: { tag },
          update: { updatedAt: new Date() },
          create: { tag, autoCreated: true, isActive: true },
        });

        await prisma.referralOpen.create({
          data: {
            referralLinkId: link.id,
            userId,
            source: meta?.source == null ? null : String(meta.source).slice(0, 80),
            href: meta?.href == null ? null : String(meta.href).slice(0, 512),
          },
        });

        if (userId) {
          await prisma.user.updateMany({
            where: { id: userId, referralLinkId: null },
            data: {
              referralLinkId: link.id,
              referralSource: meta?.source == null ? null : String(meta.source).slice(0, 80),
              referralAt: new Date(),
            },
          });
        }
      }
    }

    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || 'EVENT_FAILED' });
  }
});

module.exports = router;
