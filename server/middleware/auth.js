const cookie = require('cookie');
const { PrismaClient } = require('@prisma/client');
const { SESSION_COOKIE, resolveSession } = require('../services/authSession');
const { isAllowedOrigin } = require('../services/corsOrigins');

const prisma = new PrismaClient();
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function requestOrigin(req) {
    const raw = String(req.headers.origin || req.headers.referer || '').trim();
    if (!raw) return '';
    try { return new URL(raw).origin; } catch { return ''; }
}

function allowedOrigins(req) {
    const values = [];
    const protocol = req.protocol || (req.secure ? 'https' : 'http');
    const host = req.get?.('host') || req.headers.host;
    if (host) values.push(`${protocol}://${host}`);
    return new Set(values.map((value) => {
        try { return new URL(value).origin; } catch { return ''; }
    }).filter(Boolean));
}

function isSameOriginRequest(req) {
    if (SAFE_METHODS.has(String(req.method || 'GET').toUpperCase())) return true;
    const origin = requestOrigin(req);
    return Boolean(origin && (allowedOrigins(req).has(origin) || isAllowedOrigin(origin)));
}

function getSessionToken(req) {
    const parsedCookies = cookie.parse(req.headers.cookie || '');
    return parsedCookies[SESSION_COOKIE] || null;
}

async function authenticate(req, res, next) {
    try {
        req.user = null;
        req.authSession = null;
        req.authError = null;
        const token = getSessionToken(req);
        if (!token) return next();
        if (!isSameOriginRequest(req)) {
            req.authError = 'ORIGIN_NOT_ALLOWED';
            return next();
        }

        const session = await resolveSession(prisma, token);
        if (!session) return next();
        req.authSession = session;
        req.user = {
            id: session.user.id,
            telegramId: session.user.telegramId ? String(session.user.telegramId) : null,
            username: session.user.username ? String(session.user.username) : null,
            verifiedPhone: session.user.verifiedPhone || null,
        };
        return next();
    } catch {
        req.user = null;
        req.authSession = null;
        return next();
    }
}

function requireSameOrigin(req, res, next) {
    if (!isSameOriginRequest(req)) return res.status(403).json({ ok: false, error: 'ORIGIN_NOT_ALLOWED' });
    return next();
}

function requireAuth(req, res, next) {
    if (req.authError) return res.status(403).json({ ok: false, error: req.authError });
    if (!req.user?.id) return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });
    return next();
}

module.exports = {
    authenticate,
    requireAuth,
    requireSameOrigin,
    isSameOriginRequest,
    getSessionToken,
};

