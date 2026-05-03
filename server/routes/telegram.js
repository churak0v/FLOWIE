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
    const msg = update.message || update.edited_message || null;
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
      ? { inline_keyboard: [[{ text: 'Открыть приложение', web_app: { url: appUrl } }]] }
      : undefined;

    await tgApi(getClientBotToken(), 'sendMessage', {
      chat_id: chatId,
      text: 'Добро пожаловать в Премиум-студию флористики FLOWIES.\nОформить предзаказ можно в приложении 👇',
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
