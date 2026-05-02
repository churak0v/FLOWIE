const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

async function ensureSupportChat(userId) {
  const existing = await prisma.chat.findFirst({
    where: { userId, orderId: null },
    orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
  });
  if (existing) return existing;
  return prisma.chat.create({ data: { userId } });
}

// GET /api/chats
router.get('/', requireAuth, async (req, res) => {
  try {
    await ensureSupportChat(req.user.id);

    const chats = await prisma.chat.findMany({
      where: { userId: req.user.id },
      include: {
        order: true,
        messages: {
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 1,
        },
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    });

    return res.json({
      ok: true,
      chats: chats.map((c) => ({
        id: c.id,
        orderId: c.orderId,
        updatedAt: c.updatedAt,
        lastMessage: c.messages?.[0] || null,
      })),
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || 'CHATS_FAILED' });
  }
});

// GET /api/chats/:id/messages
router.get('/:id/messages', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: 'BAD_ID' });

    const chat = await prisma.chat.findUnique({ where: { id } });
    if (!chat) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
    if (chat.userId !== req.user.id) return res.status(403).json({ ok: false, error: 'FORBIDDEN' });

    const messages = await prisma.message.findMany({
      where: { chatId: id },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: 200,
    });

    return res.json({ ok: true, chat: { id: chat.id, orderId: chat.orderId }, messages });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || 'MESSAGES_FAILED' });
  }
});

// POST /api/chats/:id/messages
router.post('/:id/messages', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: 'BAD_ID' });

    const chat = await prisma.chat.findUnique({ where: { id } });
    if (!chat) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
    if (chat.userId !== req.user.id) return res.status(403).json({ ok: false, error: 'FORBIDDEN' });

    const text = req.body?.text == null ? null : String(req.body.text);
    const attachmentUrl = req.body?.attachmentUrl == null ? null : String(req.body.attachmentUrl);
    if (!text && !attachmentUrl) return res.status(400).json({ ok: false, error: 'EMPTY_MESSAGE' });

    const message = await prisma.$transaction(async (tx) => {
      await tx.chat.update({ where: { id }, data: { updatedAt: new Date() } });
      return tx.message.create({
        data: {
          chatId: id,
          senderRole: 'client',
          senderUserId: req.user.id,
          text,
          attachmentUrl,
        },
      });
    });

    return res.json({ ok: true, message });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || 'SEND_FAILED' });
  }
});

module.exports = router;

