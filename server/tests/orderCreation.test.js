const test = require('node:test');
const assert = require('node:assert/strict');
const {
    OrderCreationError,
    createOrder,
    getConfiguredDeliveryTariff,
    normalizeOrderRequest,
} = require('../services/orderCreation');

const CHECKOUT_KEY = '3f85a2ac-4192-4f81-b2f4-73a689cb61f7';

function validBody(overrides = {}) {
    return {
        checkoutKey: CHECKOUT_KEY,
        items: [{ productId: 10, quantity: 2, price: 1 }],
        deliveryAddress: 'Санкт-Петербург, Невский проспект, 10',
        deliveryTime: '',
        recipientName: 'Получатель',
        recipientPhone: '+79990000001',
        senderPhone: '+79990000002',
        floristComment: '',
        consentPersonal: true,
        ...overrides,
    };
}

function createPrisma({ products, zones = [], user = { id: 7, referralLinkId: null } } = {}) {
    const state = {
        products: products || [{ id: 10, price: 2000, discount: 200, isActive: true }],
        orders: [],
        history: [],
        chats: [],
        advisoryLocks: [],
        creates: 0,
    };
    const tx = {
        $queryRawUnsafe: async (query, lockId) => {
            assert.match(query, /pg_advisory_xact_lock/);
            state.advisoryLocks.push(lockId);
            return [{ pg_advisory_xact_lock: null }];
        },
        order: {
            findFirst: async ({ where }) => {
                const prefix = where.checkoutKey.startsWith;
                return state.orders.find((order) => order.checkoutKey.startsWith(prefix)) || null;
            },
            create: async ({ data }) => {
                state.creates += 1;
                const order = {
                    id: state.creates,
                    ...data,
                    items: data.items.create.map((item, index) => ({ id: index + 1, ...item })),
                    user,
                };
                state.orders.push(order);
                return order;
            },
        },
        product: {
            findMany: async ({ where }) => state.products.filter((product) => where.id.in.includes(product.id)),
        },
        user: {
            findUnique: async ({ where }) => (where.id === user.id ? user : null),
        },
        orderStatusHistory: {
            create: async ({ data }) => {
                state.history.push(data);
                return data;
            },
        },
        chat: {
            create: async ({ data }) => {
                state.chats.push(data);
                return data;
            },
        },
    };

    let queue = Promise.resolve();
    const prisma = {
        order: tx.order,
        deliverySettings: { findUnique: async () => ({mode: zones.length ? 'zones' : 'flat'}) },
        deliveryZone: { findMany: async () => zones },
        $transaction(fn) {
            const result = queue.then(() => fn(tx));
            queue = result.catch(() => undefined);
            return result;
        },
    };
    return { prisma, state };
}

async function expectOrderError(promise, code, status = 400) {
    await assert.rejects(promise, (error) => {
        assert.ok(error instanceof OrderCreationError);
        assert.equal(error.code, code);
        assert.equal(error.status, status);
        return true;
    });
}

test('server ignores client prices and calculates product discounts and delivery', async () => {
    const { prisma, state } = createPrisma();
    const result = await createOrder({
        prisma,
        userId: 7,
        body: validBody({ deliveryCost: 1, totalPrice: 1 }),
        env: { DELIVERY_TARIFF_RUB: '300' },
        now: () => new Date('2026-11-18T10:00:00.000Z'),
    });

    assert.equal(result.replayed, false);
    assert.equal(result.order.items[0].price, 1800);
    assert.equal(result.order.itemsTotal, 3600);
    assert.equal(result.order.deliveryCost, 300);
    assert.equal(result.order.totalPrice, 3900);
    assert.equal(result.order.paymentExpiresAt.toISOString(), '2026-11-18T10:15:00.000Z');
    assert.equal(state.history.length, 1);
    assert.equal(state.chats.length, 1);
});

test('order preserves analytics session and only hashed click attribution', async () => {
    const { prisma } = createPrisma();
    const result = await createOrder({
        prisma,
        userId: 7,
        body: validBody({ analytics: { sessionId: 'session_analytics_123', attribution: { utm_source: 'vk_ads', utm_campaign: '42', mt_click_id: 'opaque-vk-click' } } }),
        env: { DELIVERY_TARIFF_RUB: '300' },
    });
    assert.equal(result.order.analyticsSessionId, 'session_analytics_123');
    assert.equal(result.order.analyticsAttribution.utm_source, 'vk_ads');
    assert.match(result.order.analyticsAttribution.mt_click_idHash, /^[a-f0-9]{64}$/);
    assert.equal(JSON.stringify(result.order.analyticsAttribution).includes('opaque-vk-click'), false);
});

test('concurrent duplicate submit creates exactly one order', async () => {
    const { prisma, state } = createPrisma();
    const args = {
        prisma,
        userId: 7,
        body: validBody(),
        env: { DELIVERY_TARIFF_RUB: '300' },
    };
    const [first, second] = await Promise.all([createOrder(args), createOrder(args)]);

    assert.equal(state.creates, 1);
    assert.equal(state.orders.length, 1);
    assert.equal(state.history.length, 1);
    assert.equal(state.chats.length, 1);
    assert.equal(first.order.id, second.order.id);
    assert.deepEqual([first.replayed, second.replayed].sort(), [false, true]);
});

test('same checkout key with changed payload is rejected', async () => {
    const { prisma, state } = createPrisma();
    const common = { prisma, userId: 7, env: { DELIVERY_TARIFF_RUB: '300' } };
    await createOrder({ ...common, body: validBody() });
    await expectOrderError(
        createOrder({ ...common, body: validBody({ items: [{ productId: 10, quantity: 3 }] }) }),
        'IDEMPOTENCY_KEY_REUSED',
        409,
    );
    assert.equal(state.creates, 1);
});

test('inactive and missing products are rejected', async () => {
    for (const products of [
        [{ id: 10, price: 2000, discount: 0, isActive: false }],
        [],
    ]) {
        const { prisma } = createPrisma({ products });
        await expectOrderError(
            createOrder({ prisma, userId: 7, body: validBody(), env: { DELIVERY_TARIFF_RUB: '300' } }),
            'PRODUCT_UNAVAILABLE',
            409,
        );
    }
});

test('quantity and identifiers must be bounded positive integers', () => {
    for (const item of [
        { productId: 10, quantity: 0 },
        { productId: 10, quantity: 1.5 },
        { productId: 10, quantity: 100 },
        { productId: 'bad', quantity: 1 },
    ]) {
        assert.throws(() => normalizeOrderRequest(validBody({ items: [item] })), OrderCreationError);
    }
});

test('placeholder address and malformed phones are rejected', () => {
    assert.throws(
        () => normalizeOrderRequest(validBody({ deliveryAddress: 'Адрес уточнить у клиента' })),
        (error) => error.code === 'DELIVERY_ADDRESS_REQUIRED',
    );
    assert.throws(
        () => normalizeOrderRequest(validBody({ senderPhone: '123' })),
        (error) => error.code === 'BAD_SENDER_PHONE',
    );
    assert.throws(
        () => normalizeOrderRequest(validBody({ recipientPhone: 'abc' })),
        (error) => error.code === 'BAD_RECIPIENT_PHONE',
    );
});

test('delivery tariff must be explicitly configured', async () => {
    assert.throws(
        () => getConfiguredDeliveryTariff({}),
        (error) => error.code === 'DELIVERY_TARIFF_NOT_CONFIGURED' && error.status === 503,
    );
    const { prisma } = createPrisma();
    await expectOrderError(
        createOrder({ prisma, userId: 7, body: validBody(), env: {} }),
        'DELIVERY_TARIFF_NOT_CONFIGURED',
        503,
    );
});

test('unknown recipient address creates a products-only order with explicitly pending delivery', async () => {
    const { prisma } = createPrisma();
    const result = await createOrder({
        prisma,
        userId: 7,
        body: validBody({
            askRecipientAddress: true,
            askRecipientTime: true,
            deliveryAddress: '',
            deliveryTime: '',
            deliveryCoords: null,
        }),
        env: {},
    });
    assert.equal(result.order.itemsTotal, 3600);
    assert.equal(result.order.deliveryCost, null);
    assert.equal(result.order.totalPrice, 3600);
    assert.equal(result.order.deliveryStatus, 'DETAILS_PENDING');
    assert.equal(result.order.askRecipientAddress, true);
    assert.equal(result.order.askRecipientTime, true);
});

test('recipient phone is mandatory whenever address or time is requested from recipient', () => {
    for (const flags of [
        { askRecipientAddress: true, deliveryAddress: '' },
        { askRecipientTime: true },
    ]) {
        assert.throws(
            () => normalizeOrderRequest(validBody({ ...flags, recipientPhone: '' })),
            (error) => error.code === 'BAD_RECIPIENT_PHONE',
        );
    }
});

test('unknown time alone keeps configured delivery in the main total and coordinates are normalized', async () => {
    const { prisma } = createPrisma();
    const result = await createOrder({
        prisma,
        userId: 7,
        body: validBody({
            askRecipientTime: true,
            deliveryCoords: { lat: 56.8527, lon: 53.2115 },
        }),
        env: { DELIVERY_TARIFF_RUB: '300' },
    });
    assert.equal(result.order.deliveryCost, 300);
    assert.equal(result.order.totalPrice, 3900);
    assert.equal(result.order.deliveryStatus, 'DETAILS_PENDING');
    assert.equal(result.order.deliveryCoords, JSON.stringify({ lat: 56.8527, lon: 53.2115 }));
});

test('delivery coordinates reject malformed or out-of-range input', () => {
    for (const deliveryCoords of ['bad', { lat: 91, lon: 20 }, { lat: 50, lon: -181 }]) {
        assert.throws(
            () => normalizeOrderRequest(validBody({ deliveryCoords })),
            (error) => error.code === 'BAD_DELIVERY_COORDS',
        );
    }
});


test('zone pricing uses server house coordinates and an idempotent retry does not need geocoding again', async () => {
    const zones = [{ id: 1, active: true, priority: 1, price: 650, name: 'QA', conditions: '', polygon: [[56,53],[57,53],[57,54],[56,54]] }];
    const { prisma } = createPrisma({ zones });
    let calls = 0;
    const args = {
        prisma, userId: 7, body: validBody({ deliveryCoords: {lat: 0, lon: 0} }), env: {},
        geocodeDelivery: async () => { calls++; return {kind: 'house', precision: 'exact', coords: {lat: 56.85, lon: 53.2}}; },
    };
    const created = await createOrder(args);
    assert.equal(created.order.deliveryCost, 650);
    assert.equal(created.order.totalPrice, 4250);
    assert.deepEqual(created.order.deliveryCoords, {lat: 56.85, lon: 53.2});
    const replay = await createOrder({...args, geocodeDelivery: async () => { throw new Error('offline'); }});
    assert.equal(replay.replayed, true);
    assert.equal(replay.order.id, created.order.id);
    assert.equal(calls, 1);
});

test('out-of-zone address cannot create an order using a client-supplied inside-zone coordinate', async () => {
    const { prisma, state } = createPrisma({ zones: [{ id: 1, active: true, priority: 1, price: 650, polygon: [[56,53],[57,53],[57,54],[56,54]] }] });
    await expectOrderError(createOrder({
        prisma, userId: 7, body: validBody({deliveryCoords: {lat: 56.85, lon: 53.2}}), env: {DELIVERY_TARIFF_RUB: '10'},
        geocodeDelivery: async () => ({kind: 'house', precision: 'exact', coords: {lat: 60, lon: 60}}),
    }), 'DELIVERY_OUTSIDE_ZONES', 422);
    assert.equal(state.orders.length, 0);
});
