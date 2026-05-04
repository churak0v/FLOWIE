const express = require('express');
const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');

const router = express.Router();
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

function getClientBotToken() {
  return process.env.BOT_TOKEN || process.env.ADMIN_BOT_TOKEN || '';
}

function getAppSecret() {
  return String(process.env.APP_JWT_SECRET || '');
}

function getPublicSiteUrl() {
  return String(process.env.PUBLIC_SITE_URL || '').trim();
}

function makeSig(orderId) {
  const secret = getAppSecret();
  return crypto.createHmac('sha256', secret).update(String(orderId)).digest('hex').slice(0, 16);
}

function verifyPaymentPayload(payload, expectedKind) {
  const parts = String(payload || '').split(':');
  const kind = parts[0] || '';
  const orderId = Number(parts[1] || '');
  const sig = parts[2] || '';
  if (kind !== expectedKind || !Number.isFinite(orderId) || !sig) return null;
  if (sig !== makeSig(orderId)) return null;
  return orderId;
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

async function setAdminBotWebhook() {
  try {
    const token = process.env.ADMIN_BOT_TOKEN;
    const publicUrl = getPublicSiteUrl();
    if (!token || !publicUrl) return;
    const url = `${publicUrl.replace(/\/$/, '')}/api/telegram/admin-webhook`;
    await tgApi(token, 'setWebhook', { url, drop_pending_updates: false });
  } catch {
    // ignore
  }
}

async function setClientBotWebhook() {
  try {
    const token = process.env.BOT_TOKEN;
    const publicUrl = getPublicSiteUrl();
    if (!token || !publicUrl) return;
    if (process.env.ADMIN_BOT_TOKEN && token === process.env.ADMIN_BOT_TOKEN) return;
    const url = `${publicUrl.replace(/\/$/, '')}/api/telegram/webhook`;
    await tgApi(token, 'setWebhook', { url, drop_pending_updates: false });
  } catch {
    // ignore
  }
}

// Try to keep webhook in sync on each boot (best-effort).
setTimeout(setAdminBotWebhook, 0);
setTimeout(setClientBotWebhook, 0);

// POST /api/telegram/webhook
router.post('/webhook', async (req, res) => {
  try {
    const update = req.body || {};
    const preCheckout = update.pre_checkout_query || null;
    if (preCheckout) {
      const orderId = verifyPaymentPayload(preCheckout.invoice_payload, 'stars');
      let ok = false;
      let errorMessage = 'Order is not available for payment';

      if (orderId) {
        const order = await prisma.order.findUnique({ where: { id: orderId } });
        const expectedPayload = `stars:${orderId}:${makeSig(orderId)}`;
        const isPending = order && String(order.paymentStatus || '').toUpperCase() !== 'CONFIRMED';
        const isPayloadMatch = order && (!order.paymentPayload || order.paymentPayload === expectedPayload);
        ok = Boolean(isPending && isPayloadMatch);
        if (!ok && order && String(order.paymentStatus || '').toUpperCase() === 'CONFIRMED') {
          errorMessage = 'This order has already been paid';
        }
      }

      await tgApi(getClientBotToken(), 'answerPreCheckoutQuery', {
        pre_checkout_query_id: preCheckout.id,
        ok,
        ...(ok ? {} : { error_message: errorMessage }),
      });
      return res.json({ ok: true });
    }

    const msg = update.message || update.edited_message || null;
    const successfulPayment = msg?.successful_payment || null;
    if (successfulPayment) {
      const orderId = verifyPaymentPayload(successfulPayment.invoice_payload, 'stars');
      if (!orderId) return res.json({ ok: true });

      const chargeId = String(successfulPayment.telegram_payment_charge_id || '');
      const now = new Date();
      const order = await prisma.order.findUnique({ where: { id: orderId }, include: { user: true } });
      if (!order) return res.json({ ok: true });

      const updated = await prisma.order.update({
        where: { id: orderId },
        data: {
          paymentMethod: 'stars',
          paymentStatus: 'CONFIRMED',
          paymentClientConfirmed: true,
          status: 'PAID',
          paidAt: order.paidAt || now,
          paymentPayload: successfulPayment.invoice_payload,
          paymentChargeId: chargeId || order.paymentChargeId,
          paymentMeta: JSON.stringify({
            currency: successfulPayment.currency,
            totalAmount: successfulPayment.total_amount,
            providerPaymentChargeId: successfulPayment.provider_payment_charge_id || '',
          }),
        },
      });

      try {
        const ids = getAdminIds();
        const amount = Number(order.totalPrice || 0);
        const userLabel = order.user?.username ? `@${order.user.username}` : (order.user?.name || `User ${order.user?.id || '—'}`);
        const text =
          `Оплата Stars подтверждена\n` +
          `Заказ: #${orderId}\n` +
          `Amount: $${amount}\n` +
          `Stars: ${successfulPayment.total_amount}\n` +
          `Клиент: ${userLabel}`;
        for (const chatId of ids) {
          // eslint-disable-next-line no-await-in-loop
          await tgApi(getAdminBotToken(), 'sendMessage', { chat_id: chatId, text });
        }
      } catch {
        // ignore
      }

      return res.json({ ok: true, order: { id: updated.id, paymentStatus: updated.paymentStatus } });
    }

    if (!msg?.text) return res.json({ ok: true });

    const text = String(msg.text || '').trim();
    if (!text.startsWith('/start')) return res.json({ ok: true });

    const chatId = msg.chat?.id;
    if (!chatId) return res.json({ ok: true });

    const parts = text.split(' ').filter(Boolean);
    const startParam = parts.length > 1 ? parts.slice(1).join(' ').trim() : '';

    const publicUrl = getPublicSiteUrl();
    const baseUrl = publicUrl ? publicUrl.replace(/\/$/, '') : '';
    const appUrl = startParam && baseUrl ? `${baseUrl}?startapp=${encodeURIComponent(startParam)}` : baseUrl;

    const reply_markup = appUrl
      ? { inline_keyboard: [[{ text: 'Open FLOWIE', web_app: { url: appUrl } }]] }
      : undefined;

    await tgApi(getClientBotToken(), 'sendMessage', {
      chat_id: chatId,
      text:
        'Welcome to FLOWIE.\n\n' +
        'Choose real gifts from a private wishlist and pay securely with TON Connect or Telegram Stars. ' +
        'Recipient details stay private, and the order is handled through the app.',
      reply_markup,
    });

    return res.json({ ok: true });
  } catch (e) {
    return res.json({ ok: true, error: e?.message || 'WEBHOOK_FAILED' });
  }
});

// POST /api/telegram/admin-webhook
router.post('/admin-webhook', async (req, res) => {
  try {
    const update = req.body || {};
    const cb = update.callback_query || null;
    if (!cb) return res.json({ ok: true });

    const fromId = cb.from?.id != null ? String(cb.from.id) : '';
    const adminIds = new Set(getAdminIds());
    if (!fromId || !adminIds.has(fromId)) {
      // Still answer so UI doesn't spin forever.
      try {
        await tgApi(getAdminBotToken(), 'answerCallbackQuery', { callback_query_id: cb.id, text: 'Недостаточно прав', show_alert: true });
      } catch {
        // ignore
      }
      return res.json({ ok: true });
    }

    const data = String(cb.data || '');
    if (!data.startsWith('pay_ok:')) return res.json({ ok: true });

    const parts = data.split(':');
    const orderId = Number(parts[1] || '');
    const sig = String(parts[2] || '');
    if (!Number.isFinite(orderId) || !sig || sig !== makeSig(orderId)) {
      try {
        await tgApi(getAdminBotToken(), 'answerCallbackQuery', { callback_query_id: cb.id, text: 'Неверная подпись', show_alert: true });
      } catch {
        // ignore
      }
      return res.json({ ok: true });
    }

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { user: true },
    });
    if (!order) {
      await tgApi(getAdminBotToken(), 'answerCallbackQuery', { callback_query_id: cb.id, text: 'Заказ не найден', show_alert: true });
      return res.json({ ok: true });
    }

    const now = new Date();
    const updated = await prisma.order.update({
      where: { id: orderId },
      data: {
        paymentStatus: 'CONFIRMED',
        paymentClientConfirmed: true,
        status: 'PAID',
        paidAt: now,
      },
    });

    // Answer callback quickly.
    await tgApi(getAdminBotToken(), 'answerCallbackQuery', { callback_query_id: cb.id, text: 'Оплата подтверждена' });

    // Update message UI.
    try {
      const chatId = cb.message?.chat?.id;
      const messageId = cb.message?.message_id;
      if (chatId != null && messageId != null) {
        const amount = Number(order.totalPrice || 0);
        const userLabel = order.user?.username ? `@${order.user.username}` : (order.user?.name || `User ${order.user?.id || '—'}`);
        const text =
          `Оплата подтверждена\n` +
          `Заказ: #${orderId}\n` +
          `Amount: $${amount}\n` +
          `Клиент: ${userLabel}`;
        await tgApi(getAdminBotToken(), 'editMessageText', {
          chat_id: chatId,
          message_id: messageId,
          text,
        });
      }
    } catch {
      // ignore
    }

    // Notify client (best-effort).
    try {
      const chatId = order.user?.telegramId ? String(order.user.telegramId) : '';
      if (chatId) {
        await tgApi(getClientBotToken(), 'sendMessage', {
          chat_id: chatId,
          text: `Оплата подтверждена. Заказ #${orderId} принят в работу.`,
        });
      }
    } catch {
      // ignore
    }

    return res.json({ ok: true, order: { id: updated.id, paymentStatus: updated.paymentStatus } });
  } catch (e) {
    return res.json({ ok: true, error: e?.message || 'WEBHOOK_FAILED' });
  }
});

module.exports = router;
