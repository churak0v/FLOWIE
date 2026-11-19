const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const { requireAuth } = require('../middleware/auth');
const crypto = require('crypto');
const { recordServerEventSafe } = require('../services/analytics');
const { enqueueOrderNotificationSafe } = require('../services/telegramOrders');
const {
  invoiceTtlMs,
  publicDeliveryInvoice,
} = require('../services/deliveryPayment');

let prisma = new PrismaClient();

const ALFA_CURRENCY_RUB = '643';
const REGISTRATION_LOCK_TTL_MS = 30_000;

function getPublicSiteUrl() {
  return String(process.env.PUBLIC_SITE_URL || '').trim();
}

function getAlfaConfig() {
  const mode = String(process.env.ALFA_BANK_MODE || 'test').trim().toLowerCase();
  const userName = String(process.env.ALFA_BANK_USER_NAME || '').trim();
  const baseUrl = String(
    process.env.ALFA_BANK_API_URL ||
    (mode === 'prod' || mode === 'production'
      ? (userName.startsWith('r-') ? 'https://payment.alfabank.ru/payment/rest' : 'https://pay.alfabank.ru/payment/rest')
      : 'https://alfa.rbsuat.com/payment/rest')
  ).replace(/\/$/, '');

  const taxSystem = String(process.env.ALFA_TAX_SYSTEM || '1').trim();
  if (!/^[0-5]$/.test(taxSystem)) throw new Error('ALFA_TAX_SYSTEM_INVALID');
  const taxType = String(process.env.ALFA_TAX_TYPE || '0').trim();
  if (!/^[0-6]$/.test(taxType)) throw new Error('ALFA_TAX_TYPE_INVALID');

  return {
    taxSystem,
    taxType,
    enabled: String(process.env.ALFA_BANK_ENABLED || '').toLowerCase() === 'true',
    mode,
    baseUrl,
    userName,
    password: String(process.env.ALFA_BANK_PASSWORD || '').trim(),
    token: String(process.env.ALFA_BANK_TOKEN || '').trim(),
  };
}

function validateAlfaFormUrl(value) {
  let formUrl;
  try {
    formUrl = new URL(String(value || ''));
  } catch {
    throw Object.assign(new Error('ALFA_PAYMENT_URL_INVALID'), { httpStatus: 502 });
  }
  if (formUrl.protocol !== 'https:' || formUrl.port || formUrl.username || formUrl.password || formUrl.hash) {
    throw Object.assign(new Error('ALFA_PAYMENT_URL_INVALID'), { httpStatus: 502 });
  }
  return formUrl.href;
}

function receiptName(value, fallback) {
  const normalized = String(value || fallback || '').replace(/\s+/g, ' ').trim();
  return (normalized || fallback || 'Товар').slice(0, 100);
}

function receiptItem({ positionId, name, quantity, unitPriceRub, itemCode, paymentObject = '1' }) {
  const quantityValue = Number(quantity);
  const unitPrice = expectedRubKopecks(unitPriceRub);
  if (!Number.isSafeInteger(quantityValue) || quantityValue <= 0) throw new Error('INVALID_RECEIPT_QUANTITY');
  const itemAmount = unitPrice * quantityValue;
  if (!Number.isSafeInteger(itemAmount)) throw new Error('INVALID_RECEIPT_AMOUNT');
  return {
    positionId: String(positionId),
    name: receiptName(name, 'Товар'),
    quantity: { value: String(quantityValue), measure: 'шт' },
    itemAmount,
    itemCode: String(itemCode).slice(0, 100),
    tax: { taxType: Number(getAlfaConfig().taxType) },
    itemPrice: unitPrice,
    itemAttributes: {
      attributes: [
        { name: 'paymentMethod', value: '1' },
        { name: 'paymentObject', value: String(paymentObject) },
      ],
    },
  };
}

function buildOrderBundle(order) {
  const items = (order?.items || []).map((item, index) => receiptItem({
    positionId: index + 1,
    name: item?.product?.name,
    quantity: item.quantity,
    unitPriceRub: item.price,
    itemCode: `product-${item.productId}`,
  }));
  if (Number(order?.deliveryCost) > 0) {
    items.push(receiptItem({
      positionId: items.length + 1,
      name: 'Доставка',
      quantity: 1,
      unitPriceRub: order.deliveryCost,
      itemCode: `delivery-${order.id}`,
      paymentObject: '4',
    }));
  }
  if (!items.length) throw new Error('RECEIPT_ITEMS_REQUIRED');
  const sum = items.reduce((total, item) => total + item.itemAmount, 0);
  if (sum !== expectedAmountKopecks(order)) throw new Error('RECEIPT_AMOUNT_MISMATCH');
  return JSON.stringify({ cartItems: { items } });
}

function buildDeliveryOrderBundle(order, invoice) {
  return JSON.stringify({
    cartItems: {
      items: [receiptItem({
        positionId: 1,
        name: `Доставка заказа #${order.id}`,
        quantity: 1,
        unitPriceRub: invoice.amount,
        itemCode: `delivery-invoice-${invoice.id}`,
        paymentObject: '4',
      })],
    },
  });
}

function isAlfaConfigured() {
  const cfg = getAlfaConfig();
  return Boolean(cfg.enabled && (cfg.token || (cfg.userName && cfg.password)));
}

function parsePaymentMeta(meta) {
  try {
    return meta ? JSON.parse(meta) : {};
  } catch {
    return {};
  }
}

function buildPublicUrl(pathname) {
  const publicUrl = getPublicSiteUrl();
  if (!publicUrl) return '';
  return `${publicUrl.replace(/\/$/, '')}${pathname}`;
}

function validateAlfaRegistrationConfig() {
  const cfg = getAlfaConfig();
  const publicUrl = getPublicSiteUrl();
  if (!publicUrl) throw new Error('PUBLIC_SITE_URL_NOT_CONFIGURED');
  let parsed;
  try {
    parsed = new URL(publicUrl);
  } catch {
    throw new Error('PUBLIC_SITE_URL_INVALID');
  }
  if ((cfg.mode === 'prod' || cfg.mode === 'production') && parsed.protocol !== 'https:') {
    throw new Error('PUBLIC_SITE_URL_MUST_USE_HTTPS');
  }
}

async function alfaRequest(method, params) {
  const cfg = getAlfaConfig();
  if (!isAlfaConfigured()) throw new Error('ALFA_BANK_NOT_CONFIGURED');

  const body = new URLSearchParams({
    ...Object.fromEntries(
      Object.entries(params || {})
        .filter(([, v]) => v !== undefined && v !== null && String(v) !== '')
        .map(([k, v]) => [k, String(v)])
    ),
    ...(cfg.token ? { token: cfg.token } : { userName: cfg.userName, password: cfg.password }),
  });

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12_000);
  try {
    const res = await fetch(`${cfg.baseUrl}/${method}.do`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body,
      signal: ctrl.signal,
      redirect: 'error',
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const err = new Error(data?.errorMessage || `ALFA_HTTP_${res.status}`);
      err.data = data;
      throw err;
    }
    if (data?.errorCode && String(data.errorCode) !== '0') {
      const err = new Error(data?.errorMessage || `ALFA_ERROR_${data.errorCode}`);
      err.data = data;
      throw err;
    }
    return data || {};
  } finally {
    clearTimeout(timer);
  }
}

function hostedPaymentResponse(formUrl) {
  return { ok: true, paymentMethod: 'alfa', formUrl: validateAlfaFormUrl(formUrl) };
}

function sbpError(code, httpStatus = 502) {
  return Object.assign(new Error(code), { httpStatus });
}

function validateSbpPaymentUrl(result) {
  if (result?.qrStatus !== 'STARTED') throw sbpError('ALFA_SBP_QR_UNAVAILABLE');
  const payload = String(result?.payload || '');
  if (!payload || payload.length > 4096) throw sbpError('ALFA_SBP_URL_INVALID');
  let paymentUrl;
  try {
    paymentUrl = new URL(payload);
  } catch {
    throw sbpError('ALFA_SBP_URL_INVALID');
  }
  if (
    paymentUrl.protocol !== 'https:' ||
    paymentUrl.hostname !== 'qr.nspk.ru' ||
    paymentUrl.port ||
    paymentUrl.username ||
    paymentUrl.password ||
    paymentUrl.hash ||
    paymentUrl.pathname === '/'
  ) {
    throw sbpError('ALFA_SBP_URL_INVALID');
  }
  return paymentUrl.href;
}

async function directSbpPaymentResponse(bankOrderId, redirectUrl) {
  const result = await alfaRequest('sbp/c2b/qr/dynamic/get', {
    mdOrder: bankOrderId,
    qrFormat: 'image',
    qrWidth: 300,
    qrHeight: 300,
    redirectUrl,
  });
  return {
    ok: true,
    paymentMethod: 'sbp',
    formUrl: validateSbpPaymentUrl(result),
  };
}

function alfaOrderNumber(orderId) {
  const random = crypto.randomBytes(3).toString('hex');
  return `flowie-${orderId}-${Date.now().toString(36)}-${random}`.slice(0, 36);
}

function alfaDeliveryOrderNumber(orderId) {
  const random = crypto.randomBytes(3).toString('hex');
  return `flowie-delivery-${orderId}-${Date.now().toString(36)}-${random}`.slice(0, 36);
}

function expectedRubKopecks(value) {
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('INVALID_ORDER_AMOUNT');
  return amount * 100;
}

function expectedAmountKopecks(order) {
  return expectedRubKopecks(order?.totalPrice);
}

function validateCapturedAmount(amountRub, result) {
  const expectedAmount = expectedRubKopecks(amountRub);
  const actualAmount = Number(result?.amount);
  const currency = String(result?.currency || '');
  if (!Number.isSafeInteger(actualAmount) || actualAmount !== expectedAmount) {
    const err = new Error('ALFA_AMOUNT_MISMATCH');
    err.code = 'ALFA_AMOUNT_MISMATCH';
    throw err;
  }
  if (currency !== ALFA_CURRENCY_RUB) {
    const err = new Error('ALFA_CURRENCY_MISMATCH');
    err.code = 'ALFA_CURRENCY_MISMATCH';
    throw err;
  }
}

function validateCapturedPayment(order, result) {
  validateCapturedAmount(order?.totalPrice, result);
}

function isCancelled(order) {
  return String(order?.status || '').toUpperCase() === 'CANCELLED';
}

function isRetryableBankStatus(status) {
  return status === 3 || status === 6;
}

function isExpired(order) {
  const expiresAt = order?.paymentExpiresAt ? new Date(order.paymentExpiresAt).getTime() : NaN;
  return Number.isFinite(expiresAt) && expiresAt <= Date.now();
}

function paymentTimeoutSeconds(order) {
  const expiresAt = order?.paymentExpiresAt ? new Date(order.paymentExpiresAt).getTime() : NaN;
  if (!Number.isFinite(expiresAt)) throw new Error('PAYMENT_EXPIRY_MISSING');
  return Math.max(1, Math.floor((expiresAt - Date.now()) / 1000));
}

function registrationLock() {
  return `registering:${Date.now()}:${crypto.randomBytes(6).toString('hex')}`;
}

function isFreshRegistrationLock(value) {
  const match = /^registering:(\d+):/.exec(String(value || ''));
  return Boolean(match && Date.now() - Number(match[1]) < REGISTRATION_LOCK_TTL_MS);
}

async function markOrderPaid(order, paymentMeta = {}, bankOrderId) {
  if (!order) return order;
  if (String(order.paymentStatus || '').toUpperCase() === 'CONFIRMED') {
    await recordServerEventSafe(prisma, {
      event: 'payment_success',
      userId: order.userId,
      orderId: order.id,
    });
    return order;
  }
  if (isCancelled(order)) return null;
  let newlyPaid = false;
  const updated = await prisma.$transaction(async (tx) => {
    const claimed = await tx.order.updateMany({
      where: {
        id: order.id,
        paymentStatus: { not: 'CONFIRMED' },
        status: { not: 'CANCELLED' },
        ...(bankOrderId ? { paymentChargeId: bankOrderId } : {}),
      },
      data: {
        status: 'PAID',
        paymentStatus: 'CONFIRMED',
        paidAt: new Date(),
        paymentMeta: JSON.stringify({ ...parsePaymentMeta(order.paymentMeta), ...paymentMeta }),
      },
    });
    if (claimed.count === 1) {
      newlyPaid = true;
      await tx.orderStatusHistory.create({
        data: { orderId: order.id, status: 'PAID' },
      });
    }
    return tx.order.findUnique({ where: { id: order.id } });
  });
  if (newlyPaid) {
    await recordServerEventSafe(prisma, {
      event: 'payment_success',
      userId: order.userId,
      orderId: order.id,
    });
    await enqueueOrderNotificationSafe(prisma, order.id, 'ORDER_PAID');
  }
  return updated;
}

async function reconcilePendingMainPayments() {
  if (!isAlfaConfigured()) return 0;
  const orders = await prisma.order.findMany({
    where: {
      paymentStatus: { not: 'CONFIRMED' },
      status: { not: 'CANCELLED' },
      paymentChargeId: { not: null },
      createdAt: { gte: new Date(Date.now() - 48 * 60 * 60 * 1000) },
    },
    orderBy: { createdAt: 'asc' },
    take: 25,
  });
  let confirmed = 0;
  for (const order of orders) {
    const bankOrderId = String(order.paymentChargeId || '');
    if (!bankOrderId || bankOrderId.startsWith('registering:')) continue;
    try {
      const result = await alfaRequest('getOrderStatusExtended', { orderId: bankOrderId });
      const bankStatus = Number(result?.orderStatus);
      const meta = parsePaymentMeta(order.paymentMeta);
      const nextMeta = {
        ...meta,
        alfa: {
          ...(meta.alfa || {}),
          lastStatus: Number.isFinite(bankStatus) ? bankStatus : result?.orderStatus,
          lastStatusAt: new Date().toISOString(),
          actionCode: result?.actionCode,
          actionCodeDescription: result?.actionCodeDescription,
          confirmedAmount: result?.amount,
          confirmedCurrency: result?.currency,
        },
      };
      if (bankStatus === 2) {
        validateCapturedPayment(order, result);
        await markOrderPaid(order, nextMeta, bankOrderId);
        confirmed += 1;
      } else {
        await prisma.order.updateMany({
          where: { id: order.id, paymentStatus: { not: 'CONFIRMED' }, paymentChargeId: bankOrderId },
          data: { paymentMeta: JSON.stringify(nextMeta) },
        });
      }
    } catch (error) {
      console.warn('[payment-reconciliation] order check failed', { orderId: order.id, error: error?.message || error });
    }
  }
  return confirmed;
}

function startPaymentReconciliation() {
  if (process.env.NODE_ENV !== 'production' || !isAlfaConfigured()) return null;
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const confirmed = await reconcilePendingMainPayments();
      if (confirmed) console.log(`[payment-reconciliation] confirmed ${confirmed} order(s)`);
    } catch (error) {
      console.warn('[payment-reconciliation] tick failed:', error?.message || error);
    } finally {
      running = false;
    }
  };
  setTimeout(tick, 3_000).unref?.();
  const timer = setInterval(tick, 15_000);
  timer.unref?.();
  return () => clearInterval(timer);
}

function deliveryInvoiceExpired(invoice) {
  const expiresAt = invoice?.paymentExpiresAt ? new Date(invoice.paymentExpiresAt).getTime() : NaN;
  return Number.isFinite(expiresAt) && expiresAt <= Date.now();
}

function deliveryPaymentTimeoutSeconds(invoice) {
  const expiresAt = invoice?.paymentExpiresAt ? new Date(invoice.paymentExpiresAt).getTime() : NaN;
  if (!Number.isFinite(expiresAt)) throw new Error('DELIVERY_PAYMENT_EXPIRY_MISSING');
  return Math.max(1, Math.floor((expiresAt - Date.now()) / 1000));
}

async function markDeliveryInvoicePaid(invoice, paymentMeta, bankOrderId) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRawUnsafe('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))::text AS lock', `delivery-payment:${invoice.id}`);
    await tx.$queryRawUnsafe('SELECT "id" FROM "Order" WHERE "id" = $1 FOR UPDATE', invoice.orderId);
    const current = await tx.deliveryInvoice.findUnique({ where: { id: invoice.id } });
    if (!current) return null;
    if (current.status === 'PAID') return current;
    const order = await tx.order.findUnique({ where: { id: current.orderId } });
    if (!order || String(order.status || '').toUpperCase() === 'CANCELLED') {
      const paidAt = new Date();
      const reconciled = await tx.deliveryInvoice.update({
        where: { id: current.id },
        data: {
          status: 'RECONCILIATION_REQUIRED',
          paidAt,
          cancelledAt: new Date(),
          paymentMeta: JSON.stringify(paymentMeta),
        },
      });
      if (order) {
        await tx.order.update({
          where: { id: order.id },
          data: { deliveryStatus: 'RECONCILIATION_REQUIRED' },
        });
      }
      return reconciled;
    }
    if (current.paymentChargeId !== bankOrderId || current.status !== 'PAYMENT_PENDING') return current;
    const paidAt = new Date();
    const updated = await tx.deliveryInvoice.update({
      where: { id: current.id },
      data: { status: 'PAID', paidAt, paymentMeta: JSON.stringify(paymentMeta) },
    });
    await tx.order.update({
      where: { id: order.id },
      data: { deliveryStatus: 'PAID' },
    });
    return updated;
  });
}

function rubPerUsd() {
  const n = Number(process.env.RUB_PER_USD || 82);
  return Number.isFinite(n) && n > 0 ? n : 82;
}

function getPaymentInfo() {
  return {
    cardNumber: String(process.env.PAYMENT_CARD_NUMBER || '2202 2065 5716 9211'),
    receiverName: String(process.env.PAYMENT_RECEIVER_NAME || 'Аделина Ч.'),
    bankName: String(process.env.PAYMENT_BANK_NAME || 'Сбербанк'),
    rubPerUsd: rubPerUsd(),
  };
}

// GET /api/payments/manual?orderId=123
router.get('/manual', requireAuth, async (req, res) => {
  try {
    const orderId = Number(req.query?.orderId);
    if (!Number.isFinite(orderId)) return res.status(400).json({ ok: false, error: 'BAD_ORDER_ID' });

    const order = await prisma.order.findFirst({
      where: { id: orderId, userId: req.user.id },
      include: { user: true, items: { include: { product: true } }, photos: true },
    });
    if (!order) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });

    const info = getPaymentInfo();
    return res.json({
      ok: true,
      order: {
        id: order.id,
        amount: order.totalPrice,
        paymentStatus: order.paymentStatus,
        paymentClientConfirmed: order.paymentClientConfirmed,
        paymentMethod: order.paymentMethod,
        paymentExpiresAt: order.paymentExpiresAt,
        status: order.status,
        deliveryAddress: order.askRecipientAddress ? null : order.deliveryAddress,
        deliveryTime: order.askRecipientTime ? null : order.deliveryTime,
        recipientDetailsReceived: Boolean(order.askRecipientAddress || order.askRecipientTime) &&
          (!order.askRecipientAddress || Boolean(String(order.deliveryAddress || '').trim())) &&
          (!order.askRecipientTime || Boolean(String(order.deliveryTime || '').trim())),
        deliveryCost: order.deliveryCost,
        deliveryStatus: order.deliveryStatus,
        askRecipientAddress: order.askRecipientAddress,
        askRecipientTime: order.askRecipientTime,
        recipientName: order.recipientName,
        recipientPhone: order.recipientPhone,
        floristComment: order.floristComment,
        items: order.items,
        photos: (order.photos || []).filter((photo) => Boolean(photo.sentToClientAt)),
        preDeliveryRating: order.preDeliveryRating,
        preDeliveryRatedAt: order.preDeliveryRatedAt,
        deliveredAt: order.deliveredAt,
      },
      payment: {
        ...info,
        alfa: {
          enabled: isAlfaConfigured(),
          mode: getAlfaConfig().mode,
          registered: Boolean(order.paymentChargeId && !String(order.paymentChargeId).startsWith('registering:')),
        },
      },
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || 'PAYMENT_INFO_FAILED' });
  }
});

// POST /api/payments/alfa-register { orderId }
router.post('/alfa-register', requireAuth, async (req, res) => {
  let acquiredLock = null;
  try {
    const orderId = Number(req.body?.orderId);
    if (!Number.isFinite(orderId)) return res.status(400).json({ ok: false, error: 'BAD_ORDER_ID' });

    const order = await prisma.order.findFirst({
      where: { id: orderId, userId: req.user.id },
      include: { items: { include: { product: true } }, user: true },
    });
    if (!order) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
    if (String(order.paymentStatus || '').toUpperCase() === 'CONFIRMED') {
      return res.json({ ok: true, alreadyPaid: true });
    }
    if (isCancelled(order)) return res.status(409).json({ ok: false, error: 'ORDER_CANCELLED' });
    if (isExpired(order)) return res.status(409).json({ ok: false, error: 'PAYMENT_EXPIRED' });
    if (!isAlfaConfigured()) return res.status(500).json({ ok: false, error: 'ALFA_BANK_NOT_CONFIGURED' });
    validateAlfaRegistrationConfig();

    const existingMeta = parsePaymentMeta(order.paymentMeta);
    if (order.paymentChargeId && !String(order.paymentChargeId).startsWith('registering:')) {
      const bankOrderId = String(order.paymentChargeId);
      const response = await directSbpPaymentResponse(
        bankOrderId,
        buildPublicUrl(`/pay/${encodeURIComponent(String(order.id))}?payment=success`)
      );
      const current = await prisma.order.findUnique({ where: { id: order.id } });
      if (!current || isCancelled(current) || isExpired(current) || current.paymentChargeId !== bankOrderId) {
        return res.status(409).json({ ok: false, error: 'PAYMENT_NOT_PAYABLE' });
      }
      return res.json(response);
    }
    if (isFreshRegistrationLock(order.paymentChargeId)) {
      return res.status(409).json({ ok: false, error: 'PAYMENT_REGISTRATION_IN_PROGRESS' });
    }

    const lock = registrationLock();
    const acquired = await prisma.order.updateMany({
      where: {
        id: order.id,
        userId: req.user.id,
        paymentStatus: { not: 'CONFIRMED' },
        status: { not: 'CANCELLED' },
        paymentChargeId: order.paymentChargeId || null,
      },
      data: { paymentChargeId: lock },
    });
    if (acquired.count !== 1) {
      return res.status(409).json({ ok: false, error: 'PAYMENT_REGISTRATION_IN_PROGRESS' });
    }
    acquiredLock = lock;

    const amountKopecks = expectedAmountKopecks(order);
    const sessionTimeoutSecs = paymentTimeoutSeconds(order);
    const orderNumber = alfaOrderNumber(order.id);
    const returnUrl = buildPublicUrl(`/pay/${encodeURIComponent(String(order.id))}?payment=success`);
    const failUrl = buildPublicUrl(`/pay/${encodeURIComponent(String(order.id))}?payment=failed`);
    const dynamicCallbackUrl = buildPublicUrl('/api/payments/alfa-callback');
    const description = `FLOWIE заказ #${order.id}`;

    const result = await alfaRequest('register', {
      orderNumber,
      amount: amountKopecks,
      currency: ALFA_CURRENCY_RUB,
      taxSystem: getAlfaConfig().taxSystem,
      sessionTimeoutSecs,
      returnUrl,
      failUrl,
      dynamicCallbackUrl,
      description,
      clientId: req.user.id,
      email: req.user.email || undefined,
      orderBundle: buildOrderBundle(order),
    });

    if (typeof result?.orderId !== 'string' || !result.orderId.trim()) {
      const err = new Error('ALFA_REGISTER_FAILED');
      err.httpStatus = 502;
      throw err;
    }

    let formUrl = null;
    try {
      formUrl = validateAlfaFormUrl(result.formUrl);
    } catch {}
    const alfaMeta = {
      alfa: {
        orderNumber,
        orderId: result.orderId,
        amountKopecks,
        ...(formUrl ? { formUrl } : {}),
        receiptSubmitted: true,
        registeredAt: new Date().toISOString(),
      },
    };

    const persisted = await prisma.order.updateMany({
      where: { id: order.id, paymentChargeId: lock, paymentStatus: { not: 'CONFIRMED' } },
      data: {
        paymentMethod: 'alfa',
        paymentChargeId: result.orderId,
        paymentMeta: JSON.stringify({ ...existingMeta, ...alfaMeta }),
      },
    });
    if (persisted.count !== 1) {
      return res.status(409).json({ ok: false, error: 'PAYMENT_REGISTRATION_CONFLICT' });
    }

    acquiredLock = null;
    const current = await prisma.order.findUnique({ where: { id: order.id } });
    if (!current || isCancelled(current) || isExpired(current) || current.paymentChargeId !== result.orderId) {
      return res.status(409).json({ ok: false, error: 'PAYMENT_REGISTRATION_CONFLICT' });
    }
    const response = await directSbpPaymentResponse(result.orderId, returnUrl);
    const payable = await prisma.order.findUnique({ where: { id: order.id } });
    if (!payable || isCancelled(payable) || isExpired(payable) || payable.paymentChargeId !== result.orderId) {
      return res.status(409).json({ ok: false, error: 'PAYMENT_NOT_PAYABLE' });
    }
    return res.json(response);
  } catch (e) {
    const orderId = Number(req.body?.orderId);
    if (Number.isFinite(orderId) && acquiredLock) {
      await prisma.order.updateMany({
        where: { id: orderId, paymentChargeId: acquiredLock },
        data: { paymentChargeId: null },
      }).catch(() => null);
    }
    return res.status(e?.httpStatus || 500).json({ ok: false, error: e?.message || 'ALFA_REGISTER_FAILED' });
  }
});

// GET /api/payments/alfa-status?orderId=123
router.get('/alfa-status', requireAuth, async (req, res) => {
  try {
    const orderId = Number(req.query?.orderId);
    if (!Number.isFinite(orderId)) return res.status(400).json({ ok: false, error: 'BAD_ORDER_ID' });

    const order = await prisma.order.findFirst({ where: { id: orderId, userId: req.user.id } });
    if (!order) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
    if (String(order.paymentStatus || '').toUpperCase() === 'CONFIRMED') {
      await recordServerEventSafe(prisma, {
        event: 'payment_success',
        userId: order.userId,
        orderId: order.id,
      });
      return res.json({ ok: true, paid: true, order: { id: order.id, paymentStatus: order.paymentStatus, status: order.status } });
    }

    const meta = parsePaymentMeta(order.paymentMeta);
    const bankOrderId = order.paymentChargeId || meta?.alfa?.orderId;
    const bankOrderNumber = meta?.alfa?.orderNumber;
    if ((!bankOrderId && !bankOrderNumber) || String(bankOrderId || '').startsWith('registering:')) {
      return res.status(400).json({ ok: false, error: 'ALFA_ORDER_MISSING' });
    }

    const result = await alfaRequest('getOrderStatusExtended', {
      orderId: bankOrderId,
      orderNumber: bankOrderId ? undefined : bankOrderNumber,
    });

    const bankStatus = Number(result?.orderStatus);
    const paid = bankStatus === 2;
    const nextMeta = {
      ...meta,
      alfa: {
        ...(meta.alfa || {}),
        lastStatus: Number.isFinite(bankStatus) ? bankStatus : result?.orderStatus,
        lastStatusAt: new Date().toISOString(),
        actionCode: result?.actionCode,
        actionCodeDescription: result?.actionCodeDescription,
        confirmedAmount: result?.amount,
        confirmedCurrency: result?.currency,
      },
    };

    let updated = order;
    let retryAllowed = false;
    if (paid) {
      validateCapturedPayment(order, result);
      if (isCancelled(order)) {
        await prisma.order.updateMany({
          where: { id: order.id, paymentStatus: { not: 'CONFIRMED' } },
          data: { paymentMeta: JSON.stringify(nextMeta) },
        });
        return res.status(409).json({ ok: false, error: 'PAID_CANCELLED_ORDER_REQUIRES_RECONCILIATION' });
      }
      updated = await markOrderPaid(order, nextMeta, bankOrderId);
    } else if (isRetryableBankStatus(bankStatus)) {
      const released = await prisma.order.updateMany({
        where: {
          id: order.id,
          paymentChargeId: bankOrderId,
          paymentStatus: { not: 'CONFIRMED' },
          status: { not: 'CANCELLED' },
        },
        data: { paymentChargeId: null, paymentMeta: JSON.stringify(nextMeta) },
      });
      retryAllowed = released.count === 1;
      if (retryAllowed) updated = { ...order, paymentChargeId: null, paymentMeta: JSON.stringify(nextMeta) };
    } else {
      await prisma.order.updateMany({
        where: { id: order.id, paymentStatus: { not: 'CONFIRMED' } },
        data: { paymentMeta: JSON.stringify(nextMeta) },
      });
    }

    return res.json({
      ok: true,
      paid,
      retryAllowed,
      bankStatus: Number.isFinite(bankStatus) ? bankStatus : result?.orderStatus,
      order: { id: updated.id, paymentStatus: updated.paymentStatus, status: updated.status },
    });
  } catch (e) {
    const status = String(e?.code || '').startsWith('ALFA_') ? 409 : 500;
    return res.status(status).json({ ok: false, error: e?.message || 'ALFA_STATUS_FAILED' });
  }
});

// Alfa may call this endpoint when dynamic callbacks are enabled in the bank cabinet.
router.post('/alfa-callback', async (req, res) => {
  try {
    const bankOrderId = String(req.body?.mdOrder || req.body?.orderId || req.query?.mdOrder || req.query?.orderId || '').trim();
    if (!bankOrderId) return res.status(400).json({ ok: false, error: 'ALFA_ORDER_MISSING' });

    const order = await prisma.order.findFirst({
      where: { paymentChargeId: bankOrderId },
    });
    if (!order) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });

    const result = await alfaRequest('getOrderStatusExtended', {
      orderId: bankOrderId,
    });
    const bankStatus = Number(result?.orderStatus);
    const meta = parsePaymentMeta(order.paymentMeta);
    const nextMeta = {
      ...meta,
      alfa: {
        ...(meta.alfa || {}),
        lastStatus: Number.isFinite(bankStatus) ? bankStatus : result?.orderStatus,
        lastStatusAt: new Date().toISOString(),
        actionCode: result?.actionCode,
        actionCodeDescription: result?.actionCodeDescription,
        confirmedAmount: result?.amount,
        confirmedCurrency: result?.currency,
      },
    };

    if (bankStatus === 2) {
      validateCapturedPayment(order, result);
      if (isCancelled(order)) {
        await prisma.order.updateMany({
          where: { id: order.id, paymentStatus: { not: 'CONFIRMED' } },
          data: { paymentMeta: JSON.stringify(nextMeta) },
        });
        return res.json({ ok: true, requiresReconciliation: true });
      }
      await markOrderPaid(order, nextMeta, bankOrderId);
    } else if (isRetryableBankStatus(bankStatus)) {
      const released = await prisma.order.updateMany({
        where: {
          id: order.id,
          paymentChargeId: bankOrderId,
          paymentStatus: { not: 'CONFIRMED' },
          status: { not: 'CANCELLED' },
        },
        data: { paymentChargeId: null, paymentMeta: JSON.stringify(nextMeta) },
      });
      return res.json({ ok: true, retryAllowed: released.count === 1 });
    } else {
      await prisma.order.updateMany({
        where: { id: order.id, paymentStatus: { not: 'CONFIRMED' } },
        data: { paymentMeta: JSON.stringify(nextMeta) },
      });
    }

    return res.json({ ok: true });
  } catch (e) {
    const status = String(e?.code || '').startsWith('ALFA_') ? 409 : 500;
    return res.status(status).json({ ok: false, error: e?.message || 'ALFA_CALLBACK_FAILED' });
  }
});

// Client reads the separate-delivery state for its own order.
router.get('/delivery', requireAuth, async (req, res) => {
  try {
    const orderId = Number(req.query?.orderId);
    if (!Number.isSafeInteger(orderId) || orderId <= 0) return res.status(400).json({ ok: false, error: 'BAD_ORDER_ID' });
    const order = await prisma.order.findFirst({
      where: { id: orderId, userId: req.user.id },
      include: { deliveryInvoice: true },
    });
    if (!order) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
    return res.json({
      ok: true,
      delivery: {
        status: order.deliveryStatus,
        cost: order.deliveryCost,
        address: order.askRecipientAddress ? null : order.deliveryAddress,
        time: order.askRecipientTime ? null : order.deliveryTime,
        recipientDetailsReceived: Boolean(order.askRecipientAddress || order.askRecipientTime) &&
          (!order.askRecipientAddress || Boolean(String(order.deliveryAddress || '').trim())) &&
          (!order.askRecipientTime || Boolean(String(order.deliveryTime || '').trim())),
        askRecipientAddress: order.askRecipientAddress,
        askRecipientTime: order.askRecipientTime,
      },
      invoice: publicDeliveryInvoice(order.deliveryInvoice),
    });
  } catch {
    return res.status(500).json({ ok: false, error: 'DELIVERY_PAYMENT_INFO_FAILED' });
  }
});

router.post('/delivery/alfa-register', requireAuth, async (req, res) => {
  let acquiredLock = null;
  let registeredBankOrderId = null;
  try {
    const orderId = Number(req.body?.orderId);
    if (!Number.isSafeInteger(orderId) || orderId <= 0) return res.status(400).json({ ok: false, error: 'BAD_ORDER_ID' });
    const order = await prisma.order.findFirst({
      where: { id: orderId, userId: req.user.id },
      include: { deliveryInvoice: true },
    });
    if (!order) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
    let invoice = order.deliveryInvoice;
    if (!invoice) return res.status(404).json({ ok: false, error: 'DELIVERY_INVOICE_NOT_FOUND' });
    if (invoice.status === 'PAID') return res.json({ ok: true, alreadyPaid: true, invoice: publicDeliveryInvoice(invoice) });
    if (['CANCELLED', 'RECONCILIATION_REQUIRED'].includes(invoice.status) || isCancelled(order)) {
      return res.status(409).json({ ok: false, error: 'DELIVERY_INVOICE_NOT_PAYABLE' });
    }
    if (invoice.amount <= 0 || invoice.status === 'WAIVED') {
      return res.status(409).json({ ok: false, error: 'DELIVERY_PAYMENT_NOT_REQUIRED' });
    }
    if (deliveryInvoiceExpired(invoice)) {
      if (invoice.paymentChargeId) {
        return res.status(409).json({ ok: false, error: 'DELIVERY_PAYMENT_STATUS_REQUIRED' });
      }
      invoice = await prisma.deliveryInvoice.update({
        where: { id: invoice.id },
        data: {
          status: 'PAYMENT_PENDING',
          paymentExpiresAt: new Date(Date.now() + invoiceTtlMs()),
        },
      });
      await prisma.order.update({ where: { id: order.id }, data: { deliveryStatus: 'PAYMENT_PENDING' } });
    }
    if (!isAlfaConfigured()) return res.status(500).json({ ok: false, error: 'ALFA_BANK_NOT_CONFIGURED' });
    validateAlfaRegistrationConfig();

    const existingMeta = parsePaymentMeta(invoice.paymentMeta);
    if (invoice.paymentChargeId && !String(invoice.paymentChargeId).startsWith('registering:')) {
      const bankOrderId = String(invoice.paymentChargeId);
      const response = await directSbpPaymentResponse(
        bankOrderId,
        buildPublicUrl(`/pay/${encodeURIComponent(String(order.id))}?deliveryPayment=success`)
      );
      const [currentInvoice, currentOrder] = await Promise.all([
        prisma.deliveryInvoice.findUnique({ where: { id: invoice.id } }),
        prisma.order.findUnique({ where: { id: order.id } }),
      ]);
      if (
        !currentInvoice ||
        currentInvoice.paymentChargeId !== bankOrderId ||
        currentInvoice.status !== 'PAYMENT_PENDING' ||
        deliveryInvoiceExpired(currentInvoice) ||
        isCancelled(currentOrder)
      ) {
        return res.status(409).json({ ok: false, error: 'DELIVERY_PAYMENT_NOT_PAYABLE' });
      }
      return res.json(response);
    }
    if (isFreshRegistrationLock(invoice.paymentChargeId)) {
      return res.status(409).json({ ok: false, error: 'PAYMENT_REGISTRATION_IN_PROGRESS' });
    }

    const lock = registrationLock();
    const acquired = await prisma.deliveryInvoice.updateMany({
      where: {
        id: invoice.id,
        status: 'PAYMENT_PENDING',
        paymentChargeId: invoice.paymentChargeId || null,
      },
      data: { paymentChargeId: lock },
    });
    if (acquired.count !== 1) return res.status(409).json({ ok: false, error: 'PAYMENT_REGISTRATION_IN_PROGRESS' });
    acquiredLock = lock;

    const amountKopecks = expectedRubKopecks(invoice.amount);
    const orderNumber = alfaDeliveryOrderNumber(order.id);
    const result = await alfaRequest('register', {
      orderNumber,
      amount: amountKopecks,
      currency: ALFA_CURRENCY_RUB,
      taxSystem: getAlfaConfig().taxSystem,
      sessionTimeoutSecs: deliveryPaymentTimeoutSeconds(invoice),
      returnUrl: buildPublicUrl(`/pay/${encodeURIComponent(String(order.id))}?deliveryPayment=success`),
      failUrl: buildPublicUrl(`/pay/${encodeURIComponent(String(order.id))}?deliveryPayment=failed`),
      dynamicCallbackUrl: buildPublicUrl('/api/payments/delivery/alfa-callback'),
      description: `FLOWIE доставка заказа #${order.id}`,
      clientId: req.user.id,
      orderBundle: buildDeliveryOrderBundle(order, invoice),
    });
    if (typeof result?.orderId !== 'string' || !result.orderId.trim()) {
      const error = new Error('ALFA_REGISTER_FAILED');
      error.httpStatus = 502;
      throw error;
    }
    registeredBankOrderId = result.orderId;
    let formUrl = null;
    try {
      formUrl = validateAlfaFormUrl(result.formUrl);
    } catch {}

    const nextMeta = {
      ...existingMeta,
      alfa: {
        orderNumber,
        orderId: result.orderId,
        amountKopecks,
        ...(formUrl ? { formUrl } : {}),
        receiptSubmitted: true,
        registeredAt: new Date().toISOString(),
      },
    };
    const persisted = await prisma.deliveryInvoice.updateMany({
      // Cancellation preserves the registration lock, so attach the real bank ID even if status changed
      // while the network request was in flight. This keeps late callbacks reconcilable.
      where: { id: invoice.id, paymentChargeId: lock },
      data: { paymentChargeId: result.orderId, paymentMeta: JSON.stringify(nextMeta) },
    });
    if (persisted.count !== 1) return res.status(409).json({ ok: false, error: 'PAYMENT_REGISTRATION_CONFLICT' });
    const [currentInvoice, currentOrder] = await Promise.all([
      prisma.deliveryInvoice.findUnique({ where: { id: invoice.id } }),
      prisma.order.findUnique({ where: { id: order.id } }),
    ]);
    if (['CANCELLED', 'RECONCILIATION_REQUIRED'].includes(currentInvoice?.status) || isCancelled(currentOrder)) {
      return res.status(409).json({ ok: false, error: 'DELIVERY_CANCELLED_AFTER_REGISTRATION' });
    }
    acquiredLock = null;
    const response = await directSbpPaymentResponse(
      result.orderId,
      buildPublicUrl(`/pay/${encodeURIComponent(String(order.id))}?deliveryPayment=success`)
    );
    const [payableInvoice, payableOrder] = await Promise.all([
      prisma.deliveryInvoice.findUnique({ where: { id: invoice.id } }),
      prisma.order.findUnique({ where: { id: order.id } }),
    ]);
    if (
      !payableInvoice ||
      payableInvoice.paymentChargeId !== result.orderId ||
      payableInvoice.status !== 'PAYMENT_PENDING' ||
      deliveryInvoiceExpired(payableInvoice) ||
      isCancelled(payableOrder)
    ) {
      return res.status(409).json({ ok: false, error: 'DELIVERY_PAYMENT_NOT_PAYABLE' });
    }
    return res.json(response);
  } catch (error) {
    if (acquiredLock && !registeredBankOrderId) {
      await prisma.deliveryInvoice.updateMany({
        where: { paymentChargeId: acquiredLock },
        data: { paymentChargeId: null },
      }).catch(() => null);
    }
    return res.status(error?.httpStatus || 500).json({ ok: false, error: error?.message || 'DELIVERY_ALFA_REGISTER_FAILED' });
  }
});

async function syncDeliveryPayment({ invoice, order }) {
  const meta = parsePaymentMeta(invoice.paymentMeta);
  const bankOrderId = invoice.paymentChargeId || meta?.alfa?.orderId;
  if (!bankOrderId || String(bankOrderId).startsWith('registering:')) {
    throw Object.assign(new Error('ALFA_ORDER_MISSING'), { httpStatus: 400 });
  }
  const result = await alfaRequest('getOrderStatusExtended', { orderId: bankOrderId });
  const bankStatus = Number(result?.orderStatus);
  const nextMeta = {
    ...meta,
    alfa: {
      ...(meta.alfa || {}),
      lastStatus: Number.isFinite(bankStatus) ? bankStatus : result?.orderStatus,
      lastStatusAt: new Date().toISOString(),
      actionCode: result?.actionCode,
      actionCodeDescription: result?.actionCodeDescription,
      confirmedAmount: result?.amount,
      confirmedCurrency: result?.currency,
    },
  };
  if (bankStatus === 2) {
    validateCapturedAmount(invoice.amount, result);
    const updated = await markDeliveryInvoicePaid(invoice, nextMeta, bankOrderId);
    return {
      paid: updated?.status === 'PAID',
      requiresReconciliation: updated?.status === 'RECONCILIATION_REQUIRED',
      retryAllowed: false,
      bankStatus,
      invoice: updated,
    };
  }
  if (isRetryableBankStatus(bankStatus)) {
    const expiresAt = new Date(Date.now() + invoiceTtlMs());
    const released = await prisma.deliveryInvoice.updateMany({
      where: { id: invoice.id, paymentChargeId: bankOrderId, status: 'PAYMENT_PENDING' },
      data: {
        paymentChargeId: null,
        paymentMeta: JSON.stringify(nextMeta),
        paymentExpiresAt: expiresAt,
      },
    });
    if (released.count === 1) {
      await prisma.order.updateMany({
        where: { id: order.id, status: { not: 'CANCELLED' } },
        data: { deliveryStatus: 'PAYMENT_PENDING' },
      });
    }
    return { paid: false, requiresReconciliation: false, retryAllowed: released.count === 1, bankStatus, invoice };
  }
  await prisma.deliveryInvoice.updateMany({
    where: { id: invoice.id, status: 'PAYMENT_PENDING' },
    data: { paymentMeta: JSON.stringify(nextMeta) },
  });
  return { paid: false, requiresReconciliation: false, retryAllowed: false, bankStatus, invoice };
}

router.get('/delivery/alfa-status', requireAuth, async (req, res) => {
  try {
    const orderId = Number(req.query?.orderId);
    if (!Number.isSafeInteger(orderId) || orderId <= 0) return res.status(400).json({ ok: false, error: 'BAD_ORDER_ID' });
    const order = await prisma.order.findFirst({
      where: { id: orderId, userId: req.user.id },
      include: { deliveryInvoice: true },
    });
    if (!order) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
    if (!order.deliveryInvoice) return res.status(404).json({ ok: false, error: 'DELIVERY_INVOICE_NOT_FOUND' });
    if (order.deliveryInvoice.status === 'PAID') {
      return res.json({ ok: true, paid: true, invoice: publicDeliveryInvoice(order.deliveryInvoice) });
    }
    const synced = await syncDeliveryPayment({ invoice: order.deliveryInvoice, order });
    const status = synced.requiresReconciliation ? 409 : 200;
    return res.status(status).json({
      ok: !synced.requiresReconciliation,
      ...synced,
      invoice: publicDeliveryInvoice(synced.invoice),
    });
  } catch (error) {
    const status = error?.httpStatus || (String(error?.code || '').startsWith('ALFA_') ? 409 : 500);
    return res.status(status).json({ ok: false, error: error?.message || 'DELIVERY_ALFA_STATUS_FAILED' });
  }
});

router.post('/delivery/alfa-callback', async (req, res) => {
  try {
    const bankOrderId = String(req.body?.mdOrder || req.body?.orderId || req.query?.mdOrder || req.query?.orderId || '').trim();
    if (!bankOrderId) return res.status(400).json({ ok: false, error: 'ALFA_ORDER_MISSING' });
    const invoice = await prisma.deliveryInvoice.findFirst({ where: { paymentChargeId: bankOrderId } });
    if (!invoice) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
    const order = await prisma.order.findUnique({ where: { id: invoice.orderId } });
    if (!order) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
    const synced = await syncDeliveryPayment({ invoice, order });
    return res.json({
      ok: true,
      paid: synced.paid,
      retryAllowed: synced.retryAllowed,
      requiresReconciliation: synced.requiresReconciliation,
    });
  } catch (error) {
    const status = String(error?.code || '').startsWith('ALFA_') ? 409 : 500;
    return res.status(status).json({ ok: false, error: error?.message || 'DELIVERY_ALFA_CALLBACK_FAILED' });
  }
});

router.post('/stars-invoice', requireAuth, async (req, res) => {
  return res.status(410).json({ ok: false, error: 'PAYMENT_METHOD_DISABLED' });
});

// POST /api/payments/confirm-client { orderId }
router.post('/confirm-client', requireAuth, async (req, res) => {
  try {
    const orderId = Number(req.body?.orderId);
    if (!Number.isFinite(orderId)) return res.status(400).json({ ok: false, error: 'BAD_ORDER_ID' });

    const order = await prisma.order.findFirst({ where: { id: orderId, userId: req.user.id }, include: { user: true } });
    if (!order) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
    if (order.paymentClientConfirmed) return res.json({ ok: true });

    const updated = await prisma.order.update({
      where: { id: orderId },
      data: { paymentClientConfirmed: true, paymentStatus: order.paymentStatus || 'PENDING' },
    });

    return res.json({ ok: true, order: { id: updated.id, paymentStatus: updated.paymentStatus, paymentClientConfirmed: updated.paymentClientConfirmed } });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || 'CONFIRM_CLIENT_FAILED' });
  }
});

router.__setPrismaForTests = (client) => {
  prisma = client;
};
router._test = {
  markDeliveryInvoicePaid,
  getAlfaConfig,
  isAlfaConfigured,
  alfaRequest,
  validateAlfaFormUrl,
  validateSbpPaymentUrl,
  buildOrderBundle,
  reconcilePendingMainPayments,
};

startPaymentReconciliation();

module.exports = router;
