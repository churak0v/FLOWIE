const crypto = require('crypto');
const { resolveDeliveryPrice } = require('./deliveryZones');

const QUOTE_KEY_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STAFF_ROLES = new Set(['admin', 'moderator', 'florist']);

class DeliveryPaymentError extends Error {
  constructor(code, status = 400) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

function boundedString(value, { code, min = 0, max }) {
  const normalized = String(value || '').trim();
  if (normalized.length < min || normalized.length > max) throw new DeliveryPaymentError(code);
  return normalized;
}

function invoiceTtlMs(env = process.env) {
  const raw = String(env.DELIVERY_INVOICE_TTL_HOURS ?? '24').trim();
  const hours = Number(raw);
  if (!Number.isInteger(hours) || hours < 1 || hours > 168) throw new DeliveryPaymentError('DELIVERY_INVOICE_TTL_INVALID', 503);
  return hours * 60 * 60 * 1000;
}

function normalizeQuoteRequest(order, body) {
  const quoteKey = boundedString(body?.quoteKey, { code: 'BAD_QUOTE_KEY', min: 1, max: 64 }).toLowerCase();
  if (!QUOTE_KEY_RE.test(quoteKey)) throw new DeliveryPaymentError('BAD_QUOTE_KEY');

  const deliveryAddress = boundedString(body?.deliveryAddress ?? order.deliveryAddress, {
    code: 'DELIVERY_ADDRESS_REQUIRED',
    min: 6,
    max: 500,
  });
  const deliveryTime = boundedString(body?.deliveryTime ?? order.deliveryTime, {
    code: order.askRecipientTime ? 'DELIVERY_TIME_REQUIRED' : 'BAD_DELIVERY_TIME',
    min: order.askRecipientTime ? 1 : 0,
    max: 100,
  }) || null;

  let amount = null;
  if (order.askRecipientAddress) {
    amount = body?.amount;
    if (typeof amount !== 'number' || !Number.isSafeInteger(amount) || amount < 0) {
      throw new DeliveryPaymentError('BAD_DELIVERY_AMOUNT');
    }
  } else if (body?.amount != null) {
    throw new DeliveryPaymentError('DELIVERY_ALREADY_INCLUDED', 409);
  }

  const normalized = { quoteKey, deliveryAddress, deliveryTime, amount };
  const digest = crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
  return { ...normalized, digest };
}

function quoteLockId(orderId) {
  return `delivery-quote:${orderId}`;
}

function publicDeliveryInvoice(invoice, now = Date.now()) {
  if (!invoice) return null;
  let manualSurcharges = [];
  try {
    const meta = invoice.paymentMeta ? JSON.parse(invoice.paymentMeta) : {};
    manualSurcharges = Array.isArray(meta.manualSurcharges)
      ? meta.manualSurcharges.map((item) => ({ amount: Number(item.amount) || 0, reason: String(item.reason || '').slice(0, 200) }))
      : [];
  } catch {}
  const expiresAt = invoice.paymentExpiresAt ? new Date(invoice.paymentExpiresAt).getTime() : NaN;
  const status = invoice.status === 'PAYMENT_PENDING' && Number.isFinite(expiresAt) && expiresAt <= now
    ? 'EXPIRED'
    : invoice.status;
  return {
    id: invoice.id,
    orderId: invoice.orderId,
    amount: invoice.amount,
    currency: invoice.currency,
    status,
    paymentExpiresAt: invoice.paymentExpiresAt,
    paidAt: invoice.paidAt,
    registered: Boolean(invoice.paymentChargeId && !String(invoice.paymentChargeId).startsWith('registering:')),
    manualSurcharges,
  };
}

async function issueDeliveryQuote({ prisma, orderId, staffUserId, body, now = () => new Date(), env = process.env, resolvePrice = resolveDeliveryPrice }) {
  const numericOrderId = Number(orderId);
  const numericStaffId = Number(staffUserId);
  if (!Number.isSafeInteger(numericOrderId) || numericOrderId <= 0) throw new DeliveryPaymentError('BAD_ORDER_ID');
  if (!Number.isSafeInteger(numericStaffId) || numericStaffId <= 0) throw new DeliveryPaymentError('UNAUTHORIZED', 401);

  return prisma.$transaction(async (tx) => {
    await tx.$queryRawUnsafe('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))::text AS lock', quoteLockId(numericOrderId));
    await tx.$queryRawUnsafe('SELECT "id" FROM "Order" WHERE "id" = $1 FOR UPDATE', numericOrderId);
    const staff = await tx.user.findUnique({
      where: { id: numericStaffId },
      select: { id: true, staffRole: true, staffActive: true },
    });
    if (!staff || !staff.staffActive || !STAFF_ROLES.has(staff.staffRole)) {
      throw new DeliveryPaymentError('FORBIDDEN', 403);
    }

    const order = await tx.order.findUnique({
      where: { id: numericOrderId },
      include: { deliveryInvoice: true },
    });
    if (!order) throw new DeliveryPaymentError('NOT_FOUND', 404);
    if (String(order.status || '').toUpperCase() === 'CANCELLED') throw new DeliveryPaymentError('ORDER_CANCELLED', 409);
    if (String(order.status || '').toUpperCase() === 'DELIVERED') throw new DeliveryPaymentError('ORDER_ALREADY_DELIVERED', 409);
    if (String(order.paymentStatus || '').toUpperCase() !== 'CONFIRMED') {
      throw new DeliveryPaymentError('MAIN_PAYMENT_REQUIRED', 409);
    }

    const price = order.askRecipientAddress
      ? await resolvePrice({ prisma: tx, address: body?.deliveryAddress, env })
      : null;
    const normalized = normalizeQuoteRequest(order, {
      ...body,
      ...(price ? { amount: price.price } : {}),
    });
    if (order.deliveryQuoteKey) {
      if (order.deliveryQuoteKey !== normalized.quoteKey || order.deliveryQuoteDigest !== normalized.digest) {
        throw new DeliveryPaymentError('DELIVERY_QUOTE_ALREADY_ISSUED', 409);
      }
      return { order, invoice: order.deliveryInvoice || null, replayed: true };
    }

    const quotedAt = now();
    let invoice = null;
    let deliveryStatus = 'INCLUDED_IN_MAIN';
    let deliveryCost = order.deliveryCost;
    if (order.askRecipientAddress) {
      deliveryCost = normalized.amount;
      deliveryStatus = normalized.amount === 0 ? 'WAIVED' : 'PAYMENT_PENDING';
      if (normalized.amount > 0) {
        invoice = await tx.deliveryInvoice.create({
          data: {
            orderId: order.id,
            amount: normalized.amount,
            currency: '643',
            status: 'PAYMENT_PENDING',
            paymentExpiresAt: new Date(quotedAt.getTime() + invoiceTtlMs(env)),
          },
        });
      }
    } else if (deliveryCost == null) {
      throw new DeliveryPaymentError('DELIVERY_TARIFF_MISSING', 409);
    }

    const updated = await tx.order.update({
      where: { id: order.id },
      data: {
        deliveryAddress: normalized.deliveryAddress,
        deliveryTime: normalized.deliveryTime,
        deliveryCost,
        deliveryStatus,
        deliveryQuoteKey: normalized.quoteKey,
        deliveryQuoteDigest: normalized.digest,
      },
      include: { deliveryInvoice: true },
    });
    return { order: updated, invoice: invoice || updated.deliveryInvoice || null, replayed: false };
  });
}

module.exports = {
  DeliveryPaymentError,
  invoiceTtlMs,
  issueDeliveryQuote,
  normalizeQuoteRequest,
  publicDeliveryInvoice,
};
