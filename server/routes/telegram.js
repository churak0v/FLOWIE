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

function getWebhookSecret() {
  return String(process.env.TELEGRAM_WEBHOOK_SECRET || '').trim();
}

function makeSig(orderId) {
  const secret = getAppSecret();
  if (!secret) return '';
  return crypto.createHmac('sha256', secret).update(String(orderId)).digest('hex').slice(0, 16);
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}

function requireWebhookSecret(req, res, next) {
  const expected = getWebhookSecret();
  const received = req.headers['x-telegram-bot-api-secret-token'];
  if (!expected || !safeEqual(received, expected)) {
    return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });
  }
  return next();
}

async function tgApi(token, method, payload) {
  if (!token) return null;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 3000);
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload || {}),
      signal: ac.signal,
    });
    return res.json().catch(() => null);
  } finally {
    clearTimeout(timer);
  }
}

async function setAdminBotWebhook() {
  try {
    const token = process.env.ADMIN_BOT_TOKEN;
    const publicUrl = getPublicSiteUrl();
    if (!token || !publicUrl) return;
    const url = `${publicUrl.replace(/\/$/, '')}/api/telegram/admin-webhook`;
    const secretToken = getWebhookSecret();
    if (!secretToken) return;
    await tgApi(token, 'setWebhook', { url, secret_token: secretToken, drop_pending_updates: false });
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
    const secretToken = getWebhookSecret();
    if (!secretToken) return;
    await tgApi(token, 'setWebhook', { url, secret_token: secretToken, drop_pending_updates: false });
  } catch {
    // ignore
  }
}

// Webhook mutation is opt-in. Deployments normally configure it explicitly.
if (process.env.TELEGRAM_AUTO_SET_WEBHOOK === 'true') {
  setTimeout(setAdminBotWebhook, 0);
  setTimeout(setClientBotWebhook, 0);
}

// POST /api/telegram/webhook
router.post('/webhook', requireWebhookSecret, async (req, res) => {
  try {
    const update = req.body || {};
    const preCheckout = update.pre_checkout_query || null;
    if (preCheckout) {
      await tgApi(getClientBotToken(), 'answerPreCheckoutQuery', {
        pre_checkout_query_id: preCheckout.id,
        ok: false,
        error_message: 'Card payment is available in the app',
      });
      return res.json({ ok: true });
    }

    const msg = update.message || update.edited_message || null;
    const successfulPayment = msg?.successful_payment || null;
    if (successfulPayment) {
      return res.json({ ok: true });
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
      ? { inline_keyboard: [[{ text: 'Открыть FLOWIE', web_app: { url: appUrl } }]] }
      : undefined;

    await tgApi(getClientBotToken(), 'sendMessage', {
      chat_id: chatId,
      text:
        'Добро пожаловать в FLOWIE.\n\n' +
        'Заказывайте свежие цветы с быстрой доставкой и оплачивайте банковской картой. ' +
        'Флорист и курьер ведут заказ прямо в приложении.',
      reply_markup,
    });

    return res.json({ ok: true });
  } catch (e) {
    return res.json({ ok: true, error: e?.message || 'WEBHOOK_FAILED' });
  }
});

// POST /api/telegram/admin-webhook
router.post('/admin-webhook', requireWebhookSecret, async (req, res) => {
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
    const expectedSig = makeSig(orderId);
    if (!Number.isInteger(orderId) || orderId <= 0 || !expectedSig || !safeEqual(sig, expectedSig)) {
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

    if (String(order.status || '').toUpperCase() === 'CANCELLED') {
      await tgApi(getAdminBotToken(), 'answerCallbackQuery', { callback_query_id: cb.id, text: 'Заказ отменён', show_alert: true });
      return res.json({ ok: true });
    }

    const alreadyConfirmed = String(order.paymentStatus || '').toUpperCase() === 'CONFIRMED';
    if (!alreadyConfirmed && !['PAYMENT_PENDING', 'NEW', 'PAID'].includes(String(order.status || '').toUpperCase())) {
      await tgApi(getAdminBotToken(), 'answerCallbackQuery', {
        callback_query_id: cb.id,
        text: 'Статус заказа уже изменён',
        show_alert: true,
      });
      return res.json({ ok: true });
    }
    let didConfirm = false;
    const now = new Date();
    const updated = alreadyConfirmed
      ? order
      : await prisma.$transaction(async (tx) => {
        const changed = await tx.order.updateMany({
          where: { id: orderId, paymentStatus: { not: 'CONFIRMED' }, status: { not: 'CANCELLED' } },
          data: {
            paymentStatus: 'CONFIRMED',
            paymentClientConfirmed: true,
            status: 'PAID',
            paidAt: order.paidAt || now,
          },
        });
        didConfirm = changed.count > 0;
        const next = await tx.order.findUnique({ where: { id: orderId } });
        if (!next) throw new Error('ORDER_NOT_FOUND');
        if (changed.count > 0) await tx.orderStatusHistory.create({ data: { orderId, status: 'PAID' } });
        return next;
      });

    // Answer callback quickly.
    await tgApi(getAdminBotToken(), 'answerCallbackQuery', {
      callback_query_id: cb.id,
      text: didConfirm ? 'Оплата подтверждена' : 'Оплата уже подтверждена',
    });

    // Update message UI.
    if (didConfirm) try {
      const chatId = cb.message?.chat?.id;
      const messageId = cb.message?.message_id;
      if (chatId != null && messageId != null) {
        const amount = Number(order.totalPrice || 0);
        const userLabel = order.user?.username ? `@${order.user.username}` : (order.user?.name || `User ${order.user?.id || '—'}`);
        const text =
          `Оплата подтверждена\n` +
          `Заказ: #${orderId}\n` +
          `Сумма: ${Math.round(amount).toLocaleString('ru-RU')} ₽\n` +
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
    if (didConfirm) try {
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
module.exports._test = { makeSig, safeEqual, requireWebhookSecret };
