const crypto = require('crypto');

const SESSION_COOKIE = 'flowie_session';

function sha256(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function sessionTtlMs() {
  const days = Number(process.env.AUTH_SESSION_DAYS || 30);
  const safeDays = Number.isFinite(days) ? Math.min(90, Math.max(1, days)) : 30;
  return safeDays * 24 * 60 * 60 * 1000;
}

function hashRequestValue(value) {
  const secret = process.env.AUTH_HASH_SECRET || process.env.APP_JWT_SECRET;
  if (!secret || !value) return null;
  return crypto.createHmac('sha256', secret).update(String(value)).digest('hex');
}

function requestMetadata(req) {
  return {
    ipHash: hashRequestValue(req.ip || req.socket?.remoteAddress || ''),
    userAgentHash: hashRequestValue(req.headers?.['user-agent'] || ''),
  };
}

async function createSession(prisma, userId, req, now = new Date()) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(now.getTime() + sessionTtlMs());
  const session = await prisma.authSession.create({
    data: {
      tokenHash: sha256(token),
      userId,
      expiresAt,
      ...requestMetadata(req),
    },
  });
  return { token, session, expiresAt };
}

async function resolveSession(prisma, token, now = new Date()) {
  if (!token) return null;
  const session = await prisma.authSession.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: true },
  });
  if (!session || session.revokedAt || session.expiresAt <= now) return null;

  if (now.getTime() - session.lastSeenAt.getTime() > 5 * 60 * 1000) {
    prisma.authSession.update({ where: { id: session.id }, data: { lastSeenAt: now } }).catch(() => {});
  }
  return session;
}

async function revokeSession(prisma, sessionId, now = new Date()) {
  if (!sessionId) return;
  await prisma.authSession.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { revokedAt: now },
  });
}

module.exports = {
  SESSION_COOKIE,
  sha256,
  sessionTtlMs,
  createSession,
  resolveSession,
  revokeSession,
  requestMetadata,
};
