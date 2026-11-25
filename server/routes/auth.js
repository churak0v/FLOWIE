const express = require('express');
const cookie = require('cookie');
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
const { claimRegistrationGiftForVerifiedPhone } = require('../services/registrationGift');

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
        name: user.name,
        phone: user.verifiedPhone || user.phone || null,
        phoneVerified: Boolean(user.verifiedPhone && user.phoneVerifiedAt),
        consentPersonal: user.consentPersonal,
    };
}

function isGuestUser(user) {
    return Boolean(user && !user.verifiedPhone && !user.staffRole);
}

function publicAuthError(error, fallback) {
    const allowed = new Set([
        'SMS_AUTH_DISABLED',
        'SMS_PROVIDER_REJECTED',
        'SMS_PROVIDER_TIMEOUT',
        'OTP_RESEND_TOO_SOON',
        'OTP_RATE_LIMITED',
        'PHONE_ALREADY_IN_USE',
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
        if (req.body?.name != null) {
            const name = String(req.body.name || '').trim().replace(/\s+/g, ' ');
            if (name.length < 2 || name.length > 100) return res.status(400).json({ ok: false, error: 'BAD_NAME' });
            patch.name = name;
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
            let verifiedUser;
            let newlyVerifiedAccount = false;

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
                verifiedUser = target;
            } else if (current) {
                newlyVerifiedAccount = isGuestUser(current);
                verifiedUser = await tx.user.update({
                    where: { id: current.id },
                    data: { verifiedPhone: challenge.phone, phone: challenge.phone, phoneVerifiedAt: now },
                });
            } else {
                newlyVerifiedAccount = true;
                verifiedUser = await tx.user.create({
                    data: { name: 'Покупатель', verifiedPhone: challenge.phone, phone: challenge.phone, phoneVerifiedAt: now },
                });
            }

            await claimRegistrationGiftForVerifiedPhone(tx, {
                sourceUserId: current?.id || null,
                targetUserId: verifiedUser.id,
                verifiedPhone: challenge.phone,
                newlyVerifiedAccount,
                now: () => now,
            });
            return verifiedUser;
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
module.exports._test = { isGuestUser, mergeGuestData, publicUser };
