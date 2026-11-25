'use strict';

const MODES = new Set(['registration', 'first_order']);

function text(value, max) {
  const normalized = String(value || '').trim().replace(/\s+/g, ' ');
  return normalized && normalized.length <= max ? normalized : null;
}

function getRegistrationGiftConfig(env = process.env) {
  const requested = env.FLOWIE_REGISTRATION_GIFT_ENABLED === 'true';
  const id = text(env.FLOWIE_REGISTRATION_GIFT_CAMPAIGN_ID, 80);
  const title = text(env.FLOWIE_REGISTRATION_GIFT_TITLE, 100);
  const body = text(env.FLOWIE_REGISTRATION_GIFT_BODY, 240);
  const giftName = text(env.FLOWIE_REGISTRATION_GIFT_ITEM, 120);
  const giftQuantity = Number(env.FLOWIE_REGISTRATION_GIFT_QUANTITY || 1);
  const fulfillmentMode = text(env.FLOWIE_REGISTRATION_GIFT_FULFILLMENT_MODE, 20) || 'first_order';
  const terms = text(env.FLOWIE_REGISTRATION_GIFT_TERMS, 240);
  const termsVersion = text(env.FLOWIE_REGISTRATION_GIFT_TERMS_VERSION, 80) || id;
  const complete = Boolean(id && title && body && giftName
    && Number.isSafeInteger(giftQuantity) && giftQuantity > 0 && giftQuantity <= 10
    && MODES.has(fulfillmentMode));
  const enabled = Boolean(requested && complete);
  return {
    enabled,
    id,
    giftName,
    giftQuantity,
    fulfillmentMode,
    termsVersion,
    campaign: enabled ? {
      id,
      title,
      body,
      icon: text(env.FLOWIE_REGISTRATION_GIFT_ICON, 40),
      terms,
      ctaLabel: text(env.FLOWIE_REGISTRATION_GIFT_CTA_LABEL, 50) || 'Войти по телефону',
      giftName,
      giftQuantity,
      termsVersion,
    } : null,
  };
}

function snapshotCampaign(row) {
  if (!row?.claimedAt) return null;
  return {
    id: row.campaignId,
    title: row.offerTitle,
    body: row.offerBody,
    terms: row.offerTerms || null,
    ctaLabel: null,
    giftName: row.giftName,
    giftQuantity: row.giftQuantity,
    termsVersion: row.termsVersion,
  };
}

function publicStatus(config, row, user) {
  const claimed = Boolean(row?.claimedAt);
  if (!config.enabled) {
    return {
      enabled: false,
      eligible: false,
      exposed: Boolean(row),
      claimed,
      fulfilled: Boolean(row?.fulfilledAt),
      campaign: snapshotCampaign(row),
    };
  }
  return {
    enabled: true,
    eligible: Boolean(!user?.verifiedPhone && !claimed),
    exposed: Boolean(row),
    claimed,
    fulfilled: Boolean(row?.fulfilledAt),
    campaign: claimed ? snapshotCampaign(row) : config.campaign,
  };
}

async function findCurrentLedger(prisma, config, user) {
  if (!user?.id) return null;
  const or = [{ userId: user.id }];
  if (user.verifiedPhone) or.push({ verifiedPhone: user.verifiedPhone });
  return prisma.registrationGiftLedger.findFirst({
    where: { ...(!user.verifiedPhone && config.id ? { campaignId: config.id } : {}), OR: or },
    orderBy: user.verifiedPhone ? { claimedAt: 'desc' } : { exposedAt: 'asc' },
  });
}

async function getRegistrationGiftStatus({ prisma, user, env = process.env }) {
  const config = getRegistrationGiftConfig(env);
  const row = await findCurrentLedger(prisma, config, user);
  return publicStatus(config, row, user);
}

async function recordRegistrationGiftExposure({ prisma, user, env = process.env, now = () => new Date() }) {
  const config = getRegistrationGiftConfig(env);
  if (!config.enabled || !user?.id || user.verifiedPhone) return publicStatus(config, null, user);
  const row = await prisma.registrationGiftLedger.upsert({
    where: { campaignId_userId: { campaignId: config.id, userId: user.id } },
    update: {},
    create: {
      campaignId: config.id,
      userId: user.id,
      giftName: config.giftName,
      giftQuantity: config.giftQuantity,
      fulfillmentMode: config.fulfillmentMode,
      offerTitle: config.campaign.title,
      offerBody: config.campaign.body,
      offerTerms: config.campaign.terms,
      termsVersion: config.termsVersion,
      exposedAt: now(),
    },
  });
  return publicStatus(config, row, user);
}

function isUniqueConflict(error) {
  return error?.code === 'P2002';
}

async function claimRegistrationGiftForVerifiedPhone(tx, {
  sourceUserId,
  targetUserId,
  verifiedPhone,
  newlyVerifiedAccount = true,
  env = process.env,
  now = () => new Date(),
}) {
  if (!newlyVerifiedAccount || !targetUserId || !verifiedPhone) return null;
  const userIds = [...new Set([sourceUserId, targetUserId].filter(Boolean))];
  const rows = await tx.registrationGiftLedger.findMany({
    where: {
      OR: [{ verifiedPhone }, { userId: { in: userIds } }],
    },
    orderBy: { exposedAt: 'asc' },
  });
  const claimed = rows.find((row) => row.verifiedPhone === verifiedPhone && row.claimedAt);
  if (claimed) return claimed;
  const target = rows.find((row) => row.userId === targetUserId && !row.claimedAt);
  const source = rows.find((row) => row.userId === sourceUserId && !row.claimedAt);
  let candidate = target || source;
  if (!candidate) return null;

  try {
    if (target && source && target.id !== source.id) {
      await tx.registrationGiftLedger.delete({ where: { id: source.id } });
      candidate = target;
    } else if (candidate.userId !== targetUserId) {
      candidate = await tx.registrationGiftLedger.update({
        where: { id: candidate.id },
        data: { userId: targetUserId },
      });
    }
    return await tx.registrationGiftLedger.update({
      where: { id: candidate.id },
      data: {
        verifiedPhone,
        claimedAt: now(),
      },
    });
  } catch (error) {
    if (!isUniqueConflict(error)) throw error;
    return tx.registrationGiftLedger.findUnique({
      where: { campaignId_verifiedPhone: { campaignId: candidate.campaignId, verifiedPhone } },
    });
  }
}

async function fulfillRegistrationGift({
  prisma,
  giftId,
  orderId,
  fulfilledById = null,
  note = null,
  now = () => new Date(),
}) {
  return prisma.$transaction(async (tx) => {
    const gift = await tx.registrationGiftLedger.findUnique({ where: { id: giftId } });
    if (!gift?.claimedAt) return { error: 'NOT_FOUND', status: 404 };
    if (gift.fulfilledAt) return { gift, replayed: true };
    let eligibleOrder = null;
    if (gift.fulfillmentMode === 'first_order') {
      if (!orderId) return { error: 'DELIVERED_ORDER_REQUIRED', status: 409 };
      eligibleOrder = await tx.order.findFirst({
        where: {
          userId: gift.userId,
          paymentStatus: 'CONFIRMED',
          paidAt: { not: null },
          status: { notIn: ['CANCELLED', 'cancelled'] },
        },
        orderBy: [{ paidAt: 'asc' }, { createdAt: 'asc' }],
      });
      if (!eligibleOrder || eligibleOrder.id !== orderId) {
        return { error: 'FIRST_PAID_ORDER_REQUIRED', status: 409 };
      }
      if (!['DELIVERED', 'COMPLETED'].includes(String(eligibleOrder.status || '').toUpperCase())) {
        return { error: 'ORDER_NOT_DELIVERED', status: 409 };
      }
    }
    const changed = await tx.registrationGiftLedger.updateMany({
      where: { id: giftId, fulfilledAt: null },
      data: {
        fulfilledAt: now(),
        fulfilledById,
        fulfillmentOrderId: eligibleOrder?.id || null,
        fulfillmentNote: note,
      },
    });
    const updated = await tx.registrationGiftLedger.findUnique({ where: { id: giftId } });
    return { gift: updated, replayed: changed.count === 0 };
  });
}

module.exports = {
  getRegistrationGiftConfig,
  getRegistrationGiftStatus,
  recordRegistrationGiftExposure,
  claimRegistrationGiftForVerifiedPhone,
  fulfillRegistrationGift,
  publicStatus,
};
