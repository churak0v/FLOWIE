const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const { createOrder } = require('../services/orderCreation');
const { issueDeliveryQuote } = require('../services/deliveryPayment');
const paymentsRouter = require('../routes/payments');

const databaseUrl = process.env.TEST_DATABASE_URL;

function checkoutBody(checkoutKey, productId) {
  return {
    checkoutKey,
    items: [{ productId, quantity: 1 }],
    askRecipientAddress: true,
    askRecipientTime: true,
    deliveryAddress: '',
    deliveryTime: '',
    recipientName: 'Получатель',
    recipientPhone: '+79990000001',
    senderPhone: '+79990000002',
    consentPersonal: true,
  };
}

test('delivery migration, quote locking and dispatch guard hold on isolated PostgreSQL', { skip: !databaseUrl }, async () => {
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    const customer = await prisma.user.create({ data: { name: 'Delivery DB customer' } });
    const staff = await prisma.user.create({
      data: { name: 'Delivery DB staff', staffRole: 'moderator', staffActive: true },
    });
    const productId = 900_000 + crypto.randomInt(1, 90_000);
    const product = await prisma.product.create({
      data: { id: productId, name: 'DB bouquet', price: 5000, image: '/test.jpg', tags: 'test' },
    });
    assert.equal(Number.isSafeInteger(product.id), true);

    const created = await createOrder({
      prisma,
      userId: customer.id,
      body: checkoutBody(crypto.randomUUID(), product.id),
      env: {},
    });
    await prisma.order.update({
      where: { id: created.order.id },
      data: { paymentStatus: 'CONFIRMED', status: 'PAID', paidAt: new Date() },
    });

    const quoteArgs = {
      prisma,
      orderId: created.order.id,
      staffUserId: staff.id,
      body: {
        quoteKey: crypto.randomUUID(),
        deliveryAddress: 'Ижевск, Пушкинская улица, 10',
        deliveryTime: '19 ноября, 18:00–20:00',
        amount: 700,
      },
    };
    const quotes = await Promise.all(Array.from({ length: 10 }, () => issueDeliveryQuote(quoteArgs)));
    assert.equal(quotes.filter((result) => !result.replayed).length, 1);
    assert.equal(await prisma.deliveryInvoice.count({ where: { orderId: created.order.id } }), 1);

    await assert.rejects(
      () => prisma.order.update({ where: { id: created.order.id }, data: { status: 'IN_DELIVERY' } }),
      (error) => String(error?.message || '').includes('DELIVERY_PAYMENT_REQUIRED'),
    );

    await prisma.$transaction([
      prisma.deliveryInvoice.update({ where: { orderId: created.order.id }, data: { status: 'PAID', paidAt: new Date() } }),
      prisma.order.update({ where: { id: created.order.id }, data: { deliveryStatus: 'PAID' } }),
    ]);
    const dispatched = await prisma.order.update({ where: { id: created.order.id }, data: { status: 'IN_DELIVERY' } });
    assert.equal(dispatched.status, 'IN_DELIVERY');

    const raceCreated = await createOrder({
      prisma,
      userId: customer.id,
      body: checkoutBody(crypto.randomUUID(), product.id),
      env: {},
    });
    await prisma.order.update({
      where: { id: raceCreated.order.id },
      data: { paymentStatus: 'CONFIRMED', status: 'PAID', paidAt: new Date() },
    });
    const raceQuote = issueDeliveryQuote({
      prisma,
      orderId: raceCreated.order.id,
      staffUserId: staff.id,
      body: {
        quoteKey: crypto.randomUUID(),
        deliveryAddress: 'Ижевск, Удмуртская улица, 20',
        deliveryTime: '20 ноября, 12:00–14:00',
        amount: 800,
      },
    });
    const cancel = prisma.order.update({ where: { id: raceCreated.order.id }, data: { status: 'CANCELLED' } });
    await Promise.allSettled([raceQuote, cancel]);
    const finalOrder = await prisma.order.findUnique({ where: { id: raceCreated.order.id }, include: { deliveryInvoice: true } });
    assert.equal(finalOrder.status, 'CANCELLED');
    assert.equal(['CANCELLED', undefined].includes(finalOrder.deliveryInvoice?.status), true);
    assert.notEqual(finalOrder.deliveryInvoice?.status, 'PAYMENT_PENDING');

    const lateCreated = await createOrder({
      prisma,
      userId: customer.id,
      body: checkoutBody(crypto.randomUUID(), product.id),
      env: {},
    });
    await prisma.order.update({
      where: { id: lateCreated.order.id },
      data: { paymentStatus: 'CONFIRMED', status: 'PAID', paidAt: new Date() },
    });
    await issueDeliveryQuote({
      prisma,
      orderId: lateCreated.order.id,
      staffUserId: staff.id,
      body: {
        quoteKey: crypto.randomUUID(),
        deliveryAddress: 'Ижевск, Карла Маркса, 30',
        deliveryTime: '21 ноября, 14:00–16:00',
        amount: 900,
      },
    });
    await prisma.deliveryInvoice.update({
      where: { orderId: lateCreated.order.id },
      data: { paymentChargeId: 'late-bank-order' },
    });
    await prisma.order.update({ where: { id: lateCreated.order.id }, data: { status: 'CANCELLED' } });
    const cancelledInvoice = await prisma.deliveryInvoice.findUnique({ where: { orderId: lateCreated.order.id } });
    assert.equal(cancelledInvoice.status, 'CANCELLED');
    assert.equal(cancelledInvoice.paymentChargeId, 'late-bank-order');

    const concurrentCreated = await createOrder({
      prisma,
      userId: customer.id,
      body: checkoutBody(crypto.randomUUID(), product.id),
      env: {},
    });
    await prisma.order.update({
      where: { id: concurrentCreated.order.id },
      data: { paymentStatus: 'CONFIRMED', status: 'PAID', paidAt: new Date() },
    });
    await issueDeliveryQuote({
      prisma,
      orderId: concurrentCreated.order.id,
      staffUserId: staff.id,
      body: {
        quoteKey: crypto.randomUUID(),
        deliveryAddress: 'Ижевск, Ленина, 40',
        deliveryTime: '22 ноября, 10:00–12:00',
        amount: 1000,
      },
    });
    const concurrentInvoice = await prisma.deliveryInvoice.update({
      where: { orderId: concurrentCreated.order.id },
      data: { paymentChargeId: 'concurrent-bank-order' },
    });
    paymentsRouter.__setPrismaForTests(prisma);
    await Promise.allSettled([
      paymentsRouter._test.markDeliveryInvoicePaid(concurrentInvoice, { alfa: { confirmedAmount: 100000 } }, 'concurrent-bank-order'),
      prisma.order.update({ where: { id: concurrentCreated.order.id }, data: { status: 'CANCELLED' } }),
    ]);
    const concurrentFinal = await prisma.order.findUnique({
      where: { id: concurrentCreated.order.id },
      include: { deliveryInvoice: true },
    });
    assert.equal(concurrentFinal.status, 'CANCELLED');
    assert.equal(concurrentFinal.deliveryStatus, 'RECONCILIATION_REQUIRED');
    assert.equal(concurrentFinal.deliveryInvoice.status, 'RECONCILIATION_REQUIRED');
    assert.ok(concurrentFinal.deliveryInvoice.paidAt instanceof Date);
  } finally {
    await prisma.$disconnect();
  }
});
