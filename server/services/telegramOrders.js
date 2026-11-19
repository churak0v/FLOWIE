const TELEGRAM_API_BASE = 'https://api.telegram.org';
const MAX_ATTEMPTS = 12;

function parseChatIds(value = process.env.TELEGRAM_ORDER_CHAT_IDS) {
  return [...new Set(String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter((item) => /^-?\d+$/.test(item)))];
}

function getConfig(env = process.env) {
  return {
    token: String(env.TELEGRAM_ORDER_BOT_TOKEN || '').trim(),
    chatIds: parseChatIds(env.TELEGRAM_ORDER_CHAT_IDS),
    adminUrl: String(env.TELEGRAM_ORDER_ADMIN_URL || 'https://admin.flowie.art').trim().replace(/\/$/, ''),
  };
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function rubles(value) {
  const amount = Number(value || 0);
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
  }).format(amount);
}

function formatOrderMessage(order, event) {
  const paid = event === 'ORDER_PAID';
  const title = paid
    ? `✅ <b>Заказ №${order.id} оплачен</b>`
    : `🆕 <b>Новый заказ №${order.id}</b>`;
  const items = (order.items || []).map((item) => {
    const name = item.product?.name || `Товар #${item.productId}`;
    return `• ${escapeHtml(name)} × ${item.quantity} — ${escapeHtml(rubles(item.price * item.quantity))}`;
  });
  const delivery = order.askRecipientAddress
    ? 'уточнить у получателя'
    : (order.deliveryAddress || 'не указан');
  const deliveryTime = order.askRecipientTime
    ? 'уточнить у получателя'
    : (order.deliveryTime || 'не указано');

  return [
    title,
    '',
    `<b>Сумма:</b> ${escapeHtml(rubles(order.totalPrice))}`,
    `<b>Оплата:</b> ${paid ? 'подтверждена' : 'ожидается'}`,
    paid ? '<b>Действие:</b> примите заказ и запустите в работу' : null,
    '',
    '<b>Состав:</b>',
    ...(items.length ? items : ['• состав не указан']),
    '',
    `<b>Получатель:</b> ${escapeHtml(order.recipientName || 'не указан')}`,
    `<b>Телефон получателя:</b> ${escapeHtml(order.recipientPhone || 'не указан')}`,
    `<b>Телефон заказчика:</b> ${escapeHtml(order.senderPhone || order.user?.phone || 'не указан')}`,
    `<b>Адрес:</b> ${escapeHtml(delivery)}`,
    `<b>Время:</b> ${escapeHtml(deliveryTime)}`,
    order.floristComment ? `<b>Комментарий:</b> ${escapeHtml(order.floristComment)}` : null,
  ].filter((line) => line !== null).join('\n');
}

async function enqueueOrderNotification(prisma, orderId, event, env = process.env) {
  const { token, chatIds } = getConfig(env);
  if (!token || chatIds.length === 0) return { enabled: false, queued: 0 };
  const result = await prisma.telegramOrderNotification.createMany({
    data: chatIds.map((chatId) => ({ orderId, event, chatId })),
    skipDuplicates: true,
  });
  return { enabled: true, queued: result.count };
}

async function enqueueOrderNotificationSafe(prisma, orderId, event, env = process.env) {
  try {
    return await enqueueOrderNotification(prisma, orderId, event, env);
  } catch (error) {
    console.error('Telegram order notification enqueue failed:', error?.message || error);
    return { enabled: true, queued: 0, error: true };
  }
}

function retryDelayMs(attempt) {
  return Math.min(30 * 60_000, 15_000 * (2 ** Math.min(attempt, 7)));
}

async function sendTelegramMessage(notification, env = process.env, fetchImpl = fetch) {
  const { token, adminUrl } = getConfig(env);
  if (!token) throw new Error('TELEGRAM_ORDER_BOT_TOKEN_MISSING');
  const response = await fetchImpl(`${TELEGRAM_API_BASE}/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: notification.chatId,
      text: formatOrderMessage(notification.order, notification.event),
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_markup: {
        inline_keyboard: [[{ text: 'Открыть заказ', url: `${adminUrl}/orders/${notification.orderId}` }]],
      },
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.ok) {
    throw new Error(`TELEGRAM_SEND_FAILED:${payload.description || response.status}`);
  }
  return payload.result;
}

async function processPending(prisma, env = process.env, fetchImpl = fetch) {
  const { token, chatIds } = getConfig(env);
  if (!token || chatIds.length === 0) return 0;

  // A process can stop after claiming a row. Put only old claims back into the
  // queue so a container restart cannot permanently lose a notification.
  await prisma.telegramOrderNotification.updateMany({
    where: {
      status: 'SENDING',
      updatedAt: { lt: new Date(Date.now() - 10 * 60_000) },
    },
    data: { status: 'PENDING', nextAttemptAt: new Date() },
  });

  const pending = await prisma.telegramOrderNotification.findMany({
    where: { status: 'PENDING', nextAttemptAt: { lte: new Date() } },
    include: { order: { include: { user: true, items: { include: { product: true } } } } },
    orderBy: { createdAt: 'asc' },
    take: 20,
  });

  let handled = 0;
  for (const notification of pending) {
    const claimed = await prisma.telegramOrderNotification.updateMany({
      where: { id: notification.id, status: 'PENDING' },
      data: { status: 'SENDING' },
    });
    if (claimed.count !== 1) continue;
    try {
      await sendTelegramMessage(notification, env, fetchImpl);
      await prisma.telegramOrderNotification.update({
        where: { id: notification.id },
        data: { status: 'SENT', sentAt: new Date(), attempts: { increment: 1 }, lastError: null },
      });
    } catch (error) {
      const attempts = notification.attempts + 1;
      await prisma.telegramOrderNotification.update({
        where: { id: notification.id },
        data: {
          status: attempts >= MAX_ATTEMPTS ? 'FAILED' : 'PENDING',
          attempts,
          nextAttemptAt: new Date(Date.now() + retryDelayMs(attempts)),
          lastError: String(error?.message || error).slice(0, 1000),
        },
      });
    }
    handled += 1;
  }
  return handled;
}

function startTelegramOrderNotifications(prisma, env = process.env) {
  const config = getConfig(env);
  if (!config.token || config.chatIds.length === 0) {
    console.log('Telegram order notifications disabled');
    return () => {};
  }
  let running = false;
  const poll = async () => {
    if (running) return;
    running = true;
    try {
      await processPending(prisma, env);
    } catch (error) {
      console.error('Telegram order notification worker failed:', error?.message || error);
    } finally {
      running = false;
    }
  };
  const timer = setInterval(poll, 10_000);
  timer.unref?.();
  setTimeout(poll, 1_000).unref?.();
  console.log(`Telegram order notifications enabled for ${config.chatIds.length} chats`);
  return () => clearInterval(timer);
}

module.exports = {
  enqueueOrderNotification,
  enqueueOrderNotificationSafe,
  escapeHtml,
  formatOrderMessage,
  getConfig,
  parseChatIds,
  processPending,
  sendTelegramMessage,
  startTelegramOrderNotifications,
};
