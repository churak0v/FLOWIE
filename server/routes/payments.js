const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const { requireAuth } = require('../middleware/auth');
const crypto = require('crypto');

const prisma = new PrismaClient();

function parseCsv(value) {
  return String(value || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function getAdminIds() {
  return parseCsv(process.env.ADMIN_TG_IDS);
}

function getAdminBotToken() {
  return process.env.ADMIN_BOT_TOKEN || process.env.BOT_TOKEN || '';
}

function getAppSecret() {
  return String(process.env.APP_JWT_SECRET || '');
}

function makeSig(orderId) {
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
    const ids = getAdminIds();
    if (!token || !ids.length) return;

    const amount = Number(order?.totalPrice || 0);
    const orderId = Number(order?.id);
    const userLabel = order?.user?.username ? `@${order.user.username}` : (order?.user?.name || `User ${order?.user?.id || '—'}`);
    const sig = makeSig(orderId);
    const cb = `pay_ok:${orderId}:${sig}`;

    const text =
      `Ожидается оплата (ручной перевод)\n` +
      `Заказ: #${orderId}\n` +
      `Amount: $${amount}\n` +
      `Клиент: ${userLabel}`;

    const reply_markup = { inline_keyboard: [[{ text: 'Подтвердить поступление', callback_data: cb }]] };

    for (const chatId of ids) {
      // eslint-disable-next-line no-await-in-loop
      await tgApi(token, 'sendMessage', { chat_id: chatId, text, reply_markup });
    }
  } catch {
    // ignore
  }
}

function getPaymentInfo() {
  return {
    cardNumber: String(process.env.PAYMENT_CARD_NUMBER || '2202 2065 5716 9211'),
    receiverName: String(process.env.PAYMENT_RECEIVER_NAME || 'Аделина Ч.'),
    bankName: String(process.env.PAYMENT_BANK_NAME || 'Сбербанк'),
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

    // Ping admins only while payment is actually pending.
    if (String(order.paymentStatus || '').toUpperCase() === 'PENDING') {
      notifyAdminsPaymentPending(order);
    }

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
        deliveryAddress: order.deliveryAddress,
        deliveryTime: order.deliveryTime,
        recipientName: order.recipientName,
        recipientPhone: order.recipientPhone,
        floristComment: order.floristComment,
        items: order.items,
        photos: order.photos,
        preDeliveryRating: order.preDeliveryRating,
        preDeliveryRatedAt: order.preDeliveryRatedAt,
        deliveredAt: order.deliveredAt,
      },
      payment: info,
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || 'PAYMENT_INFO_FAILED' });
  }
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

    // Дополнительный пинг админам, если клиент отметил оплату.
    if (updated.paymentStatus === 'PENDING') {
      notifyAdminsPaymentPending({ ...order, ...updated, user: order.user });
    }

    return res.json({ ok: true, order: { id: updated.id, paymentStatus: updated.paymentStatus, paymentClientConfirmed: updated.paymentClientConfirmed } });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || 'CONFIRM_CLIENT_FAILED' });
  }
});

module.exports = router;
