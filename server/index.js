const express = require('express');
const cors = require('cors');
require('dotenv').config();
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const cookie = require('cookie');
const { PrismaClient } = require('@prisma/client');
const { SESSION_COOKIE, resolveSession } = require('./services/authSession');
const { startAutoFulfillment } = require('./services/autoFulfillment');
const { createCorsOriginCallback } = require('./services/corsOrigins');
const { startTelegramOrderNotifications } = require('./services/telegramOrders');

const app = express();
const PORT = process.env.PORT || 3001;
const prisma = new PrismaClient();
startAutoFulfillment(prisma);
startTelegramOrderNotifications(prisma);

app.set('trust proxy', 1);
const corsOrigin = createCorsOriginCallback();
app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
// Uploaded files are immutable (random filenames), so we can cache them aggressively.
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
    maxAge: 31536000000,
    immutable: true,
    setHeaders(res, filename) {
        if (filename.endsWith('.avif')) res.setHeader('Content-Type', 'image/avif');
        if (filename.endsWith('.webp')) res.setHeader('Content-Type', 'image/webp');
    },
}));

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
const homeBannersRoutes = require('./routes/homeBanners');
	const paymentsRoutes = require('./routes/payments');
	const seoRoutes = require('./routes/seo');

app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/delivery', deliveryRoutes);
app.use('/api/delivery', require('./routes/deliveryMaps'));
app.use('/api/search', require('./routes/search'));
app.use('/api/gift-picker', require('./routes/giftPicker'));
app.use('/api/admin/bouquet-economics', require('./routes/bouquetEconomics').createBouquetEconomicsRouter({ prisma }));
if (process.env.FLOWIE_BOUQUET_IMPORT_ENABLED === 'true') {
    const { createBouquetImportStorage } = require('./services/bouquetImportStorage');
    const { createBouquetImportRouter } = require('./routes/bouquetImport');
    const storage = createBouquetImportStorage();
    app.use('/api/bouquet-import', createBouquetImportRouter({ prisma, storage }));
    require('./services/bouquetImportNotifications').startBouquetImportNotifications({ prisma });
    if (String(process.env.FLOWIE_IMPORT_AI_MODE || 'sync').toLowerCase() === 'batch') {
        require('./services/bouquetImportIdlePrompt').startBouquetImportIdlePrompt({ prisma });
    }
    if (process.env.OPENAI_API_KEY) {
        const { createOpenAIBatchProvider } = require('./services/bouquetImportBatch');
        const { startBouquetImportWorker } = require('./services/bouquetImportWorker');
        const baseUrl = String(process.env.OPENAI_API_BASE_URL || 'https://api.openai.com').replace(/\/+$/, '');
        startBouquetImportWorker({ prisma, storage, provider: createOpenAIBatchProvider({ apiKey: process.env.OPENAI_API_KEY, baseUrl }) });
    }
}
	app.use('/api/upload', uploadRoutes);
	app.use('/api/chats', chatsRoutes);
	app.use('/api/recipients', recipientsRoutes);
	app.use('/api/collections', collectionsRoutes);
app.use('/api/home-banners', homeBannersRoutes);
	app.use('/api/payments', paymentsRoutes);
	app.use('/api/admin', adminRoutes);
	app.use('/api/events', eventsRoutes);

// Public crawlable HTML uses the same Prisma data as the React storefront.
// Route matching is path-based only; users and crawlers receive identical markup.
app.use('/', seoRoutes);

// --- WebSocket (Chat) ---
const server = http.createServer(app);

const io = new Server(server, {
    path: '/api/socket.io',
    cors: { origin: corsOrigin, credentials: true },
});

io.use(async (socket, next) => {
    try {
        const cookies = cookie.parse(socket.handshake.headers.cookie || '');
        const session = await resolveSession(prisma, cookies[SESSION_COOKIE]);
        if (!session?.user) throw new Error('NO_SESSION');
        const user = session.user;

        const isStaff = Boolean(user.staffRole && user.staffActive);
        socket.data.user = {
            id: user.id,
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
