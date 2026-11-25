const REPORT_DAYS = new Set([7, 30]);
const EVENT_LIMIT = 50_000;

const FUNNEL_STAGES = [
  ['page_view', 'Визит'],
  ['engagement_milestone', 'Вовлечение'],
  ['product_view', 'Просмотр товара'],
  ['cart_add', 'Добавление в корзину'],
  ['checkout_start', 'Начало оформления'],
  ['payment_start', 'Начало оплаты'],
];

function parseReportDays(value) {
  const days = Number(value == null ? 7 : value);
  return REPORT_DAYS.has(days) ? days : null;
}

function objectMeta(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function safeSessionId(row) {
  const value = row?.sessionId || objectMeta(row?.meta).sessionId;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return /^[A-Za-z0-9._:-]{8,128}$/.test(trimmed) ? trimmed : null;
}

function safeLabel(value, maxLength) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().replace(/\s+/g, ' ');
  const hasControlCharacter = [...trimmed].some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  });
  if (!trimmed || trimmed.length > maxLength || hasControlCharacter) return null;
  return trimmed;
}

function safeSource(meta) {
  const data = objectMeta(meta);
  return safeLabel(data.utmSource, 80) || safeLabel(data.utm_source, 80) || 'unknown';
}

function safeSearch(meta) {
  const data = objectMeta(meta);
  const query = safeLabel(data.query, 120);
  const resultCount = Number(data.resultCount);
  return {
    query,
    resultCount: Number.isInteger(resultCount) && resultCount >= 0 && resultCount <= 1_000_000 ? resultCount : null,
  };
}

function safeErrorCode(meta) {
  const data = objectMeta(meta);
  return safeLabel(data.errorCode, 80) || safeLabel(data.code, 80) || 'unknown';
}

function increment(map, key, amount = 1) {
  map.set(key, (map.get(key) || 0) + amount);
}

function sortedCounts(map, keyName, limit = 50) {
  return [...map.entries()]
    .map(([key, count]) => ({ [keyName]: key, count }))
    .sort((a, b) => b.count - a.count || String(a[keyName]).localeCompare(String(b[keyName]), 'ru'))
    .slice(0, limit);
}

function buildAnalyticsReport({ events = [], orders = [], deliveryInvoices = [], products = [], staffUserIds = [], range, truncated = false }) {
  const staff = new Set(staffUserIds.map(Number));
  const cleanEvents = events.filter((event) => event.userId == null || !staff.has(Number(event.userId)));
  const cleanOrders = orders.filter((order) => !staff.has(Number(order.userId)) && !order.user?.staffRole);
  const cleanDeliveryInvoices = deliveryInvoices.filter((invoice) => {
    const userId = invoice.order?.userId;
    return !staff.has(Number(userId)) && !invoice.order?.user?.staffRole;
  });
  const names = new Map(products.map((product) => [Number(product.id), product.name]));

  let visits = 0;
  const visitSessions = new Set();
  let visitsWithoutSession = 0;
  const productMetrics = new Map();
  const searchRows = new Map();
  const sources = new Map();
  const sourceSessions = new Map();
  const errors = new Map();
  const eventCounts = new Map();
  const stageSessions = new Map(FUNNEL_STAGES.map(([event]) => [event, new Set()]));
  const engagementSessions = new Map([5, 15, 30, 60].map((seconds) => [seconds, new Set()]));
  const scrollSessions = new Map([25, 50, 75, 90].map((depth) => [depth, new Set()]));
  const sectionViews = new Map();
  const elementClicks = new Map();
  const bannerViews = new Map();
  const bannerClicks = new Map();
  const productCardViews = new Map();
  const productCardClicks = new Map();

  for (const row of cleanEvents) {
    const event = String(row.event || '');
    const sessionId = safeSessionId(row);
    const meta = objectMeta(row.meta);
    increment(eventCounts, event);

    if (event === 'page_view') {
      visits += 1;
      if (sessionId) visitSessions.add(sessionId);
      else visitsWithoutSession += 1;

      const source = safeSource(row.meta);
      increment(sources, source);
      if (sessionId) {
        if (!sourceSessions.has(source)) sourceSessions.set(source, new Set());
        sourceSessions.get(source).add(sessionId);
      }
    }

    if (stageSessions.has(event) && sessionId) stageSessions.get(event).add(sessionId);
    if (event === 'engagement_milestone' && engagementSessions.has(Number(meta.seconds)) && sessionId) engagementSessions.get(Number(meta.seconds)).add(sessionId);
    if (event === 'scroll_depth' && scrollSessions.has(Number(meta.percent)) && sessionId) scrollSessions.get(Number(meta.percent)).add(sessionId);
    if (event === 'section_view') increment(sectionViews, safeLabel(meta.sectionKey, 48) || 'unknown');
    if (event === 'element_click') increment(elementClicks, safeLabel(meta.elementKey, 48) || 'unknown');
    if (event === 'banner_view') increment(bannerViews, safeLabel(meta.bannerId, 32) || 'unknown');
    if (event === 'banner_click' || event === 'home_banner_click') increment(bannerClicks, safeLabel(meta.bannerId, 32) || 'unknown');
    if (event === 'product_card_view') increment(productCardViews, Number(row.productId) || 0);
    if (event === 'product_card_click') increment(productCardClicks, Number(row.productId) || 0);

    if (['product_view', 'favorite_add', 'cart_add'].includes(event) && row.productId != null && Number.isInteger(Number(row.productId)) && Number(row.productId) > 0) {
      const id = Number(row.productId);
      if (!productMetrics.has(id)) productMetrics.set(id, { productId: id, views: 0, favoriteAdds: 0, cartAdds: 0 });
      const metric = productMetrics.get(id);
      if (event === 'product_view') metric.views += 1;
      if (event === 'favorite_add') metric.favoriteAdds += 1;
      if (event === 'cart_add') metric.cartAdds += 1;
    }

    if (event === 'search') {
      const parsed = safeSearch(row.meta);
      const key = parsed.query ? parsed.query.toLocaleLowerCase('ru') : 'unknown';
      if (!searchRows.has(key)) searchRows.set(key, { query: parsed.query || 'unknown', count: 0, emptyResults: 0 });
      const item = searchRows.get(key);
      item.count += 1;
      if (parsed.resultCount === 0) item.emptyResults += 1;
    }

    if (event === 'checkout_error') increment(errors, safeErrorCode(row.meta));
  }

  const popularProducts = [...productMetrics.values()]
    .map((metric) => ({ ...metric, name: names.get(metric.productId) || `Товар #${metric.productId}` }))
    .sort((a, b) => b.views - a.views || b.cartAdds - a.cartAdds || b.favoriteAdds - a.favoriteAdds || a.productId - b.productId)
    .slice(0, 50);

  const allSearches = [...searchRows.values()];
  const searches = allSearches
    .sort((a, b) => b.count - a.count || a.query.localeCompare(b.query, 'ru'))
    .slice(0, 50);

  const sourceRows = sortedCounts(sources, 'source').map((row) => ({
    ...row,
    sessions: sourceSessions.get(row.source)?.size || 0,
  }));

  const sessionDenominator = visitSessions.size || 1;
  const behavior = {
    engagement: [5, 15, 30, 60].map((seconds) => ({ seconds, sessions: engagementSessions.get(seconds).size, rate: engagementSessions.get(seconds).size / sessionDenominator })),
    scroll: [25, 50, 75, 90].map((percent) => ({ percent, sessions: scrollSessions.get(percent).size, rate: scrollSessions.get(percent).size / sessionDenominator })),
    sections: sortedCounts(sectionViews, 'key'),
    elements: sortedCounts(elementClicks, 'key'),
    banners: [...new Set([...bannerViews.keys(), ...bannerClicks.keys()])].map((bannerId) => {
      const views = bannerViews.get(bannerId) || 0;
      const clicks = bannerClicks.get(bannerId) || 0;
      return { bannerId, views, clicks, ctr: views ? clicks / views : null };
    }).sort((a, b) => b.views - a.views || b.clicks - a.clicks),
    productCards: [...new Set([...productCardViews.keys(), ...productCardClicks.keys()])].filter(Boolean).map((productId) => ({
      productId, name: names.get(productId) || `Товар #${productId}`, views: productCardViews.get(productId) || 0, clicks: productCardClicks.get(productId) || 0,
    })).sort((a, b) => b.views - a.views || b.clicks - a.clicks).slice(0, 50),
  };

  const confirmedOrders = cleanOrders.length;
  const confirmedRevenue = cleanOrders.reduce((sum, order) => sum + Number(order.totalPrice || 0), 0);
  const confirmedDeliveryPayments = cleanDeliveryInvoices.length;
  const confirmedDeliveryRevenue = cleanDeliveryInvoices.reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0);
  const referralAttribution = new Map();
  const campaignAttribution = new Map();
  let unknownOrders = 0;
  let unknownRevenue = 0;
  for (const order of cleanOrders) {
    const tag = safeLabel(order.referralLink?.tag, 64);
    const revenue = Number(order.totalPrice || 0);
    const attribution = objectMeta(order.analyticsAttribution);
    const source = safeLabel(attribution.utm_source, 80) || 'unknown';
    const campaign = safeLabel(attribution.utm_campaign, 80) || 'unknown';
    const content = safeLabel(attribution.utm_content, 80) || 'unknown';
    const campaignKey = `${source}\u0000${campaign}\u0000${content}`;
    if (!campaignAttribution.has(campaignKey)) campaignAttribution.set(campaignKey, { source, campaign, content, orders: 0, revenue: 0 });
    campaignAttribution.get(campaignKey).orders += 1;
    campaignAttribution.get(campaignKey).revenue += revenue;
    if (!tag) {
      unknownOrders += 1;
      unknownRevenue += revenue;
      continue;
    }
    if (!referralAttribution.has(tag)) referralAttribution.set(tag, { tag, orders: 0, revenue: 0 });
    const item = referralAttribution.get(tag);
    item.orders += 1;
    item.revenue += revenue;
  }

  const funnel = FUNNEL_STAGES.map(([event, label]) => ({
    event,
    label,
    eventCount: eventCounts.get(event) || 0,
    knownSessionCohort: stageSessions.get(event).size,
  }));

  return {
    ok: true,
    range,
    traffic: {
      visits,
      uniqueKnownSessions: visitSessions.size,
      visitsWithoutSession,
    },
    products: popularProducts,
    searches,
    searchTotals: {
      events: eventCounts.get('search') || 0,
      emptyResults: allSearches.reduce((sum, item) => sum + item.emptyResults, 0),
    },
    sources: sourceRows,
    checkoutErrors: sortedCounts(errors, 'code'),
    funnel: {
      stages: funnel,
      serverOrderCreatedEvents: cleanEvents.filter((row) => row.event === 'order_created' && objectMeta(row.meta).source === 'server').length,
      serverPaymentSuccessEvents: cleanEvents.filter((row) => row.event === 'payment_success' && objectMeta(row.meta).source === 'server').length,
      confirmedOrders,
      confirmedRevenue,
      confirmedDeliveryPayments,
      confirmedDeliveryRevenue,
      totalConfirmedReceipts: confirmedRevenue + confirmedDeliveryRevenue,
    },
    paidAttribution: {
      provenReferralLinks: [...referralAttribution.values()].sort((a, b) => b.revenue - a.revenue || a.tag.localeCompare(b.tag, 'ru')),
      campaigns: [...campaignAttribution.values()].sort((a, b) => b.revenue - a.revenue || b.orders - a.orders),
      unknown: { orders: unknownOrders, revenue: unknownRevenue },
    },
    behavior,
    dataQuality: {
      eventsTruncated: Boolean(truncated),
      staffExcluded: true,
      eventLimit: EVENT_LIMIT,
    },
    definitions: {
      visits: 'Количество событий page_view.',
      uniqueSessions: 'Уникальные валидные meta.sessionId среди page_view; события без sessionId не угадываются.',
      productMetrics: 'Просмотры, добавления в избранное и корзину — отдельные события, не уникальные пользователи.',
      funnel: 'eventCount — число событий; knownSessionCohort — уникальные известные sessionId на этапе. Это не проценты конверсии.',
      finance: 'Основная выручка — Order с paymentStatus=CONFIRMED; доплаты доставки — только PAID DeliveryInvoice. Обе суммы отбираются по своему paidAt и не смешиваются.',
      attribution: 'Оплата относится к кампании только при сохранённом Order.referralLinkId; остальные оплаты показаны как unknown.',
    },
  };
}

async function loadAnalyticsReport(prisma, { days, now = new Date() }) {
  const parsedDays = parseReportDays(days);
  if (!parsedDays) {
    const error = new Error('DAYS_MUST_BE_7_OR_30');
    error.statusCode = 400;
    throw error;
  }
  const to = new Date(now);
  const from = new Date(to.getTime() - parsedDays * 24 * 60 * 60 * 1000);
  const range = { days: parsedDays, from: from.toISOString(), to: to.toISOString() };

  const [staffUsers, eventRows, orderRows, deliveryInvoiceRows] = await Promise.all([
    prisma.user.findMany({ where: { staffRole: { not: null } }, select: { id: true } }),
    prisma.analyticsEvent.findMany({
      where: { createdAt: { gte: from, lt: to } },
      select: { userId: true, event: true, productId: true, orderId: true, sessionId: true, pageViewId: true, routeKey: true, meta: true, createdAt: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: EVENT_LIMIT + 1,
    }),
    prisma.order.findMany({
      where: { paymentStatus: 'CONFIRMED', paidAt: { gte: from, lt: to } },
      select: {
        id: true,
        userId: true,
        totalPrice: true,
        paidAt: true,
        analyticsSessionId: true,
        analyticsAttribution: true,
        user: { select: { staffRole: true } },
        referralLink: { select: { tag: true } },
      },
    }),
    prisma.deliveryInvoice.findMany({
      where: { status: 'PAID', paidAt: { gte: from, lt: to } },
      select: {
        id: true,
        amount: true,
        paidAt: true,
        order: { select: { userId: true, user: { select: { staffRole: true } } } },
      },
    }),
  ]);

  const truncated = eventRows.length > EVENT_LIMIT;
  const events = eventRows.slice(0, EVENT_LIMIT);
  const productIds = [...new Set(events.map((row) => Number(row.productId)).filter(Number.isInteger))];
  const products = productIds.length
    ? await prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, name: true } })
    : [];

  return buildAnalyticsReport({
    events,
    orders: orderRows,
    deliveryInvoices: deliveryInvoiceRows,
    products,
    staffUserIds: staffUsers.map((user) => user.id),
    range,
    truncated,
  });
}

module.exports = {
  EVENT_LIMIT,
  buildAnalyticsReport,
  loadAnalyticsReport,
  parseReportDays,
};
