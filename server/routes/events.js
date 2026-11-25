const express = require('express');
const { PrismaClient } = require('@prisma/client');
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
      select: { id: true, staffRole: true, staffActive: true },
    });
    return user ? {
      userId: user.id,
      isStaff: Boolean(user.staffRole && user.staffActive),
    } : { userId: null, isStaff: false };
  }
  return { userId: null, isStaff: false };
}

async function persistClientEvent(identity, normalized) {
  return prisma.$transaction(async (tx) => {
    await tx.analyticsEvent.create({
      data: {
        eventId: normalized.eventId,
        schemaVersion: 2,
        sessionId: normalized.sessionId,
        pageViewId: normalized.pageViewId,
        routeKey: normalized.routeKey,
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
