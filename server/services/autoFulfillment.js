const AUTO_STATUSES = ['ACCEPTED', 'ASSEMBLED', 'IN_DELIVERY', 'DELIVERED'];
const TERMINAL_STATUSES = new Set(['DELIVERED', 'CANCELLED']);
const ACTIVE_AUTO_STATUSES = new Set(['PAID', ...AUTO_STATUSES]);

function hashOrderId(id) {
  let x = Number(id || 0) || 0;
  x = ((x >>> 16) ^ x) * 0x45d9f3b;
  x = ((x >>> 16) ^ x) * 0x45d9f3b;
  x = (x >>> 16) ^ x;
  return Math.abs(x);
}

function scheduleForOrder(id) {
  // Full cycle is 30-120 minutes. Deterministic by order id, so restarts do not reshuffle.
  const totalMinutes = 30 + (hashOrderId(id) % 91);
  const totalMs = totalMinutes * 60 * 1000;
  return {
    totalMs,
    steps: [
      { status: 'ACCEPTED', at: 0 },
      { status: 'ASSEMBLED', at: Math.round(totalMs * 0.38) },
      { status: 'IN_DELIVERY', at: Math.round(totalMs * 0.72) },
      { status: 'DELIVERED', at: totalMs },
    ],
  };
}

function targetStatusFor(order, nowMs = Date.now()) {
  const paidAt = order?.paidAt ? new Date(order.paidAt).getTime() : NaN;
  const createdAt = order?.createdAt ? new Date(order.createdAt).getTime() : NaN;
  const start = Number.isFinite(paidAt) ? paidAt : createdAt;
  if (!Number.isFinite(start)) return null;

  const elapsed = Math.max(0, nowMs - start);
  const schedule = scheduleForOrder(order.id);
  let target = 'ACCEPTED';
  for (const step of schedule.steps) {
    if (elapsed >= step.at) target = step.status;
  }
  return target;
}

function statusRank(status) {
  const s = String(status || '').toUpperCase();
  if (s === 'PAID') return 0;
  const idx = AUTO_STATUSES.indexOf(s);
  return idx >= 0 ? idx + 1 : -1;
}

async function advanceOne(prisma, order) {
  const current = String(order.status || '').toUpperCase();
  if (TERMINAL_STATUSES.has(current)) return null;
  if (!ACTIVE_AUTO_STATUSES.has(current)) return null;
  if (String(order.paymentStatus || '').toUpperCase() !== 'CONFIRMED') return null;

  const target = targetStatusFor(order);
  if (!target) return null;
  if (statusRank(target) <= statusRank(current)) return null;

  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const updated = await tx.order.update({
      where: { id: order.id },
      data: {
        status: target,
        deliveredAt: target === 'DELIVERED' ? (order.deliveredAt || now) : undefined,
      },
    });

    await tx.orderStatusHistory.create({
      data: {
        orderId: order.id,
        status: target,
      },
    });

    return updated;
  });
}

async function runAutoFulfillmentTick(prisma) {
  const orders = await prisma.order.findMany({
    where: {
      paymentStatus: 'CONFIRMED',
      status: { in: Array.from(ACTIVE_AUTO_STATUSES).filter((s) => !TERMINAL_STATUSES.has(s)) },
    },
    orderBy: { paidAt: 'asc' },
    take: 100,
  });

  const advanced = [];
  for (const order of orders) {
    // eslint-disable-next-line no-await-in-loop
    const updated = await advanceOne(prisma, order).catch(() => null);
    if (updated) advanced.push(updated);
  }
  return advanced;
}

function startAutoFulfillment(prisma, opts = {}) {
  const enabled = String(process.env.AUTO_FULFILLMENT_ENABLED || 'true').toLowerCase() !== 'false';
  if (!enabled) return null;

  const intervalMs = Number(opts.intervalMs || process.env.AUTO_FULFILLMENT_INTERVAL_MS || 60_000);
  let running = false;

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const advanced = await runAutoFulfillmentTick(prisma);
      if (advanced.length) {
        console.log(`[auto-fulfillment] advanced ${advanced.length} order(s)`);
      }
    } catch (e) {
      console.warn('[auto-fulfillment] tick failed:', e?.message || e);
    } finally {
      running = false;
    }
  };

  const first = setTimeout(tick, Number(opts.initialDelayMs || 5_000));
  const timer = setInterval(tick, Math.max(10_000, intervalMs));

  return {
    stop() {
      clearTimeout(first);
      clearInterval(timer);
    },
    tick,
  };
}

module.exports = {
  scheduleForOrder,
  startAutoFulfillment,
  targetStatusFor,
  runAutoFulfillmentTick,
};
