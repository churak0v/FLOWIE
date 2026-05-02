const express = require('express');
const cors = require('cors');
require('dotenv').config();
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const { validate, parse } = require('@tma.js/init-data-node');
const { PrismaClient } = require('@prisma/client');

const app = express();
const PORT = process.env.PORT || 3001;
const prisma = new PrismaClient();

app.set('trust proxy', 1);
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
// Uploaded files are immutable (random filenames), so we can cache them aggressively.
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), { maxAge: 31536000000, immutable: true }));

const { authenticate } = require('./middleware/auth');
app.use(authenticate);

// basic health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date() });
});

const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const orderRoutes = require('./routes/orders');
const deliveryRoutes = require('./routes/delivery');
	const uploadRoutes = require('./routes/upload');
	const adminRoutes = require('./routes/admin');
	const eventsRoutes = require('./routes/events');
	const chatsRoutes = require('./routes/chats');
	const recipientsRoutes = require('./routes/recipients');
	const collectionsRoutes = require('./routes/collections');
	const paymentsRoutes = require('./routes/payments');
	const telegramRoutes = require('./routes/telegram');

app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/delivery', deliveryRoutes);
	app.use('/api/upload', uploadRoutes);
	app.use('/api/chats', chatsRoutes);
	app.use('/api/recipients', recipientsRoutes);
	app.use('/api/collections', collectionsRoutes);
	app.use('/api/payments', paymentsRoutes);
	app.use('/api/telegram', telegramRoutes);
	app.use('/api/admin', adminRoutes);
	app.use('/api/events', eventsRoutes);

// --- WebSocket (Chat) ---
function tryParseInitData(initData) {
    const raw = String(initData || '');
    if (!raw) throw new Error('NO_INIT_DATA');

    const tokens = [process.env.ADMIN_BOT_TOKEN, process.env.BOT_TOKEN].filter(Boolean);
    if (!tokens.length) throw new Error('BOT_TOKEN_NOT_SET');

    let lastErr = null;
    for (const token of tokens) {
        try {
            // Keep initData valid for longer; otherwise Socket.IO reconnects will fail after a few minutes.
            validate(raw, token, { expiresIn: 86400 });
            return parse(raw);
        } catch (e) {
            lastErr = e;
        }
    }
    throw lastErr || new Error('INVALID_INIT_DATA');
}

async function upsertUserFromInitData(initData) {
    const data = tryParseInitData(initData);
    const tgUser = data.user;
    if (!tgUser?.id) throw new Error('NO_USER');

    const telegramId = String(tgUser.id);
    const name = [tgUser.firstName, tgUser.lastName].filter(Boolean).join(' ') || null;
    const username = tgUser.username ? String(tgUser.username) : null;

    return prisma.user.upsert({
        where: { telegramId },
        update: { name, username },
        create: { telegramId, name, username },
    });
}

const server = http.createServer(app);

const io = new Server(server, {
    path: '/api/socket.io',
    cors: { origin: true, credentials: true },
});

io.use(async (socket, next) => {
    try {
        const initData = socket.handshake.auth?.initData;
        const user = await upsertUserFromInitData(initData);

        const isStaff = Boolean(user.staffRole && user.staffActive);
        socket.data.user = {
            id: user.id,
            telegramId: user.telegramId,
            username: user.username,
            name: user.name,
            isStaff,
            staffRole: user.staffRole || null,
        };

        return next();
    } catch (e) {
        return next(new Error('UNAUTHORIZED'));
    }
});

io.on('connection', (socket) => {
    const me = socket.data.user;

    socket.on('joinChat', async (payload, cb) => {
        try {
            const chatId = Number(payload?.chatId);
            if (!Number.isFinite(chatId)) throw new Error('BAD_CHAT_ID');

            const chat = await prisma.chat.findUnique({ where: { id: chatId } });
            if (!chat) throw new Error('CHAT_NOT_FOUND');

            if (!me?.isStaff && chat.userId !== me.id) throw new Error('FORBIDDEN');

            socket.join(`chat:${chatId}`);
            cb?.({ ok: true });
        } catch (e) {
            cb?.({ ok: false, error: e?.message || 'JOIN_FAILED' });
        }
    });

    socket.on('sendMessage', async (payload, cb) => {
        try {
            const chatId = Number(payload?.chatId);
            if (!Number.isFinite(chatId)) throw new Error('BAD_CHAT_ID');

            const text = payload?.text == null ? null : String(payload.text);
            const attachmentUrl = payload?.attachmentUrl == null ? null : String(payload.attachmentUrl);
            if (!text && !attachmentUrl) throw new Error('EMPTY_MESSAGE');

            const chat = await prisma.chat.findUnique({ where: { id: chatId } });
            if (!chat) throw new Error('CHAT_NOT_FOUND');
            if (!me?.isStaff && chat.userId !== me.id) throw new Error('FORBIDDEN');

            const message = await prisma.$transaction(async (tx) => {
                await tx.chat.update({ where: { id: chatId }, data: { updatedAt: new Date() } });
                return tx.message.create({
                    data: {
                        chatId,
                        senderRole: me.isStaff ? 'staff' : 'client',
                        senderUserId: me.id,
                        text,
                        attachmentUrl,
                    },
                });
            });

            io.to(`chat:${chatId}`).emit('message', message);
            cb?.({ ok: true, message });
        } catch (e) {
            cb?.({ ok: false, error: e?.message || 'SEND_FAILED' });
        }
    });
});

server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
