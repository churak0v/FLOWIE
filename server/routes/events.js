const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { validate, parse } = require('@tma.js/init-data-node');
const { requireSameOrigin } = require('../middleware/auth');
const {
  AnalyticsValidationError,
  createRateLimiter,
  normalizeClientEvent,
} = require('../services/analytics');

const router = express.Router();
let prisma = new PrismaClient();
let ipRateLimiter = createRateLimiter({ max: 180, windowMs: 60_000 });
let sessionRateLimiter = createRateLimiter({ max: 120, windowMs: 60_000 });

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
    ? { inline_keyboard: [[{ text: 'Открыть FLOWIE', web_app: { url: appUrl } }]] }
    : undefined;

  const result = await tgApi('sendMessage', {
    chat_id: telegramId,
    text:
      'Добро пожаловать в FLOWIE.\n\n' +
      'Быстрая доставка цветов с подборками букетов, понятной оплатой и статусом заказа. ' +
      'Оплачивайте банковской картой через защищённую платёжную страницу.',
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

async function resolveEventIdentity(req) {
  if (req.user?.id) {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, telegramId: true, staffRole: true, staffActive: true },
    });
    return user ? {
      userId: user.id,
      telegramId: user.telegramId ? String(user.telegramId) : null,
      isStaff: Boolean(user.staffRole && user.staffActive),
    } : { userId: null, telegramId: null, isStaff: false };
  }

  const initData = getInitDataFromHeader(req);
  if (!initData) return { userId: null, telegramId: null, isStaff: false };
  let data;
  try {
    validate(initData, getBotToken(), { expiresIn: 86400 });
    data = parse(initData);
  } catch {
    throw new AnalyticsValidationError('INVALID_INIT_DATA', 401);
  }
  if (!data.user?.id) throw new AnalyticsValidationError('INVALID_INIT_DATA', 401);
  const telegramId = String(data.user.id);
  const user = await prisma.user.findUnique({
    where: { telegramId },
    select: { id: true, telegramId: true, staffRole: true, staffActive: true },
  });
  return user ? {
    userId: user.id,
    telegramId,
    isStaff: Boolean(user.staffRole && user.staffActive),
  } : { userId: null, telegramId: null, isStaff: false };
}

async function persistClientEvent(identity, normalized) {
  return prisma.$transaction(async (tx) => {
    await tx.analyticsEvent.create({
      data: {
        eventId: normalized.eventId,
        userId: identity.userId,
        event: normalized.event,
        productId: normalized.productId,
        orderId: normalized.orderId,
        meta: normalized.meta,
      },
    });

    if (normalized.event === 'ref_open') {
      const tag = normalizeRefTag(normalized.meta.tag);
      if (tag) {
        const link = await tx.referralLink.upsert({
          where: { tag },
          update: { updatedAt: new Date() },
          create: { tag, autoCreated: true, isActive: true },
        });
        await tx.referralOpen.create({
          data: {
            referralLinkId: link.id,
            userId: identity.userId,
            source: normalized.meta.referralSource || null,
            // Keep the legacy column useful without retaining a raw URL or query string.
            href: normalized.meta.path || null,
          },
        });
        if (identity.userId) {
          await tx.user.updateMany({
            where: { id: identity.userId, referralLinkId: null },
            data: {
              referralLinkId: link.id,
              referralSource: normalized.meta.referralSource || null,
              referralAt: new Date(),
            },
          });
        }
      }
    }
  });
}

// POST /api/events — first-party, privacy-minimized client analytics.
router.post('/', requireSameOrigin, async (req, res) => {
  try {
    const normalized = normalizeClientEvent(req.body);
    const ipKey = String(req.ip || req.socket?.remoteAddress || 'unknown');
    const ipLimit = ipRateLimiter.consume(ipKey);
    const sessionLimit = sessionRateLimiter.consume(`${ipKey}:${normalized.meta.sessionId}`);
    if (!ipLimit.allowed || !sessionLimit.allowed) {
      const retryAfter = Math.max(ipLimit.retryAfter, sessionLimit.retryAfter);
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({ ok: false, error: 'EVENT_RATE_LIMITED', retryAfter });
    }

    const identity = await resolveEventIdentity(req);
    if (identity.isStaff) return res.json({ ok: true, accepted: false, skipped: 'STAFF' });

    try {
      await persistClientEvent(identity, normalized);
    } catch (error) {
      if (error?.code === 'P2002') return res.json({ ok: true, accepted: true, duplicate: true });
      throw error;
    }

    if (normalized.event === 'write_access_requested' && normalized.meta.status === 'allowed' && identity.userId && identity.telegramId) {
      await sendTelegramWelcomeOnce({
        userId: identity.userId,
        telegramId: identity.telegramId,
        startParam: normalizeRefTag(normalized.meta.tag),
        force: true,
      });
    }

    return res.status(202).json({ ok: true, accepted: true, duplicate: false });
  } catch (e) {
    if (e instanceof AnalyticsValidationError) {
      return res.status(e.status).json({ ok: false, error: e.code });
    }
    console.warn('Analytics ingestion failed');
    return res.status(500).json({ ok: false, error: 'EVENT_FAILED' });
  }
});

module.exports = router;
module.exports._test = {
  setPrisma(client) {
    prisma = client;
  },
  setRateLimiters({ ip, session }) {
    if (ip) ipRateLimiter = ip;
    if (session) sessionRateLimiter = session;
  },
};
