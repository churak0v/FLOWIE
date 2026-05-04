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

function getPublicSiteUrl() {
  return String(process.env.PUBLIC_SITE_URL || '').trim();
}

async function tgApi(method, payload) {
  const token = process.env.BOT_TOKEN || '';
  if (!token) return null;
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {}),
  });
  return res.json().catch(() => null);
}

function buildWelcomeAppUrl(startParam) {
  const base = getPublicSiteUrl().replace(/\/$/, '');
  if (!base) return '';
  return startParam ? `${base}?startapp=${encodeURIComponent(startParam)}` : base;
}

async function sendTelegramWelcomeOnce({ userId, telegramId, startParam, force = false }) {
  if (!userId || !telegramId) return;

  const sent = await prisma.analyticsEvent.findFirst({
    where: { userId, event: 'tg_welcome_sent' },
    select: { id: true },
  });
  if (sent) return;

  if (!force) {
    const recentBlocked = await prisma.analyticsEvent.findFirst({
      where: {
        userId,
        event: { in: ['tg_welcome_blocked', 'tg_welcome_failed'] },
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
      select: { id: true },
    });
    if (recentBlocked) return;
  }

  const appUrl = buildWelcomeAppUrl(startParam);
  const reply_markup = appUrl
    ? { inline_keyboard: [[{ text: startParam ? "Open Vivienne's wishlist" : 'Open FLOWIE', web_app: { url: appUrl } }]] }
    : undefined;

  const result = await tgApi('sendMessage', {
    chat_id: telegramId,
    text:
      'Welcome to FLOWIE.\n\n' +
      'A private gifting app for choosing real gifts from curated wishlists. ' +
      'Pay securely with TON Connect or Telegram Stars, while recipient details stay private.',
    reply_markup,
    disable_web_page_preview: true,
  });

  const description = String(result?.description || '');
  const outEvent = result?.ok ? 'tg_welcome_sent' : description.includes("can't initiate conversation")
    ? 'tg_welcome_blocked'
    : 'tg_welcome_failed';

  await prisma.analyticsEvent.create({
    data: {
      userId,
      event: outEvent,
      meta: {
        startParam: startParam || null,
        telegramOk: Boolean(result?.ok),
        errorCode: result?.error_code || null,
        description: result?.description || null,
        messageId: result?.result?.message_id || null,
      },
    },
  });
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
    let telegramId = null;
    try {
      const initData = getInitDataFromHeader(req);
      if (initData) {
        validate(initData, getBotToken(), { expiresIn: 86400 });
        const data = parse(initData);
        const tgUser = data.user;
        if (tgUser?.id) {
          telegramId = String(tgUser.id);
          const user = await prisma.user.upsert({
            where: { telegramId },
            update: {},
            create: { telegramId },
          });
          userId = user.id;
        }
      } else if (req.user?.id) {
        userId = req.user.id;
        telegramId = req.user.telegramId ? String(req.user.telegramId) : null;
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

    if (event === 'write_access_requested' && String(meta?.status || '') === 'allowed' && userId && telegramId) {
      await sendTelegramWelcomeOnce({
        userId,
        telegramId,
        startParam: normalizeRefTag(meta?.tag || ''),
        force: true,
      });
    }

    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || 'EVENT_FAILED' });
  }
});

module.exports = router;
