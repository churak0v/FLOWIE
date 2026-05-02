const express = require('express');
const cookie = require('cookie');
const jwt = require('jsonwebtoken');
const { validate, parse } = require('@tma.js/init-data-node');
const { PrismaClient } = require('@prisma/client');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

function getJwtSecret() {
    const secret = process.env.APP_JWT_SECRET;
    if (!secret) {
        throw new Error('APP_JWT_SECRET is not set');
    }
    return secret;
}

function getCookieOptions() {
    const isProd = process.env.NODE_ENV === 'production';
    const domain = process.env.APP_COOKIE_DOMAIN;

    return {
        httpOnly: true,
        secure: isProd,
        sameSite: isProd ? 'none' : 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 7,
        ...(domain ? { domain } : {}),
    };
}

function setSessionCookie(res, token) {
    res.setHeader(
        'Set-Cookie',
        cookie.serialize('session', token, getCookieOptions()),
    );
}

// POST /api/auth/telegram
router.post('/telegram', async (req, res) => {
    try {
        const initData = String(req.body?.initData || '');
        if (!initData) return res.status(400).json({ ok: false, error: 'NO_INIT_DATA' });

        const botToken = process.env.BOT_TOKEN;
        if (!botToken) return res.status(500).json({ ok: false, error: 'BOT_TOKEN_NOT_SET' });

        // Use a sane TTL (1 day). Some clients reuse initData within the same WebView session.
        validate(initData, botToken, { expiresIn: 86400 });
        const data = parse(initData);
        const tgUser = data.user;
        if (!tgUser?.id) return res.status(400).json({ ok: false, error: 'NO_USER' });

        const telegramId = String(tgUser.id);
        const name = [tgUser.firstName, tgUser.lastName].filter(Boolean).join(' ') || null;
        const username = tgUser.username ? String(tgUser.username) : null;

        const user = await prisma.user.upsert({
            where: { telegramId },
            update: {
                name,
                username,
            },
            create: {
                telegramId,
                name,
                username,
            },
        });

        const token = jwt.sign(
            { sub: String(user.id), telegramId, username },
            getJwtSecret(),
            { expiresIn: '7d' },
        );

        setSessionCookie(res, token);
        return res.json({
            ok: true,
            token,
            user: {
                id: user.id,
                telegramId: user.telegramId,
                name: user.name,
                username: user.username,
            },
        });
    } catch (e) {
        return res.status(401).json({ ok: false, error: e?.message || 'INVALID_INIT_DATA' });
    }
});

// POST /api/auth/guest
router.post('/guest', async (req, res) => {
    try {
        const user = await prisma.user.create({
            data: {
                name: 'Гость',
            },
        });

        const token = jwt.sign({ sub: String(user.id) }, getJwtSecret(), { expiresIn: '7d' });
        setSessionCookie(res, token);

        return res.json({ ok: true, token, user: { id: user.id, name: user.name } });
    } catch (e) {
        return res.status(500).json({ ok: false, error: e?.message || 'GUEST_LOGIN_FAILED' });
    }
});

// GET /api/auth/me
router.get('/me', requireAuth, async (req, res) => {
    try {
        const user = await prisma.user.findUnique({ where: { id: req.user.id } });
        if (!user) return res.status(401).json({ error: 'UNAUTHORIZED' });

        return res.json({
            ok: true,
            user: {
                id: user.id,
                telegramId: user.telegramId,
                name: user.name,
                username: user.username,
                phone: user.phone,
                consentPersonal: user.consentPersonal,
            },
        });
    } catch (e) {
        return res.status(500).json({ error: e?.message || 'ME_FAILED' });
    }
});

function normalizePhone(raw) {
    const s = String(raw || '').trim();
    if (!s) return null;

    const digits = s.replace(/[^\d+]/g, '');
    if (!digits) return null;

    // Convert common RU formats: 8XXXXXXXXXX or 7XXXXXXXXXX -> +7XXXXXXXXXX
    const dOnly = digits.replace(/[^\d]/g, '');
    if (dOnly.length === 11 && (dOnly.startsWith('8') || dOnly.startsWith('7'))) {
        return `+7${dOnly.slice(1)}`;
    }

    const normalized = digits.startsWith('+') ? digits : `+${digits}`;
    if (!/^\+\d{10,15}$/.test(normalized)) return null;
    return normalized;
}

// PATCH /api/auth/me
router.patch('/me', requireAuth, async (req, res) => {
    try {
        const patch = {};
        if (req.body?.phone != null) {
            const phone = normalizePhone(req.body?.phone);
            if (!phone) return res.status(400).json({ ok: false, error: 'BAD_PHONE' });
            patch.phone = phone;
        }
        if (req.body?.consentPersonal != null) {
            patch.consentPersonal = Boolean(req.body.consentPersonal);
        }
        if (!Object.keys(patch).length) return res.status(400).json({ ok: false, error: 'NO_FIELDS' });

        const user = await prisma.user.update({
            where: { id: req.user.id },
            data: patch,
        });

        return res.json({
            ok: true,
            user: {
                id: user.id,
                telegramId: user.telegramId,
                name: user.name,
                username: user.username,
                phone: user.phone,
                consentPersonal: user.consentPersonal,
            },
        });
    } catch (e) {
        return res.status(500).json({ ok: false, error: e?.message || 'ME_UPDATE_FAILED' });
    }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
    const isProd = process.env.NODE_ENV === 'production';
    const domain = process.env.APP_COOKIE_DOMAIN;

    res.setHeader(
        'Set-Cookie',
        cookie.serialize('session', '', {
            httpOnly: true,
            secure: isProd,
            sameSite: isProd ? 'none' : 'lax',
            path: '/',
            maxAge: 0,
            ...(domain ? { domain } : {}),
        }),
    );

    return res.json({ ok: true });
});

module.exports = router;
