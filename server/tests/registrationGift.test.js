'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const {
  getRegistrationGiftConfig,
  getRegistrationGiftStatus,
  recordRegistrationGiftExposure,
  claimRegistrationGiftForVerifiedPhone,
} = require('../services/registrationGift');
const {
  createRegistrationGiftRouter,
  createRegistrationGiftAdminRouter,
} = require('../routes/registrationGift');

const enabledEnv = {
  FLOWIE_REGISTRATION_GIFT_ENABLED: 'true',
  FLOWIE_REGISTRATION_GIFT_CAMPAIGN_ID: 'raff-registration-v1',
  FLOWIE_REGISTRATION_GIFT_TITLE: 'Подарок за регистрацию',
  FLOWIE_REGISTRATION_GIFT_BODY: 'Raffaello вместе с первым выполненным заказом',
  FLOWIE_REGISTRATION_GIFT_ITEM: 'Raffaello',
  FLOWIE_REGISTRATION_GIFT_QUANTITY: '1',
  FLOWIE_REGISTRATION_GIFT_FULFILLMENT_MODE: 'first_order',
};

function createPrisma() {
  const state = {
    users: new Map(),
    orders: [],
    ledgers: [],
    sequence: 0,
    exposureCreates: 0,
  };
  const ledger = {
    findFirst: async ({ where }) => state.ledgers.find((row) => {
      if (where.campaignId && row.campaignId !== where.campaignId) return false;
      if (where.userId != null && row.userId !== where.userId) return false;
      if (where.claimedAt?.not === null && !row.claimedAt) return false;
      if (where.fulfilledAt === null && row.fulfilledAt) return false;
      return !where.OR || where.OR.some((part) => (part.userId != null && row.userId === part.userId)
        || (part.verifiedPhone != null && row.verifiedPhone === part.verifiedPhone));
    }) || null,
    findMany: async ({ where, include }) => {
      let rows = state.ledgers.filter((row) => {
        if (where.campaignId && row.campaignId !== where.campaignId) return false;
        if (where.claimedAt?.not === null && !row.claimedAt) return false;
        if (where.fulfilledAt === null && row.fulfilledAt) return false;
        if (where.fulfilledAt?.not === null && !row.fulfilledAt) return false;
        if (where.OR) return where.OR.some((part) => row.verifiedPhone === part.verifiedPhone
          || part.userId?.in?.includes(row.userId));
        return true;
      });
      if (include?.user) rows = rows.map((row) => {
        const user = state.users.get(row.userId);
        const orders = state.orders.filter((order) => order.userId === row.userId
          && order.paymentStatus === 'CONFIRMED' && order.paidAt && !['CANCELLED', 'cancelled'].includes(order.status))
          .sort((a, b) => new Date(a.paidAt) - new Date(b.paidAt))
          .slice(0, 1);
        return { ...row, user: { ...user, orders } };
      });
      return rows;
    },
    findUnique: async ({ where }) => {
      if (where.id) return state.ledgers.find((row) => row.id === where.id) || null;
      const key = where.campaignId_verifiedPhone;
      return state.ledgers.find((row) => row.campaignId === key.campaignId && row.verifiedPhone === key.verifiedPhone) || null;
    },
    upsert: async ({ where, create }) => {
      const key = where.campaignId_userId;
      let row = state.ledgers.find((item) => item.campaignId === key.campaignId && item.userId === key.userId);
      if (!row) {
        state.exposureCreates += 1;
        row = { id: `gift-${++state.sequence}`, verifiedPhone: null, claimedAt: null, fulfilledAt: null, ...create };
        state.ledgers.push(row);
      }
      return row;
    },
    update: async ({ where, data }) => {
      const row = state.ledgers.find((item) => item.id === where.id);
      Object.assign(row, data);
      return row;
    },
    updateMany: async ({ where, data }) => {
      const row = state.ledgers.find((item) => item.id === where.id && (!('fulfilledAt' in where) || !item.fulfilledAt));
      if (!row) return { count: 0 };
      Object.assign(row, data);
      return { count: 1 };
    },
    delete: async ({ where }) => {
      const index = state.ledgers.findIndex((item) => item.id === where.id);
      return state.ledgers.splice(index, 1)[0];
    },
  };
  const prisma = {
    registrationGiftLedger: ledger,
    user: { findUnique: async ({ where }) => state.users.get(where.id) || null },
    order: {
      findUnique: async ({ where }) => {
        const order = state.orders.find((item) => item.id === where.id);
        return order ? { id: order.id, userId: order.userId } : null;
      },
      findFirst: async ({ where }) => state.orders.filter((order) => order.userId === where.userId
        && order.paymentStatus === 'CONFIRMED' && order.paidAt && !['CANCELLED', 'cancelled'].includes(order.status))
        .sort((a, b) => new Date(a.paidAt) - new Date(b.paidAt))[0] || null,
    },
    $transaction: async (fn) => fn(prisma),
  };
  return { prisma, state };
}

test('campaign is fail-closed and publishes no promise until explicitly complete and enabled', () => {
  assert.deepEqual(getRegistrationGiftConfig({}).campaign, null);
  assert.equal(getRegistrationGiftConfig({ FLOWIE_REGISTRATION_GIFT_ENABLED: 'true' }).enabled, false);
  const config = getRegistrationGiftConfig(enabledEnv);
  assert.equal(config.enabled, true);
  assert.equal(config.giftName, 'Raffaello');
  assert.equal(config.giftQuantity, 1);
  assert.equal(config.fulfillmentMode, 'first_order');
});

test('exposure is idempotent and only a newly verified phone account receives one claim', async () => {
  const { prisma, state } = createPrisma();
  const guest = { id: 10, verifiedPhone: null };
  await recordRegistrationGiftExposure({ prisma, user: guest, env: enabledEnv });
  await recordRegistrationGiftExposure({ prisma, user: guest, env: enabledEnv });
  assert.equal(state.exposureCreates, 1);
  assert.equal((await getRegistrationGiftStatus({ prisma, user: guest, env: enabledEnv })).exposed, true);

  const claimed = await claimRegistrationGiftForVerifiedPhone(prisma, {
    sourceUserId: 10,
    targetUserId: 10,
    verifiedPhone: '+79995550001',
    newlyVerifiedAccount: true,
    env: enabledEnv,
  });
  assert.equal(claimed.verifiedPhone, '+79995550001');
  assert.ok(claimed.claimedAt);
  const replay = await claimRegistrationGiftForVerifiedPhone(prisma, {
    sourceUserId: 10,
    targetUserId: 10,
    verifiedPhone: '+79995550001',
    newlyVerifiedAccount: true,
    env: enabledEnv,
  });
  assert.equal(replay.id, claimed.id);
  assert.equal(state.ledgers.length, 1);

  const { prisma: other, state: otherState } = createPrisma();
  await recordRegistrationGiftExposure({ prisma: other, user: guest, env: enabledEnv });
  const denied = await claimRegistrationGiftForVerifiedPhone(other, {
    sourceUserId: 10,
    targetUserId: 99,
    verifiedPhone: '+79995550002',
    newlyVerifiedAccount: false,
    env: enabledEnv,
  });
  assert.equal(denied, null);
  assert.equal(otherState.ledgers[0].claimedAt, null);
});

test('disabling new promotion exposure does not erase or prevent an already-seen entitlement', async () => {
  const { prisma } = createPrisma();
  const guest = { id: 10, verifiedPhone: null };
  await recordRegistrationGiftExposure({ prisma, user: guest, env: enabledEnv });
  const disabledEnv = { ...enabledEnv, FLOWIE_REGISTRATION_GIFT_ENABLED: 'false' };
  const claimed = await claimRegistrationGiftForVerifiedPhone(prisma, {
    sourceUserId: 10,
    targetUserId: 10,
    verifiedPhone: '+79995550001',
    newlyVerifiedAccount: true,
    env: disabledEnv,
  });
  assert.ok(claimed.claimedAt);
  const status = await getRegistrationGiftStatus({
    prisma,
    user: { id: 10, verifiedPhone: '+79995550001' },
    env: disabledEnv,
  });
  assert.equal(status.enabled, false);
  assert.equal(status.claimed, true);
  assert.equal(status.campaign.giftName, 'Raffaello');
  assert.equal(status.campaign.termsVersion, 'raff-registration-v1');
});

test('a concurrent phone claim resolves to the unique campaign-phone winner', async () => {
  const exposure = {
    id: 'exposure-loser', campaignId: 'raff-registration-v1', userId: 10,
    giftName: 'Raffaello', fulfillmentMode: 'first_order', claimedAt: null,
  };
  const winner = { ...exposure, id: 'claim-winner', verifiedPhone: '+79995550001', claimedAt: new Date() };
  const tx = {
    registrationGiftLedger: {
      findMany: async () => [exposure],
      update: async () => { throw Object.assign(new Error('unique'), { code: 'P2002' }); },
      findUnique: async ({ where }) => {
        assert.deepEqual(where.campaignId_verifiedPhone, {
          campaignId: 'raff-registration-v1', verifiedPhone: '+79995550001',
        });
        return winner;
      },
    },
  };
  const result = await claimRegistrationGiftForVerifiedPhone(tx, {
    sourceUserId: 10,
    targetUserId: 10,
    verifiedPhone: '+79995550001',
    newlyVerifiedAccount: true,
    env: enabledEnv,
  });
  assert.equal(result.id, 'claim-winner');
});

async function withServer({ prisma, userId, admin = false }, run) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { if (userId) req.user = { id: userId }; next(); });
  if (admin) app.use('/api/admin/registration-gifts', createRegistrationGiftAdminRouter({ prisma, now: () => new Date('2026-11-26T12:00:00Z') }));
  else app.use('/api/registration-gift', createRegistrationGiftRouter({ prisma, env: enabledEnv, now: () => new Date('2026-11-26T10:00:00Z') }));
  const server = await new Promise((resolve) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  try { await run(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise((resolve) => server.close(resolve)); }
}

test('guest status/exposure API is session-bound and hides after verified claim', async () => {
  const { prisma, state } = createPrisma();
  state.users.set(10, { id: 10, name: 'Гость', verifiedPhone: null });
  await withServer({ prisma, userId: 10 }, async (base) => {
    let response = await fetch(`${base}/api/registration-gift/status`);
    let body = await response.json();
    assert.equal(body.eligible, true);
    assert.equal(body.exposed, false);
    response = await fetch(`${base}/api/registration-gift/exposure`, { method: 'POST', headers: { origin: base } });
    body = await response.json();
    assert.equal(body.exposed, true);
    assert.equal(state.ledgers.length, 1);
  });
  state.users.get(10).verifiedPhone = '+79995550001';
  state.ledgers[0].verifiedPhone = '+79995550001';
  state.ledgers[0].claimedAt = new Date();
  await withServer({ prisma, userId: 10 }, async (base) => {
    const body = await (await fetch(`${base}/api/registration-gift/status`)).json();
    assert.equal(body.eligible, false);
    assert.equal(body.claimed, true);
  });
});

test('staff sees an outstanding gift but can fulfill it only on the first paid delivered order', async () => {
  const { prisma, state } = createPrisma();
  state.users.set(1, { id: 1, name: 'Менеджер', staffRole: 'moderator', staffActive: true });
  state.users.set(10, { id: 10, name: 'Клиент', verifiedPhone: '+79995550001' });
  state.ledgers.push({
    id: 'gift-1', campaignId: 'raff-registration-v1', userId: 10, verifiedPhone: '+79995550001',
    giftName: 'Raffaello', fulfillmentMode: 'first_order', exposedAt: new Date(), claimedAt: new Date(), fulfilledAt: null,
  });
  state.orders.push(
    { id: 20, userId: 10, paymentStatus: 'CONFIRMED', paidAt: new Date('2026-11-25'), status: 'CANCELLED', createdAt: new Date('2026-11-25') },
    { id: 21, userId: 10, paymentStatus: 'CONFIRMED', paidAt: new Date('2026-11-26'), status: 'DELIVERED', deliveredAt: new Date('2026-11-26'), createdAt: new Date('2026-11-26') },
    { id: 22, userId: 10, paymentStatus: 'CONFIRMED', paidAt: new Date('2026-11-27'), status: 'DELIVERED', deliveredAt: new Date('2026-11-27'), createdAt: new Date('2026-11-27') },
  );
  await withServer({ prisma, userId: 1, admin: true }, async (base) => {
    let response = await fetch(`${base}/api/admin/registration-gifts`);
    let body = await response.json();
    assert.equal(body.gifts[0].readyToFulfill, true);
    assert.equal(body.gifts[0].firstEligibleOrder.id, 21);

    response = await fetch(`${base}/api/admin/registration-gifts/order/21`);
    body = await response.json();
    assert.equal(body.gift.giftName, 'Raffaello');
    assert.equal(body.gift.readyToFulfill, true);
    response = await fetch(`${base}/api/admin/registration-gifts/order/22`);
    assert.equal((await response.json()).gift, null);

    response = await fetch(`${base}/api/admin/registration-gifts/gift-1/fulfill`, {
      method: 'POST', headers: { origin: base, 'content-type': 'application/json' }, body: JSON.stringify({ orderId: 22 }),
    });
    assert.equal(response.status, 409);
    assert.equal((await response.json()).error, 'FIRST_PAID_ORDER_REQUIRED');

    response = await fetch(`${base}/api/admin/registration-gifts/gift-1/fulfill`, {
      method: 'POST', headers: { origin: base, 'content-type': 'application/json' }, body: JSON.stringify({ orderId: 21 }),
    });
    body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.gift.fulfillmentOrderId, 21);
    assert.ok(body.gift.fulfilledAt);

    response = await fetch(`${base}/api/admin/registration-gifts/gift-1/fulfill`, {
      method: 'POST', headers: { origin: base, 'content-type': 'application/json' }, body: JSON.stringify({ orderId: 21 }),
    });
    assert.equal((await response.json()).replayed, true);
  });
});
