const test = require('node:test');
const assert = require('node:assert/strict');

const {
  EVENT_LIMIT,
  buildAnalyticsReport,
  loadAnalyticsReport,
  parseReportDays,
} = require('../services/reportAnalytics');

const range = {
  days: 7,
  from: '2026-11-11T12:00:00.000Z',
  to: '2026-11-18T12:00:00.000Z',
};

test('report keeps event counts, session cohorts and confirmed money as separate facts', () => {
  const events = [
    { userId: 1, event: 'page_view', meta: { sessionId: 'session-001', utmSource: 'telegram' } },
    { userId: 1, event: 'page_view', meta: { sessionId: 'session-001', utmSource: 'telegram' } },
    { userId: 2, event: 'page_view', meta: { utmSource: 'direct' } },
    { userId: 1, event: 'product_view', productId: 10, meta: { sessionId: 'session-001' } },
    { userId: 1, event: 'product_view', productId: 10, meta: { sessionId: 'session-001' } },
    { userId: 1, event: 'favorite_add', productId: 10, meta: { sessionId: 'session-001' } },
    { userId: 1, event: 'cart_add', productId: 10, meta: { sessionId: 'session-001' } },
    { userId: 1, event: 'cart_add', productId: null, meta: { sessionId: 'session-001' } },
    { userId: 2, event: 'checkout_start', meta: { sessionId: 'session-002' } },
    { userId: 2, event: 'payment_start', meta: { sessionId: 'session-002' } },
    { userId: 1, event: 'payment_success', meta: { source: 'client', sessionId: 'session-001' } },
    { userId: 1, event: 'payment_success', meta: { source: 'server', sessionId: 'session-001' } },
    { userId: 1, event: 'order_created', meta: { source: 'server', sessionId: 'session-001' } },
    { userId: 1, event: 'engagement_milestone', sessionId: 'session-001', meta: { seconds: 15 } },
    { userId: 1, event: 'scroll_depth', sessionId: 'session-001', meta: { percent: 50 } },
    { userId: 1, event: 'section_view', sessionId: 'session-001', meta: { sectionKey: 'hero' } },
    { userId: 1, event: 'banner_view', sessionId: 'session-001', meta: { bannerId: 'mother' } },
    { userId: 1, event: 'banner_click', sessionId: 'session-001', meta: { bannerId: 'mother' } },
    { userId: 99, event: 'page_view', meta: { sessionId: 'staff-session' } },
  ];
  const orders = [
    { userId: 1, totalPrice: 5_000, user: { staffRole: null }, referralLink: { tag: 'tg_november' }, analyticsAttribution: { utm_source: 'vk_ads', utm_campaign: '42', utm_content: '7' } },
    { userId: 2, totalPrice: 3_000, user: { staffRole: null }, referralLink: null },
    { userId: 99, totalPrice: 99_000, user: { staffRole: 'admin' }, referralLink: { tag: 'internal' } },
  ];
  const deliveryInvoices = [
    { amount: 700, order: { userId: 1, user: { staffRole: null } } },
    { amount: 900, order: { userId: 99, user: { staffRole: 'admin' } } },
  ];

  const report = buildAnalyticsReport({
    events,
    orders,
    deliveryInvoices,
    products: [{ id: 10, name: 'Пионовидные розы' }],
    staffUserIds: [99],
    range,
  });

  assert.deepEqual(report.traffic, { visits: 3, uniqueKnownSessions: 1, visitsWithoutSession: 1 });
  assert.deepEqual(report.products[0], {
    productId: 10,
    name: 'Пионовидные розы',
    views: 2,
    favoriteAdds: 1,
    cartAdds: 1,
  });
  assert.equal(report.funnel.stages.find((stage) => stage.event === 'product_view').eventCount, 2);
  assert.equal(report.funnel.stages.find((stage) => stage.event === 'product_view').knownSessionCohort, 1);
  assert.equal(report.funnel.serverPaymentSuccessEvents, 1);
  assert.equal(report.funnel.serverOrderCreatedEvents, 1);
  assert.equal(report.funnel.confirmedOrders, 2);
  assert.equal(report.funnel.confirmedRevenue, 8_000);
  assert.equal(report.funnel.confirmedDeliveryPayments, 1);
  assert.equal(report.funnel.confirmedDeliveryRevenue, 700);
  assert.equal(report.funnel.totalConfirmedReceipts, 8_700);
  assert.deepEqual(report.paidAttribution.provenReferralLinks, [{ tag: 'tg_november', orders: 1, revenue: 5_000 }]);
  assert.deepEqual(report.paidAttribution.unknown, { orders: 1, revenue: 3_000 });
  assert.equal(report.behavior.engagement.find((row) => row.seconds === 15).sessions, 1);
  assert.equal(report.behavior.scroll.find((row) => row.percent === 50).sessions, 1);
  assert.deepEqual(report.behavior.sections, [{ key: 'hero', count: 1 }]);
  assert.equal(report.behavior.banners[0].ctr, 1);
  assert.deepEqual(report.paidAttribution.campaigns[0], { source: 'vk_ads', campaign: '42', content: '7', orders: 1, revenue: 5_000 });
  assert.equal(Object.hasOwn(report.funnel, 'conversion'), false);
});

test('report uses only narrow safe meta fields and provides explicit unknown buckets', () => {
  const report = buildAnalyticsReport({
    events: [
      { event: 'page_view', meta: { sessionId: '../bad', utmSource: 'x'.repeat(81), email: 'person@example.test' } },
      { event: 'search', meta: { query: '  Белые   розы ', resultCount: 0, phone: '+79990000000' } },
      { event: 'search', meta: { query: 'белые розы', resultCount: 4 } },
      { event: 'checkout_error', meta: { errorCode: 'PAYMENT_TIMEOUT', stack: 'private stack' } },
      { event: 'checkout_error', meta: { message: 'contains PII' } },
    ],
    range,
  });

  assert.deepEqual(report.traffic, { visits: 1, uniqueKnownSessions: 0, visitsWithoutSession: 1 });
  assert.deepEqual(report.sources, [{ source: 'unknown', count: 1, sessions: 0 }]);
  assert.deepEqual(report.searches, [{ query: 'Белые розы', count: 2, emptyResults: 1 }]);
  assert.deepEqual(report.checkoutErrors, [
    { code: 'PAYMENT_TIMEOUT', count: 1 },
    { code: 'unknown', count: 1 },
  ]);
  assert.doesNotMatch(JSON.stringify(report), /person@example|79990000000|private stack|contains PII/);
});

test('journey report takes max cumulative snapshots and keeps ordered associations non-causal', () => {
  const at = (second) => new Date(`2026-11-18T10:00:${String(second).padStart(2, '0')}.000Z`);
  const common = { userId: 1, sessionId: 'session-journey', pageViewId: 'pageview-journey-1', routeKey: '/product/:id' };
  const report = buildAnalyticsReport({
    events: [
      { ...common, event: 'page_view', createdAt: at(1), meta: { sessionId: common.sessionId } },
      { ...common, event: 'page_engagement', createdAt: at(2), meta: { sessionId: common.sessionId, activeMs: 10_000, reason: 'heartbeat' } },
      { ...common, event: 'page_engagement', createdAt: at(3), meta: { sessionId: common.sessionId, activeMs: 10_000, reason: 'heartbeat' } },
      { ...common, event: 'page_engagement', createdAt: at(4), meta: { sessionId: common.sessionId, activeMs: 8_000, reason: 'heartbeat' } },
      { ...common, event: 'page_engagement', createdAt: at(5), meta: { sessionId: common.sessionId, activeMs: 15_000, reason: 'route_leave' } },
      { ...common, event: 'section_engagement', createdAt: at(6), meta: { sessionId: common.sessionId, sectionKey: 'composition', activeMs: 4_000, reason: 'heartbeat' } },
      { ...common, event: 'section_engagement', createdAt: at(7), meta: { sessionId: common.sessionId, sectionKey: 'composition', activeMs: 7_000, reason: 'route_leave' } },
      { ...common, event: 'banner_view', createdAt: at(8), meta: { sessionId: common.sessionId, bannerId: 'gift' } },
      { ...common, event: 'product_view', productId: 10, createdAt: at(9), meta: { sessionId: common.sessionId } },
      { ...common, event: 'cart_add', productId: 10, createdAt: at(10), meta: { sessionId: common.sessionId } },
      { ...common, event: 'checkout_start', createdAt: at(11), meta: { sessionId: common.sessionId } },
      { ...common, event: 'payment_start', createdAt: at(12), meta: { sessionId: common.sessionId } },
      { ...common, event: 'payment_success', createdAt: at(13), meta: { sessionId: common.sessionId, source: 'client' } },
      { ...common, event: 'payment_success', createdAt: at(14), meta: { sessionId: common.sessionId, source: 'server' } },
      { userId: 99, event: 'page_engagement', sessionId: 'staff-session', pageViewId: 'staff-view', routeKey: '/', meta: { sessionId: 'staff-session', activeMs: 99_000 } },
    ],
    staffUserIds: [99], range,
  });
  assert.deepEqual(report.journey.activeTime.routes, [{ routeKey: '/product/:id', measuredPageViews: 1, totalActiveMs: 15_000 }]);
  assert.deepEqual(report.journey.activeTime.sections, [{ routeKey: '/product/:id', sectionKey: 'composition', measuredPageViews: 1, totalActiveMs: 7_000 }]);
  assert.equal(report.journey.orderedFunnel.at(-1).knownSessionsReachedInOrder, 1);
  assert.deepEqual(report.journey.precedingAssociations, [
    { exposure: 'banner:gift', confirmedPaymentSessions: 1 },
    { exposure: 'product:10', confirmedPaymentSessions: 1 },
  ]);
  assert.deepEqual(report.dataQuality.qa, { staffEventsExcluded: 1, staffOrdersExcluded: 0 });
  assert.match(report.definitions.journey, /ассоциации/);
});

test('loader accepts only bounded 7/30 day ranges and queries confirmed paidAt orders', async () => {
  assert.equal(parseReportDays('7'), 7);
  assert.equal(parseReportDays(30), 30);
  assert.equal(parseReportDays('14'), null);

  const calls = {};
  const prisma = {
    user: { findMany: async (args) => (calls.users = args, []) },
    analyticsEvent: { findMany: async (args) => (calls.events = args, []) },
    order: { findMany: async (args) => (calls.orders = args, []) },
    deliveryInvoice: { findMany: async (args) => (calls.deliveryInvoices = args, []) },
    product: { findMany: async () => { throw new Error('no product query for empty events'); } },
  };
  const now = new Date('2026-11-18T12:00:00.000Z');
  const report = await loadAnalyticsReport(prisma, { days: 7, now });

  assert.equal(report.range.from, '2026-11-11T12:00:00.000Z');
  assert.equal(report.range.to, now.toISOString());
  assert.equal(calls.events.take, EVENT_LIMIT + 1);
  assert.equal(calls.orders.where.paymentStatus, 'CONFIRMED');
  assert.equal(calls.orders.where.paidAt.gte.toISOString(), report.range.from);
  assert.equal(calls.orders.where.paidAt.lt.toISOString(), report.range.to);
  assert.equal(calls.deliveryInvoices.where.status, 'PAID');
  assert.equal(calls.deliveryInvoices.where.paidAt.gte.toISOString(), report.range.from);
  await assert.rejects(() => loadAnalyticsReport(prisma, { days: 14, now }), /DAYS_MUST_BE_7_OR_30/);
});
