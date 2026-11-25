const crypto = require('crypto');
const { resolveDeliveryPrice, DeliveryZoneError } = require('./deliveryZones');

const MAX_ITEMS = 50;
const MAX_QUANTITY = 99;
const CHECKOUT_KEY_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

class OrderCreationError extends Error {
    constructor(code, status = 400) {
        super(code);
        this.code = code;
        this.status = status;
    }
}

function boundedString(value, { code, min = 0, max }) {
    const normalized = String(value || '').trim();
    if (normalized.length < min || normalized.length > max) throw new OrderCreationError(code);
    return normalized;
}

function normalizePhone(value, required, code) {
    const raw = String(value || '').trim();
    if (!raw && !required) return null;
    const digits = raw.replace(/\D/g, '');
    if (digits.length < 10 || digits.length > 15) throw new OrderCreationError(code);
    return `+${digits}`;
}

function normalizeDeliveryCoords(value) {
    if (value == null || value === '') return null;
    let lat;
    let lon;
    if (typeof value === 'string') {
        const parts = value.split(',').map((part) => part.trim());
        if (parts.length !== 2) throw new OrderCreationError('BAD_DELIVERY_COORDS');
        [lat, lon] = parts.map(Number);
    } else if (typeof value === 'object' && !Array.isArray(value)) {
        lat = Number(value.lat);
        lon = Number(value.lon);
    } else {
        throw new OrderCreationError('BAD_DELIVERY_COORDS');
    }
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
        throw new OrderCreationError('BAD_DELIVERY_COORDS');
    }
    return JSON.stringify({ lat, lon });
}

function optionalBoolean(value, code) {
    if (value == null) return false;
    if (typeof value !== 'boolean') throw new OrderCreationError(code);
    return value;
}

function getConfiguredDeliveryTariff(env = process.env) {
    const raw = String(env.DELIVERY_TARIFF_RUB ?? '').trim();
    if (!/^\d+$/.test(raw)) throw new OrderCreationError('DELIVERY_TARIFF_NOT_CONFIGURED', 503);
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new OrderCreationError('DELIVERY_TARIFF_NOT_CONFIGURED', 503);
    }
    return value;
}

function normalizeItems(items) {
    if (!Array.isArray(items) || items.length === 0) throw new OrderCreationError('NO_ITEMS');
    if (items.length > MAX_ITEMS) throw new OrderCreationError('TOO_MANY_ITEMS');

    const quantities = new Map();
    for (const item of items) {
        const productId = Number(item?.productId);
        const quantity = Number(item?.quantity);
        if (!Number.isSafeInteger(productId) || productId <= 0) throw new OrderCreationError('BAD_PRODUCT_ID');
        if (!Number.isSafeInteger(quantity) || quantity <= 0 || quantity > MAX_QUANTITY) {
            throw new OrderCreationError('BAD_QUANTITY');
        }
        const next = (quantities.get(productId) || 0) + quantity;
        if (!Number.isSafeInteger(next) || next > MAX_QUANTITY) throw new OrderCreationError('BAD_QUANTITY');
        quantities.set(productId, next);
    }

    return [...quantities.entries()]
        .map(([productId, quantity]) => ({ productId, quantity }))
        .sort((a, b) => a.productId - b.productId);
}

function normalizeAnalytics(value) {
    if (value == null) return { sessionId: null, attribution: null };
    if (typeof value !== 'object' || Array.isArray(value)) throw new OrderCreationError('BAD_ANALYTICS');
    const sessionId = String(value.sessionId || '').trim();
    if (!/^[A-Za-z0-9][A-Za-z0-9:_-]{7,95}$/.test(sessionId)) throw new OrderCreationError('BAD_ANALYTICS_SESSION');
    const source = value.attribution && typeof value.attribution === 'object' && !Array.isArray(value.attribution) ? value.attribution : {};
    const attribution = {};
    for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'referrerHost']) {
        const item = String(source[key] || '').trim();
        if (!item) continue;
        const hasControlCharacter = [...item].some((character) => {
            const codePoint = character.codePointAt(0);
            return codePoint <= 31 || codePoint === 127;
        });
        if (item.length > (key === 'referrerHost' ? 255 : 80) || hasControlCharacter) throw new OrderCreationError('BAD_ANALYTICS_ATTRIBUTION');
        attribution[key] = item;
    }
    for (const key of ['yclid', 'mt_click_id']) {
        const item = String(source[key] || '').trim();
        if (!item) continue;
        if (item.length > 256 || !/^[A-Za-z0-9._:-]+$/.test(item)) throw new OrderCreationError('BAD_ANALYTICS_ATTRIBUTION');
        attribution[`${key}Hash`] = crypto.createHash('sha256').update(`${key}:${item}`).digest('hex');
    }
    return { sessionId, attribution: Object.keys(attribution).length ? attribution : null };
}

function normalizeOrderRequest(body) {
    if (body?.consentPersonal !== true) throw new OrderCreationError('CONSENT_REQUIRED');
    const checkoutKey = boundedString(body?.checkoutKey, { code: 'BAD_CHECKOUT_KEY', min: 1, max: 64 }).toLowerCase();
    if (!CHECKOUT_KEY_RE.test(checkoutKey)) throw new OrderCreationError('BAD_CHECKOUT_KEY');

    const askRecipientAddress = optionalBoolean(body?.askRecipientAddress, 'BAD_ASK_RECIPIENT_ADDRESS');
    const askRecipientTime = optionalBoolean(body?.askRecipientTime, 'BAD_ASK_RECIPIENT_TIME');
    const deliveryAddress = boundedString(body?.deliveryAddress, {
        code: 'DELIVERY_ADDRESS_REQUIRED',
        min: askRecipientAddress ? 0 : 6,
        max: 500,
    });
    if (deliveryAddress && ['no delivery address required', 'адрес уточнить у клиента'].includes(deliveryAddress.toLowerCase())) {
        throw new OrderCreationError('DELIVERY_ADDRESS_REQUIRED');
    }
    const deliveryTime = boundedString(body?.deliveryTime, {
        code: 'BAD_DELIVERY_TIME',
        min: 0,
        max: 100,
    });
    const recipientPhoneRequired = askRecipientAddress || askRecipientTime;

    return {
        checkoutKey,
        items: normalizeItems(body?.items),
        askRecipientAddress,
        askRecipientTime,
        deliveryAddress: deliveryAddress || null,
        deliveryCoords: normalizeDeliveryCoords(body?.deliveryCoords),
        deliveryTime: deliveryTime || null,
        recipientName: boundedString(body?.recipientName, { code: 'RECIPIENT_NAME_REQUIRED', min: 1, max: 100 }),
        recipientPhone: normalizePhone(body?.recipientPhone, recipientPhoneRequired, 'BAD_RECIPIENT_PHONE'),
        senderPhone: normalizePhone(body?.senderPhone, true, 'BAD_SENDER_PHONE'),
        floristComment: boundedString(body?.floristComment, { code: 'BAD_FLORIST_COMMENT', max: 1000 }) || null,
        consentPersonal: true,
        analytics: normalizeAnalytics(body?.analytics),
    };
}

function stableJson(value) {
    if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
    if (value && typeof value === 'object') {
        return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
}

function payloadDigest(normalized) {
    const payload = { ...normalized };
    delete payload.checkoutKey;
    delete payload.analytics;
    return crypto.createHash('sha256').update(stableJson(payload)).digest('hex').slice(0, 24);
}

function idempotencyParts(userId, normalized) {
    if (!Number.isSafeInteger(userId) || userId <= 0) throw new OrderCreationError('UNAUTHORIZED', 401);
    const prefix = `v1:u${userId}:${normalized.checkoutKey}:`;
    return { prefix, value: `${prefix}${payloadDigest(normalized)}` };
}

function advisoryLockId(value) {
    const unsigned = BigInt(`0x${crypto.createHash('sha256').update(value).digest('hex').slice(0, 16)}`);
    return unsigned > 0x7fffffffffffffffn ? unsigned - 0x10000000000000000n : unsigned;
}

function safeMoney(value, code = 'INVALID_PRODUCT_PRICE') {
    const number = Number(value);
    if (!Number.isSafeInteger(number) || number < 0) throw new OrderCreationError(code, 409);
    return number;
}

function safeAdd(a, b) {
    const total = a + b;
    if (!Number.isSafeInteger(total) || total < 0) throw new OrderCreationError('ORDER_TOTAL_OVERFLOW');
    return total;
}

async function createOrder({ prisma, userId, body, now = () => new Date(), env = process.env, geocodeDelivery }) {
    const normalized = normalizeOrderRequest(body);
    const key = idempotencyParts(userId, normalized);
    const replay = await prisma.order.findFirst({
        where: { checkoutKey: { startsWith: key.prefix } },
        include: { items: { include: { product: true } }, user: true },
    });
    if (replay) {
        if (replay.checkoutKey !== key.value) throw new OrderCreationError('IDEMPOTENCY_KEY_REUSED', 409);
        return { order: replay, replayed: true };
    }
    let quote = null;
    try {
        if (!normalized.askRecipientAddress) quote = await resolveDeliveryPrice({ prisma, address: normalized.deliveryAddress, env, geocodeImpl: geocodeDelivery });
    } catch (error) {
        if (error instanceof DeliveryZoneError) throw new OrderCreationError(error.code, error.status);
        throw error;
    }
    const deliveryCost = quote?.price ?? null;

    return prisma.$transaction(async (tx) => {
        await tx.$queryRawUnsafe('SELECT pg_advisory_xact_lock($1::bigint)::text AS lock', advisoryLockId(key.prefix).toString());

        const existing = await tx.order.findFirst({
            where: { checkoutKey: { startsWith: key.prefix } },
            include: { items: { include: { product: true } }, user: true },
        });
        if (existing) {
            if (existing.checkoutKey !== key.value) throw new OrderCreationError('IDEMPOTENCY_KEY_REUSED', 409);
            return { order: existing, replayed: true };
        }

        const productIds = normalized.items.map((item) => item.productId);
        const products = await tx.product.findMany({
            where: { id: { in: productIds } },
            select: { id: true, price: true, discount: true, isActive: true },
        });
        const productsById = new Map(products.map((product) => [product.id, product]));

        let itemsTotal = 0;
        const orderItems = normalized.items.map((item) => {
            const product = productsById.get(item.productId);
            if (!product || !product.isActive) throw new OrderCreationError('PRODUCT_UNAVAILABLE', 409);
            const basePrice = safeMoney(product.price);
            const discount = safeMoney(product.discount);
            const unitPrice = Math.max(0, basePrice - discount);
            const lineTotal = unitPrice * item.quantity;
            if (!Number.isSafeInteger(lineTotal)) throw new OrderCreationError('ORDER_TOTAL_OVERFLOW');
            itemsTotal = safeAdd(itemsTotal, lineTotal);
            return { productId: item.productId, quantity: item.quantity, price: unitPrice };
        });

        const totalPrice = deliveryCost == null ? itemsTotal : safeAdd(itemsTotal, deliveryCost);
        if (totalPrice <= 0) throw new OrderCreationError('INVALID_ORDER_TOTAL');

        const user = await tx.user.findUnique({
            where: { id: userId },
            select: { id: true, referralLinkId: true },
        });
        if (!user) throw new OrderCreationError('UNAUTHORIZED', 401);

        const createdAt = now();
        const paymentExpiresAt = new Date(createdAt.getTime() + 15 * 60 * 1000);
        const order = await tx.order.create({
            data: {
                userId,
                checkoutKey: key.value,
                status: 'PAYMENT_PENDING',
                paymentMethod: 'alfa',
                paymentStatus: 'PENDING',
                paymentClientConfirmed: false,
                paymentExpiresAt,
                floristComment: normalized.floristComment,
                senderPhone: normalized.senderPhone,
                consentPersonal: true,
                itemsTotal,
                deliveryCost,
                totalPrice,
                analyticsSessionId: normalized.analytics.sessionId,
                analyticsAttribution: normalized.analytics.attribution,
                referralLinkId: user.referralLinkId ?? null,
                deliveryAddress: normalized.deliveryAddress,
                deliveryCoords: quote?.coords || normalized.deliveryCoords,
                deliveryTime: normalized.deliveryTime,
                recipientName: normalized.recipientName,
                recipientPhone: normalized.recipientPhone,
                askRecipientAddress: normalized.askRecipientAddress,
                askRecipientTime: normalized.askRecipientTime,
                deliveryStatus: normalized.askRecipientAddress || normalized.askRecipientTime
                    ? 'DETAILS_PENDING'
                    : 'INCLUDED_IN_MAIN',
                items: { create: orderItems },
            },
            include: { items: { include: { product: true } }, user: true },
        });

        await tx.orderStatusHistory.create({ data: { orderId: order.id, status: 'NEW' } });
        await tx.chat.create({ data: { userId, orderId: order.id } });
        return { order, replayed: false };
    });
}

module.exports = {
    OrderCreationError,
    createOrder,
    getConfiguredDeliveryTariff,
    normalizeOrderRequest,
};
