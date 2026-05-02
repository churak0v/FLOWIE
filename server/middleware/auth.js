const jwt = require('jsonwebtoken');
const cookie = require('cookie');

function getJwtSecret() {
    const secret = process.env.APP_JWT_SECRET;
    if (!secret) {
        throw new Error('APP_JWT_SECRET is not set');
    }
    return secret;
}

function getTokenFromRequest(req) {
    const header = req.headers.authorization;
    if (header && header.startsWith('Bearer ')) {
        return header.slice('Bearer '.length).trim();
    }

    const parsedCookies = cookie.parse(req.headers.cookie || '');
    return parsedCookies.session || null;
}

function authenticate(req, res, next) {
    try {
        const token = getTokenFromRequest(req);
        if (!token) {
            req.user = null;
            return next();
        }

        const payload = jwt.verify(token, getJwtSecret());
        req.user = {
            id: Number(payload.sub),
            telegramId: payload.telegramId ? String(payload.telegramId) : null,
            username: payload.username ? String(payload.username) : null,
        };
        return next();
    } catch (e) {
        req.user = null;
        return next();
    }
}

function requireAuth(req, res, next) {
    if (!req.user?.id) {
        return res.status(401).json({ error: 'UNAUTHORIZED' });
    }
    return next();
}

module.exports = {
    authenticate,
    requireAuth,
};

