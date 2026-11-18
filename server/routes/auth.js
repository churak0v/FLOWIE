const express = require('express');
const cookie = require('cookie');
const { validate, parse } = require('@tma.js/init-data-node');
const { PrismaClient } = require('@prisma/client');
const { requireAuth, requireSameOrigin } = require('../middleware/auth');
const { SESSION_COOKIE, createSession, revokeSession, sessionTtlMs } = require('../services/authSession');
const { sendOtpSms, smsRuConfig } = require('../services/smsru');
const {
    OTP_TTL_MS,
    OTP_RESEND_MS,
    normalizePhone,
    generateOtp,
    hashIp,
} = require('../services/phoneOtp');
const { reserveOtpChallenge, consumeOtpAttempt } = require('../services/otpStore');

const router = express.Router();
const prisma = new PrismaClient();

function getCookieOptions() {
    const isProd = process.env.NODE_ENV === 'production';
    const domain = process.env.APP_COOKIE_DOMAIN;

    return {
        httpOnly: true,
        secure: isProd,
        sameSite: 'lax',
        path: '/',
        maxAge: Math.floor(sessionTtlMs() / 1000),
        ...(domain ? { domain } : {}),
    };
}

function getPublicSiteUrl() {
    return String(process.env.PUBLIC_SITE_URL || '').trim();
}

function setSessionCookie(res, token) {
    res.setHeader(
        'Set-Cookie',
        cookie.serialize(SESSION_COOKIE, token, getCookieOptions()),
    );
}

function clearSessionCookie(res) {
    res.setHeader('Set-Cookie', cookie.serialize(SESSION_COOKIE, '', { ...getCookieOptions(), maxAge: 0 }));
}

function publicUser(user) {
    return {
        id: user.id,
        telegramId: user.telegramId,
        name: user.name,
        username: user.username,
        phone: user.verifiedPhone || user.phone || null,
        phoneVerified: Boolean(user.verifiedPhone && user.phoneVerifiedAt),
        consentPersonal: user.consentPersonal,
    };
}

function isGuestUser(user) {
    return Boolean(user && !user.telegramId && !user.verifiedPhone && !user.staffRole);
}

function publicAuthError(error, fallback) {
    const allowed = new Set([
        'SMS_AUTH_DISABLED',
        'SMS_PROVIDER_REJECTED',
        'SMS_PROVIDER_TIMEOUT',
        'OTP_RESEND_TOO_SOON',
        'OTP_RATE_LIMITED',
        'PHONE_ALREADY_IN_USE',
        'IDENTITY_CONFLICT',
    ]);
    return allowed.has(error?.message) ? error.message : fallback;
}

async function mergeGuestData(tx, guestId, targetId) {
    if (!guestId || !targetId || guestId === targetId) return;
    await tx.order.updateMany({ where: { userId: guestId }, data: { userId: targetId } });
    await tx.recipient.updateMany({ where: { userId: guestId }, data: { userId: targetId } });
    await tx.address.updateMany({ where: { userId: guestId }, data: { userId: targetId } });
    await tx.chat.updateMany({ where: { userId: guestId }, data: { userId: targetId } });
    await tx.promoCode.updateMany({ where: { userId: guestId }, data: { userId: targetId } });
    await tx.analyticsEvent.updateMany({ where: { userId: guestId }, data: { userId: targetId } });
    await tx.referralOpen.updateMany({ where: { userId: guestId }, data: { userId: targetId } });
}

async function rotateSession(req, res, userId) {
    if (req.authSession?.id) await revokeSession(prisma, req.authSession.id);
    const { token } = await createSession(prisma, userId, req);
    setSessionCookie(res, token);
}

async function tgApi(method, payload) {
    const token = process.env.BOT_TOKEN || '';
    if (!token) return null;

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 1800);
    try {
        const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload || {}),
            signal: ac.signal,
        });
        return response.json().catch(() => null);
    } finally {
        clearTimeout(timer);
    }
}

function getStartParamFromInitData(initData) {
    try {
        const params = new URLSearchParams(String(initData || ''));
        return String(params.get('start_param') || '').trim();
    } catch {
        return '';
    }
}

function parseTelegramIdentity(initData, botToken) {
    validate(initData, botToken, { expiresIn: 86400 });
    const data = parse(initData);
    const tgUser = data.user;
    if (!tgUser?.id) throw new Error('NO_USER');

    return {
        telegramId: String(tgUser.id),
        name: [tgUser.first_name ?? tgUser.firstName, tgUser.last_name ?? tgUser.lastName].filter(Boolean).join(' ') || null,
        username: tgUser.username ? String(tgUser.username) : null,
        startParam: String(data.start_param || data.startParam || getStartParamFromInitData(initData) || '').trim(),
    };
}

function buildWelcomeAppUrl(startParam) {
    const base = getPublicSiteUrl().replace(/\/$/, '');
    if (!base) return '';
    return startParam ? `${base}?startapp=${encodeURIComponent(startParam)}` : base;
}

async function sendTelegramWelcomeOnce({ userId, telegramId, startParam }) {
    if (!userId || !telegramId) return;

    const existing = await prisma.analyticsEvent.findFirst({
        where: {
            userId,
            event: { in: ['tg_welcome_sent', 'tg_welcome_blocked'] },
        },
        select: { id: true },
    });
    if (existing) return;

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

    const event = result?.ok ? 'tg_welcome_sent' : String(result?.description || '').includes("can't initiate conversation")
        ? 'tg_welcome_blocked'
        : 'tg_welcome_failed';

    await prisma.analyticsEvent.create({
        data: {
            userId,
            event,
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

// POST /api/auth/telegram
router.post('/telegram', requireSameOrigin, async (req, res) => {
    try {
        const initData = String(req.body?.initData || '');
        if (!initData) return res.status(400).json({ ok: false, error: 'NO_INIT_DATA' });

        const botToken = process.env.BOT_TOKEN;
        if (!botToken) return res.status(500).json({ ok: false, error: 'BOT_TOKEN_NOT_SET' });

        // Use a sane TTL (1 day). Some clients reuse initData within the same WebView session.
        const { telegramId, name, username, startParam } = parseTelegramIdentity(initData, botToken);

        const user = await prisma.$transaction(async (tx) => {
            const current = req.user?.id ? await tx.user.findUnique({ where: { id: req.user.id } }) : null;
            const target = await tx.user.findUnique({ where: { telegramId } });

            if (target) {
                if (current && current.id !== target.id) {
                    if (!isGuestUser(current)) {
                        const error = new Error('IDENTITY_CONFLICT');
                        error.statusCode = 409;
                        throw error;
                    }
                    await mergeGuestData(tx, current.id, target.id);
                    await tx.authSession.updateMany({ where: { userId: current.id, revokedAt: null }, data: { revokedAt: new Date() } });
                }
                return tx.user.update({ where: { id: target.id }, data: { name, username } });
            }

            if (current && !current.telegramId) {
                return tx.user.update({ where: { id: current.id }, data: { telegramId, name, username } });
            }
            return tx.user.create({ data: { telegramId, name, username } });
        });

        await rotateSession(req, res, user.id);
        sendTelegramWelcomeOnce({ userId: user.id, telegramId, startParam }).catch((e) => {
            console.warn('Telegram welcome failed:', e?.message || e);
        });
        return res.json({
            ok: true,
            user: publicUser(user),
        });
    } catch (e) {
        if (e?.message === 'IDENTITY_CONFLICT') {
            if (req.authSession?.id) await revokeSession(prisma, req.authSession.id).catch(() => {});
            clearSessionCookie(res);
        }
        return res.status(e?.statusCode || 401).json({ ok: false, error: publicAuthError(e, 'INVALID_INIT_DATA') });
    }
});

// POST /api/auth/guest
router.post('/guest', requireSameOrigin, async (req, res) => {
    try {
        if (req.authError) return res.status(403).json({ ok: false, error: req.authError });
        if (req.user?.id) {
            const existing = await prisma.user.findUnique({ where: { id: req.user.id } });
            if (existing) return res.json({ ok: true, user: publicUser(existing) });
        }
        const user = await prisma.user.create({
            data: {
                name: 'Гость',
            },
        });

        await rotateSession(req, res, user.id);
        return res.json({ ok: true, user: publicUser(user) });
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
            user: publicUser(user),
        });
    } catch (e) {
        return res.status(500).json({ error: e?.message || 'ME_FAILED' });
    }
});

// PATCH /api/auth/me
router.patch('/me', requireAuth, async (req, res) => {
    try {
        const patch = {};
        if (req.body?.phone != null) {
            const contactPhone = normalizePhone(req.body.phone);
            if (!contactPhone) return res.status(400).json({ ok: false, error: 'BAD_PHONE' });
            // Contact-only field. Identity lookup and merges use verifiedPhone exclusively.
            patch.phone = contactPhone;
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
            user: publicUser(user),
        });
    } catch (e) {
        return res.status(500).json({ ok: false, error: e?.message || 'ME_UPDATE_FAILED' });
    }
});

// POST /api/auth/phone/request
router.post('/phone/request', requireSameOrigin, async (req, res) => {
    try {
        if (!smsRuConfig().enabled) return res.status(503).json({ ok: false, error: 'SMS_AUTH_DISABLED' });
        const phone = normalizePhone(req.body?.phone);
        if (!phone) return res.status(400).json({ ok: false, error: 'BAD_PHONE' });

        const now = new Date();
        const ip = req.ip || req.socket?.remoteAddress || 'unknown';
        const ipHashValue = hashIp(ip);
        const code = generateOtp();
        const challenge = await reserveOtpChallenge({
            prisma,
            phone,
            ipHash: ipHashValue,
            userId: req.user?.id || null,
            code,
            now,
        });

        try {
            const sent = await sendOtpSms({ phone, code, ip });
            if (sent.messageId) {
                await prisma.phoneOtpChallenge.update({
                    where: { id: challenge.id },
                    data: { providerMessageId: sent.messageId },
                });
            }
        } catch (error) {
            await prisma.phoneOtpChallenge.delete({ where: { id: challenge.id } }).catch(() => {});
            throw error;
        }

        return res.json({
            ok: true,
            challengeId: challenge.id,
            expiresIn: Math.floor(OTP_TTL_MS / 1000),
            resendAfter: Math.floor(OTP_RESEND_MS / 1000),
        });
    } catch (error) {
        return res.status(error?.statusCode || 500).json({
            ok: false,
            error: publicAuthError(error, 'OTP_REQUEST_FAILED'),
            ...(Number(error?.retryAfter) > 0 ? { retryAfter: Number(error.retryAfter) } : {}),
        });
    }
});

// POST /api/auth/phone/verify
router.post('/phone/verify', requireSameOrigin, async (req, res) => {
    try {
        const challengeId = String(req.body?.challengeId || '').trim();
        const code = String(req.body?.code || '').trim();
        if (!challengeId || !/^\d{6}$/.test(code)) {
            return res.status(400).json({ ok: false, error: 'INVALID_OR_EXPIRED_CODE' });
        }

        const now = new Date();
        const verification = await consumeOtpAttempt({ prisma, challengeId, code, now });
        if (!verification.ok) {
            const status = verification.error === 'OTP_ALREADY_USED' ? 409 : 400;
            return res.status(status).json({ ok: false, error: verification.error });
        }
        const challenge = verification.challenge;

        const user = await prisma.$transaction(async (tx) => {
            const current = req.user?.id ? await tx.user.findUnique({ where: { id: req.user.id } }) : null;
            const target = await tx.user.findUnique({ where: { verifiedPhone: challenge.phone } });

            if (target) {
                if (current && current.id !== target.id) {
                    if (!isGuestUser(current)) {
                        const error = new Error('PHONE_ALREADY_IN_USE');
                        error.statusCode = 409;
                        throw error;
                    }
                    await mergeGuestData(tx, current.id, target.id);
                    await tx.authSession.updateMany({ where: { userId: current.id, revokedAt: null }, data: { revokedAt: now } });
                }
                return target;
            }

            if (current) {
                return tx.user.update({
                    where: { id: current.id },
                    data: { verifiedPhone: challenge.phone, phone: challenge.phone, phoneVerifiedAt: now },
                });
            }
            return tx.user.create({
                data: { name: 'Покупатель', verifiedPhone: challenge.phone, phone: challenge.phone, phoneVerifiedAt: now },
            });
        });

        await rotateSession(req, res, user.id);
        return res.json({ ok: true, user: publicUser(user) });
    } catch (error) {
        return res.status(error?.statusCode || 500).json({ ok: false, error: publicAuthError(error, 'OTP_VERIFY_FAILED') });
    }
});

// POST /api/auth/logout
router.post('/logout', requireSameOrigin, async (req, res) => {
    if (req.authSession?.id) await revokeSession(prisma, req.authSession.id);
    clearSessionCookie(res);
    return res.json({ ok: true });
});

module.exports = router;
module.exports._test = { parseTelegramIdentity, isGuestUser, mergeGuestData, publicUser };
