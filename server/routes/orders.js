const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { requireAuth } = require('../middleware/auth');
const crypto = require('crypto');

const NOMINATIM_BASE_URL = process.env.NOMINATIM_BASE_URL || 'https://nominatim.openstreetmap.org';
const NOMINATIM_USER_AGENT = process.env.NOMINATIM_USER_AGENT || 'flowie-server';
// Rough bounding box that covers Санкт-Петербург + Ленинградская область.
// Nominatim expects: left,top,right,bottom (lon,lat,lon,lat)
const SPB_LO_VIEWBOX = process.env.SPB_LO_VIEWBOX || '27.0,61.8,36.0,58.0';

const GEO_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const GEO_CACHE_MAX = 500;
const GEO_CACHE = new Map(); // key -> { ts, value }

function normalizeRu(s) {
    return String(s || '')
        .toLowerCase()
        .replace(/ё/g, 'е')
        .replace(/[^a-zа-я0-9]+/gi, ' ')
        .trim();
}

function isAllowedSpbLoAddress(addr) {
    if (!addr || typeof addr !== 'object') return false;
    const fields = [
        addr.state,
        addr.region,
        addr.state_district,
        addr.city,
        addr.county,
        addr.province,
    ].filter(Boolean);

    for (const f of fields) {
        const n = normalizeRu(f);
        if (!n) continue;
        if (n.includes('санкт петербург')) return true;
        if (n.includes('ленинградская область')) return true;
    }
    return false;
}

function cacheGet(key) {
    const hit = GEO_CACHE.get(key);
    if (!hit) return null;
    if (Date.now() - hit.ts > GEO_CACHE_TTL_MS) {
        GEO_CACHE.delete(key);
        return null;
    }
    return hit.value;
}

function cacheSet(key, value) {
    GEO_CACHE.set(key, { ts: Date.now(), value });
    while (GEO_CACHE.size > GEO_CACHE_MAX) {
        const firstKey = GEO_CACHE.keys().next().value;
        if (firstKey == null) break;
        GEO_CACHE.delete(firstKey);
    }
}

async function geocodeNominatim(q, opts = {}) {
    const query = String(q || '').trim();
    if (!query) return null;

    const url = new URL(`${NOMINATIM_BASE_URL.replace(/\/$/, '')}/search`);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('q', `${query}, Россия`);
    url.searchParams.set('accept-language', 'ru');
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('limit', String(opts.limit ?? 8));
    url.searchParams.set('countrycodes', 'ru');
    if (opts.bounded !== false) {
        url.searchParams.set('viewbox', SPB_LO_VIEWBOX);
        url.searchParams.set('bounded', '1');
    }

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4_500);
    try {
        const res = await fetch(url.toString(), {
            method: 'GET',
            signal: ctrl.signal,
            headers: {
                Accept: 'application/json',
                'User-Agent': NOMINATIM_USER_AGENT,
            },
        });
        if (!res.ok) return null;
        const data = await res.json().catch(() => null);
        return Array.isArray(data) ? data : null;
    } catch (e) {
        if (e?.name === 'AbortError') return { error: 'TIMEOUT' };
        return { error: 'FAILED' };
    } finally {
        clearTimeout(t);
    }
}

async function validateDeliveryAddressSpbLo(deliveryAddress) {
    const raw = String(deliveryAddress || '').trim();
    if (!raw) return { ok: false, code: 'DELIVERY_ADDRESS_EMPTY' };
    if (raw.length < 6) return { ok: false, code: 'DELIVERY_ADDRESS_TOO_SHORT' };

    const cacheKey = `v1:${normalizeRu(raw)}`;
    const cached = cacheGet(cacheKey);
    if (cached) return cached;

    const within = await geocodeNominatim(raw, { bounded: true, limit: 8 });
    if (!within) {
        const out = { ok: false, code: 'ADDRESS_VALIDATION_UNAVAILABLE' };
        cacheSet(cacheKey, out);
        return out;
    }
    if (within?.error) {
        return { ok: false, code: 'ADDRESS_VALIDATION_UNAVAILABLE' };
    }

    let allowed = within.find((x) => isAllowedSpbLoAddress(x?.address || {})) || null;

    // If bounded search returned nothing, try once without viewbox to distinguish typos vs out-of-area.
    if (!allowed && !within.length) {
        const anyRu = await geocodeNominatim(raw, { bounded: false, limit: 6 });
        if (!anyRu) {
            const out = { ok: false, code: 'ADDRESS_VALIDATION_UNAVAILABLE' };
            cacheSet(cacheKey, out);
            return out;
        }
        if (anyRu?.error) return { ok: false, code: 'ADDRESS_VALIDATION_UNAVAILABLE' };

        if (!anyRu.length) {
            const out = { ok: false, code: 'DELIVERY_ADDRESS_NOT_FOUND' };
            cacheSet(cacheKey, out);
            return out;
        }

        allowed = anyRu.find((x) => isAllowedSpbLoAddress(x?.address || {})) || null;
        if (!allowed) {
            const out = { ok: false, code: 'DELIVERY_OUT_OF_SERVICE_AREA' };
            cacheSet(cacheKey, out);
            return out;
        }
    }

    if (!allowed) {
        const out = { ok: false, code: 'DELIVERY_OUT_OF_SERVICE_AREA' };
        cacheSet(cacheKey, out);
        return out;
    }

    const lat = Number(allowed?.lat);
    const lon = Number(allowed?.lon);
    const coords = Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;

    const out = { ok: true, coords };
    cacheSet(cacheKey, out);
    return out;
}

function parseCsv(value) {
    return String(value || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
}

function getAdminTgIds() {
    return parseCsv(process.env.ADMIN_TG_IDS);
}

function getAdminBotToken() {
    return process.env.ADMIN_BOT_TOKEN || process.env.BOT_TOKEN || '';
}

function getAppSecret() {
    return String(process.env.APP_JWT_SECRET || '');
}

function makeCallbackSig(orderId) {
    // Keep it short for Telegram's 64-byte callback_data limit.
    const secret = getAppSecret();
    return crypto.createHmac('sha256', secret).update(String(orderId)).digest('hex').slice(0, 16);
}

async function tgApi(token, method, payload) {
    if (!token) return null;
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload || {}),
    });
    return res.json().catch(() => null);
}

async function notifyAdminsPaymentPending(order) {
    try {
        const token = getAdminBotToken();
        if (!token) return;
        const ids = getAdminTgIds();
        if (!ids.length) return;

        const amount = Number(order?.totalPrice || 0);
        const orderId = Number(order?.id);
        const userLabel = order?.user?.username ? `@${order.user.username}` : (order?.user?.name || `User ${order?.user?.id || '—'}`);

        const sig = makeCallbackSig(orderId);
        const callbackData = `pay_ok:${orderId}:${sig}`;
        const text =
            `Новый заказ, требуется подтверждение оплаты\\n` +
            `Заказ: #${orderId}\\n` +
            `Amount: $${amount}\\n` +
            `Клиент: ${userLabel}`;

        const reply_markup = {
            inline_keyboard: [
                [{ text: 'Подтвердить поступление', callback_data: callbackData }],
            ],
        };

        for (const chatId of ids) {
            // eslint-disable-next-line no-await-in-loop
            await tgApi(token, 'sendMessage', { chat_id: chatId, text, reply_markup });
        }
    } catch {
        // ignore
    }
}

// GET orders (with filters support for Admin)
router.get('/', requireAuth, async (req, res) => {
    try {
        const { status, statuses, date } = req.query;
        const where = { userId: req.user.id };

        if (statuses) {
            const arr = String(statuses).split(',').map((s) => s.trim()).filter(Boolean);
            if (arr.length) where.status = { in: arr };
        } else if (status) {
            where.status = status;
        }

        // Simple date filtering can be enhanced
        if (date === 'Today') {
            const start = new Date();
            start.setHours(0, 0, 0, 0);
            where.createdAt = { gte: start };
        }

        const orders = await prisma.order.findMany({
            where,
            include: { items: { include: { product: true } }, user: true },
            orderBy: { createdAt: 'desc' }
        });
        res.json(orders);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET order by id (client)
router.get('/:id', requireAuth, async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isFinite(id)) return res.status(400).json({ error: 'BAD_ID' });

        const order = await prisma.order.findFirst({
            where: { id, userId: req.user.id },
            include: { items: { include: { product: true } }, user: true, photos: true },
        });
        if (!order) return res.status(404).json({ error: 'NOT_FOUND' });
        return res.json({ ok: true, order });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
});

// Client cancel order
router.post('/:id/cancel', requireAuth, async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: 'BAD_ID' });

        const order = await prisma.order.findFirst({ where: { id, userId: req.user.id } });
        if (!order) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
        const st = String(order.status || '').toUpperCase();
        if (['DELIVERED', 'CANCELLED'].includes(st)) return res.status(400).json({ ok: false, error: 'ALREADY_FINISHED' });

        const updated = await prisma.$transaction(async (tx) => {
            const up = await tx.order.update({
                where: { id },
                data: { status: 'CANCELLED', cancelReason: 'CLIENT_CANCEL' },
            });
            await tx.orderStatusHistory.create({ data: { orderId: id, status: 'CANCELLED', actorId: req.user.id } });
            return up;
        });

        return res.json({ ok: true, order: { id: updated.id, status: updated.status } });
    } catch (e) {
        return res.status(500).json({ ok: false, error: e?.message || 'CANCEL_FAILED' });
    }
});

// Client rates pre-delivery photo
router.post('/:id/photo-rating', requireAuth, async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: 'BAD_ID' });
        const rating = String(req.body?.rating || '').toUpperCase();
        if (rating !== 'UP' && rating !== 'DOWN') return res.status(400).json({ ok: false, error: 'BAD_RATING' });

        const order = await prisma.order.findFirst({ where: { id, userId: req.user.id } });
        if (!order) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });

        const updated = await prisma.order.update({
            where: { id },
            data: { preDeliveryRating: rating, preDeliveryRatedAt: new Date() },
        });

        return res.json({ ok: true, order: { id: updated.id, preDeliveryRating: updated.preDeliveryRating, preDeliveryRatedAt: updated.preDeliveryRatedAt } });
    } catch (e) {
        return res.status(500).json({ ok: false, error: e?.message || 'PHOTO_RATE_FAILED' });
    }
});

// POST create order
router.post('/', requireAuth, async (req, res) => {
    try {
        const {
            items, deliveryAddress, deliveryTime,
            recipientName, recipientPhone, deliveryCost = 0,
            paymentMethod,
            floristComment,
            senderPhone,
            consentPersonal,
        } = req.body;

        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: 'NO_ITEMS' });
        }

        const deliveryAddressStr = String(deliveryAddress || '').trim();
        const safeDeliveryAddress = deliveryAddressStr || 'No delivery address required';
        const deliveryCoords = null;

        if (!senderPhone || !String(senderPhone).trim()) {
            return res.status(400).json({ error: 'SENDER_PHONE_REQUIRED' });
        }
        const consentAccepted = Boolean(consentPersonal);
        if (!consentAccepted) {
            return res.status(400).json({ error: 'CONSENT_REQUIRED' });
        }

        // Calculate totals
        const itemsTotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        const totalPrice = itemsTotal + deliveryCost;
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

        const userRef = await prisma.user.findUnique({
            where: { id: req.user.id },
            select: { referralLinkId: true },
        });

        const order = await prisma.$transaction(async (tx) => {
            const created = await tx.order.create({
                data: {
                    userId: req.user.id,
                    status: 'PAYMENT_PENDING', // Fulfillment status (separate from paymentStatus)
                    paymentMethod: paymentMethod ? String(paymentMethod) : 'manual',
                    floristComment: floristComment ? String(floristComment) : null,
                    senderPhone: String(senderPhone).trim(),
                    consentPersonal: true,
                    paymentStatus: 'PENDING',
                    paymentClientConfirmed: false,
                    paymentExpiresAt: expiresAt,
                    itemsTotal,
                    deliveryCost,
                    totalPrice,
                    referralLinkId: userRef?.referralLinkId ?? null,
                    deliveryAddress: safeDeliveryAddress,
                    deliveryCoords,
                    deliveryTime,
                    recipientName,
                    recipientPhone,
                    items: {
                        create: items.map(item => ({
                            productId: item.productId,
                            quantity: item.quantity,
                            price: item.price
                        }))
                    }
                },
                include: { items: { include: { product: true } }, user: true }
            });

            // History (for admin UI)
            await tx.orderStatusHistory.create({
                data: { orderId: created.id, status: 'NEW' },
            });

            // Create order chat (client + staff)
            await tx.chat.create({
                data: { userId: req.user.id, orderId: created.id },
            });

            return created;
        });

        // Best-effort notify admins about an incoming manual transfer.
        notifyAdminsPaymentPending(order);

        res.json(order);
    } catch (error) {
        console.error("Order creation failed:", error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
