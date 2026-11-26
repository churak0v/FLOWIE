const express = require('express');
const cookie = require('cookie');
const { PrismaClient } = require('@prisma/client');
const { requireSameOrigin } = require('../middleware/auth');
const { normalizePhone } = require('../services/phoneOtp');
const { SESSION_COOKIE, createSession, revokeSession, sessionTtlMs } = require('../services/authSession');
const {
  adminCredentialsConfigured,
  createAdminLoginLimiter,
  normalizedLogin,
  passwordHash,
  validLogin,
  verifyAdminCredentials,
  verifyStoredAdminCredentials,
} = require('../services/adminCredentials');
const { loadAnalyticsReport } = require('../services/reportAnalytics');
const { assertStablePremiumPairTags } = require('../services/premiumPair');
const { BANNER_IDS, normalizeBanner } = require('../services/homeBanners');
const {
  PRODUCT_MEDIA_BRANDING_CODE,
  PRODUCT_MEDIA_BRANDING_MESSAGE,
  assertPublishableProductMedia,
  lockProductMedia,
} = require('../services/productMediaBranding');
const {
  DeliveryPaymentError,
  invoiceTtlMs,
  issueDeliveryQuote,
  publicDeliveryInvoice,
} = require('../services/deliveryPayment');

const router = express.Router();
const prisma = new PrismaClient();
const adminLoginLimiter = createAdminLoginLimiter();

function adminCookieOptions() {
  const domain = process.env.APP_COOKIE_DOMAIN;
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: Math.floor(sessionTtlMs() / 1000),
    ...(domain ? { domain } : {}),
  };
}

function setAdminSessionCookie(res, token) {
  res.setHeader('Set-Cookie', cookie.serialize(SESSION_COOKIE, token, adminCookieOptions()));
}

function clearAdminSessionCookie(res) {
  res.setHeader('Set-Cookie', cookie.serialize(SESSION_COOKIE, '', { ...adminCookieOptions(), maxAge: 0 }));
}

function orderWithPublicDelivery(order) {
  const safe = { ...order };
  delete safe.deliveryQuoteKey;
  delete safe.deliveryQuoteDigest;
  safe.deliveryInvoice = publicDeliveryInvoice(order.deliveryInvoice);
  return safe;
}

function isMerchantConfirmedOrder(order) {
  return String(order?.paymentStatus || '').toUpperCase() === 'CONFIRMED' && Boolean(order?.paidAt);
}

function isDevAdminEnabled() {
  return process.env.NODE_ENV === 'development' && process.env.DEV_ADMIN_ENABLED === 'true';
}

async function getDevAdminUser() {
  const existing = await prisma.user.findFirst({ where: { staffRole: 'admin', staffActive: true } });
  if (existing) return existing;
  return prisma.user.create({ data: { name: 'Local Dev Admin', staffRole: 'admin', staffActive: true } });
}

async function writeAudit({ actorId, action, entity, entityId, payload }) {
  try {
    await prisma.auditLog.create({
      data: {
        actorId,
        action,
        entity,
        entityId: entityId == null ? null : String(entityId),
        payload: payload == null ? undefined : payload,
      },
    });
  } catch (e) {
    // Do not block core flows due to audit failures (MVP).
    console.error('AuditLog failed:', e);
  }
}

router.post('/login', requireSameOrigin, async (req, res) => {
  const login = normalizedLogin(req.body?.login);
  const attemptKey = `${req.ip || req.socket?.remoteAddress || 'unknown'}:${login}`;
  const limit = adminLoginLimiter.consume(attemptKey);
  if (!limit.allowed) {
    res.setHeader('Retry-After', String(limit.retryAfter));
    return res.status(429).json({ ok: false, error: 'ADMIN_LOGIN_RATE_LIMITED', retryAfter: limit.retryAfter });
  }
  try {
    let user = await verifyStoredAdminCredentials({ prisma, login, password: req.body?.password });
    if (!user) {
      const legacyValid = verifyAdminCredentials({
        login,
        password: req.body?.password,
        expectedLogin: process.env.ADMIN_LOGIN,
        encodedPasswordHash: process.env.ADMIN_PASSWORD_HASH,
      });
      if (!legacyValid) {
        const error = adminCredentialsConfigured() ? 'INVALID_ADMIN_CREDENTIALS' : 'ADMIN_LOGIN_NOT_CONFIGURED';
        return res.status(error === 'ADMIN_LOGIN_NOT_CONFIGURED' ? 503 : 401).json({ ok: false, error });
      }
      user = await prisma.user.findFirst({
        where: { staffRole: 'admin', staffActive: true },
        orderBy: { id: 'asc' },
      });
      if (!user) {
        user = await prisma.user.create({
          data: {
            name: String(process.env.ADMIN_DISPLAY_NAME || 'Администратор').trim().slice(0, 100) || 'Администратор',
            staffRole: 'admin',
            staffActive: true,
          },
        });
      }
    }
    if (req.authSession?.id) await revokeSession(prisma, req.authSession.id);
    const { token } = await createSession(prisma, user.id, req);
    setAdminSessionCookie(res, token);
    adminLoginLimiter.reset(attemptKey);
    await writeAudit({
      actorId: user.id,
      action: 'ADMIN_PASSWORD_LOGIN',
      entity: 'user',
      entityId: user.id,
      payload: null,
    });
    return res.json({
      ok: true,
      user: { id: user.id, phone: user.verifiedPhone || user.phone || null, name: user.name, role: user.staffRole },
    });
  } catch (error) {
    console.error('[admin] password login failed', { ip: req.ip, error: error?.message });
    return res.status(500).json({ ok: false, error: 'ADMIN_LOGIN_FAILED' });
  }
});

router.post('/logout', requireSameOrigin, async (req, res) => {
  if (req.authSession?.id) await revokeSession(prisma, req.authSession.id);
  clearAdminSessionCookie(res);
  return res.json({ ok: true });
});

async function requireAdmin(req, res, next) {
  try {
    const hasCookieUser = Boolean(req.user?.id);
    try {
      console.info('[admin] incoming', {
        path: req.originalUrl,
        method: req.method,
        hasCookieUser,
        ip: req.ip,
      });
    } catch {
      // ignore logging failures
    }

    let user = null;
    if (isDevAdminEnabled()) {
      user = await getDevAdminUser();
    } else if (req.user?.id) {
      user = await prisma.user.findUnique({ where: { id: req.user.id } });
    }

    if (!user) return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });

    if (!user.staffRole || !user.staffActive) {
      console.warn('[admin] forbidden (no staff role)', { userId: user.id, role: user.staffRole, active: user.staffActive });
      return res.status(403).json({ ok: false, error: 'FORBIDDEN' });
    }

    req.admin = {
      id: user.id,
      phone: user.verifiedPhone || user.phone || null,
      name: user.name,
      role: user.staffRole,
    };

    return next();
  } catch (e) {
    try {
      console.error('[admin] requireAdmin failed', { path: req.originalUrl, method: req.method, ip: req.ip, error: e?.message });
    } catch {
      // ignore
    }
    return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });
  }
}

function requireRoles(roles) {
  const allow = new Set(roles || []);
  return (req, res, next) => {
    if (!req.admin?.role || !allow.has(req.admin.role)) {
      return res.status(403).json({ ok: false, error: 'FORBIDDEN' });
    }
    return next();
  };
}

router.get('/me', requireAdmin, async (req, res) => {
  return res.json({ ok: true, user: req.admin });
});

function asInt(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

function slugify(value) {
  const s = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9а-яё]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');
  return s || '';
}

function normalizeOrderStatus(s) {
  const v = String(s || '').toUpperCase();
  if (v === 'NEW') return 'NEW';
  if (v === 'PAID') return 'NEW';
  if (v === 'PAYMENT_PENDING') return 'NEW';
  if (v === 'DELIVERY') return 'IN_DELIVERY';
  if (v === 'COMPLETED') return 'DELIVERED';
  if (v === 'CANCELLED') return 'CANCELLED';
  if (v === 'ACCEPTED') return 'ACCEPTED';
  if (v === 'ASSEMBLED') return 'ASSEMBLED';
  if (v === 'IN_DELIVERY') return 'IN_DELIVERY';
  if (v === 'DELIVERED') return 'DELIVERED';
  return v || 'NEW';
}

function canAccessOrder(admin, order) {
  if (!admin || !order) return false;
  return admin.role !== 'courier' || Number(order.courierId) === Number(admin.id);
}

function deliveryDispatchError(order) {
  const status = String(order?.deliveryStatus || '').toUpperCase();
  if (!['PAID', 'WAIVED', 'INCLUDED_IN_MAIN', 'NOT_REQUIRED'].includes(status)) return 'DELIVERY_PAYMENT_REQUIRED';
  if (status !== 'NOT_REQUIRED' && !String(order?.deliveryAddress || '').trim()) return 'DELIVERY_DETAILS_REQUIRED';
  if (status !== 'NOT_REQUIRED' && order?.askRecipientTime && !String(order?.deliveryTime || '').trim()) {
    return 'DELIVERY_DETAILS_REQUIRED';
  }
  return null;
}

function isAllowedTransition(currentStatus, nextStatus) {
  const current = normalizeOrderStatus(currentStatus);
  const next = normalizeOrderStatus(nextStatus);
  const allowed = {
    NEW: new Set(['ACCEPTED', 'CANCELLED']),
    ACCEPTED: new Set(['ASSEMBLED', 'CANCELLED']),
    ASSEMBLED: new Set(['IN_DELIVERY', 'CANCELLED']),
    IN_DELIVERY: new Set(['DELIVERED', 'CANCELLED']),
  };
  return Boolean(allowed[current]?.has(next));
}

const PRODUCT_INCLUDE = {
  images: { orderBy: [{ sort: 'asc' }, { createdAt: 'asc' }] },
  composition: { orderBy: [{ sort: 'asc' }, { createdAt: 'asc' }] },
  collectionItems: {
    include: { collection: true },
    orderBy: [{ collectionId: 'asc' }, { sort: 'asc' }, { id: 'asc' }],
  },
};

// Products
router.get('/products', requireAdmin, requireRoles(['admin', 'moderator']), async (req, res) => {
  try {
    const kindRaw = String(req.query?.kind || 'all').toLowerCase();
    const kind = ['all', 'main', 'upsell'].includes(kindRaw) ? kindRaw : 'all';
    const where = {};
    if (kind === 'main') where.isUpsell = false;
    if (kind === 'upsell') where.isUpsell = true;

	    const products = await prisma.product.findMany({
	      where,
	      include: PRODUCT_INCLUDE,
	      orderBy:
	        kind === 'upsell'
	          ? [{ upsellSort: 'asc' }, { updatedAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }]
	          : kind === 'main'
	            ? [{ sort: 'asc' }, { updatedAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }]
	            : [
	                { isUpsell: 'asc' },
	                { sort: 'asc' },
	                { upsellSort: 'asc' },
	                { updatedAt: 'desc' },
	                { createdAt: 'desc' },
	                { id: 'desc' },
	              ],
	    });
	    return res.json({ ok: true, products });
	  } catch (e) {
	    return res.status(500).json({ ok: false, error: e?.message || 'PRODUCTS_FAILED' });
	  }
});

router.get('/products/:id', requireAdmin, requireRoles(['admin', 'moderator']), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: 'BAD_ID' });

    const product = await prisma.product.findUnique({
      where: { id },
      include: PRODUCT_INCLUDE,
    });
    if (!product) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });

    return res.json({ ok: true, product });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || 'PRODUCT_FAILED' });
  }
});

router.post('/products', requireAdmin, requireRoles(['admin', 'moderator']), async (req, res) => {
  try {
    const body = req.body || {};
    const name = String(body.name || '').trim();
	    const price = asInt(body.price);
	    const discount = Math.max(0, asInt(body.discount) || 0);
	    const image = String(body.image || '').trim();
	    const isActive = body.isActive == null ? true : Boolean(body.isActive);
	    const isUpsell = Boolean(body.isUpsell);
	    const upsellSort = Math.max(0, asInt(body.upsellSort) || 0);
	    let sort = body.sort == null ? null : Math.max(0, asInt(body.sort) || 0);

    if (!name || !Number.isFinite(price) || price <= 0 || !image) {
      return res.status(400).json({ ok: false, error: 'name, price, image are required' });
    }

    const width = body.width == null || body.width === '' ? null : asInt(body.width);
    const height = body.height == null || body.height === '' ? null : asInt(body.height);
    const color = body.color == null || body.color === '' ? null : String(body.color);

    const compositionItems = Array.isArray(body.compositionItems) ? body.compositionItems : [];
    const images = Array.isArray(body.images) ? body.images : [];
    const collectionIdsRaw = Array.isArray(body.collectionIds) ? body.collectionIds : [];
    const collectionIds = collectionIdsRaw.map(asInt).filter((x) => Number.isFinite(x));

    assertPublishableProductMedia({ isActive, image, images });

	    try {
	      console.info('[admin] create product', {
	        adminId: req.admin?.id,
	        name,
	        images: images.length,
	        collections: collectionIds.length,
	        composition: compositionItems.length,
	      });
	    } catch {
	      // ignore logging failures
	    }

	    if (!isUpsell && sort == null) {
	      const last = await prisma.product.findFirst({
	        where: { isUpsell: false },
	        orderBy: [{ sort: 'desc' }, { id: 'desc' }],
	      });
	      sort = Number(last?.sort || 0) + 1;
	    }

	    let product = await prisma.product.create({
	      data: {
	        name,
	        price,
	        discount,
	        image,
	        isUpsell,
	        upsellSort,
	        sort: sort == null ? 0 : sort,
	        description: body.description ? String(body.description) : null,
	        tags: body.tags ? String(body.tags) : '',
	        deliveryTime: body.deliveryTime ? String(body.deliveryTime) : null,
	        color,
        width,
        height,
        isActive,
        images: {
          create: images.map((url, idx) => ({ url: String(url), sort: idx + 1 })),
        },
        composition: {
          create: compositionItems
            .map((it, idx) => ({
              name: String(it?.name || '').trim(),
              quantity: String(it?.quantity || '').trim(),
              sort: idx + 1,
            }))
            .filter((it) => it.name && it.quantity),
        },
      },
      include: PRODUCT_INCLUDE,
    });

    if (collectionIds.length) {
      await prisma.$transaction(async (tx) => {
        for (const collectionId of collectionIds) {
          const last = await tx.collectionItem.findFirst({
            where: { collectionId },
            orderBy: [{ sort: 'desc' }, { id: 'desc' }],
          });
          const sort = Number(last?.sort || 0) + 1;
          await tx.collectionItem.upsert({
            where: { collectionId_productId: { collectionId, productId: product.id } },
            update: { sort },
            create: { collectionId, productId: product.id, sort },
          });
        }
      });

      product = await prisma.product.findUnique({ where: { id: product.id }, include: PRODUCT_INCLUDE });
    }

    await writeAudit({
      actorId: req.admin.id,
      action: 'PRODUCT_CREATED',
      entity: 'product',
      entityId: product.id,
      payload: { name: product.name, price: product.price, isActive: product.isActive },
    });

	    return res.json({ ok: true, product });
	  } catch (e) {
	    if (e?.code === PRODUCT_MEDIA_BRANDING_CODE) return res.status(422).json({ ok: false, error: PRODUCT_MEDIA_BRANDING_CODE, message: PRODUCT_MEDIA_BRANDING_MESSAGE });
	    return res.status(500).json({ ok: false, error: e?.message || 'PRODUCT_CREATE_FAILED' });
	  }
	});

	router.patch('/products/reorder', requireAdmin, requireRoles(['admin', 'moderator']), async (req, res) => {
	  try {
	    const kindRaw = String(req.body?.kind || '').toLowerCase();
	    const kind = kindRaw === 'upsell' ? 'upsell' : kindRaw === 'main' ? 'main' : null;
	    if (!kind) return res.status(400).json({ ok: false, error: 'BAD_KIND' });

	    const productIdsRaw = Array.isArray(req.body?.productIds) ? req.body.productIds : null;
	    if (!productIdsRaw?.length) return res.status(400).json({ ok: false, error: 'NO_PRODUCT_IDS' });

	    const productIds = productIdsRaw.map(asInt).filter((x) => Number.isFinite(x));
	    if (productIds.length !== productIdsRaw.length) return res.status(400).json({ ok: false, error: 'BAD_PRODUCT_IDS' });

	    const seen = new Set();
	    for (const id of productIds) {
	      if (seen.has(id)) return res.status(400).json({ ok: false, error: 'DUP_PRODUCT_IDS' });
	      seen.add(id);
	    }

	    // Ensure all products exist and match kind.
	    const products = await prisma.product.findMany({
	      where: {
	        id: { in: productIds },
	        isUpsell: kind === 'upsell',
	      },
	      select: { id: true },
	    });
	    if (products.length !== productIds.length) return res.status(400).json({ ok: false, error: 'PRODUCT_NOT_FOUND' });

	    await prisma.$transaction(
	      productIds.map((id, idx) =>
	        prisma.product.update({
	          where: { id },
	          data: kind === 'upsell' ? { upsellSort: idx + 1 } : { sort: idx + 1 },
	        }),
	      ),
	    );

	    await writeAudit({
	      actorId: req.admin.id,
	      action: 'PRODUCTS_REORDERED',
	      entity: 'product',
	      entityId: null,
	      payload: { kind, productIds },
	    });

	    return res.json({ ok: true });
	  } catch (e) {
	    return res.status(500).json({ ok: false, error: e?.message || 'REORDER_FAILED' });
	  }
	});

router.patch('/products/:id', requireAdmin, requireRoles(['admin', 'moderator']), async (req, res) => {
	  try {
	    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: 'BAD_ID' });

    const patch = req.body || {};
    const data = {};

    if (patch.name != null) data.name = String(patch.name);
    if (patch.price != null) data.price = Number(patch.price);
    if (patch.discount != null) data.discount = Math.max(0, asInt(patch.discount) || 0);
    if (patch.image != null) data.image = String(patch.image);
    if (patch.description != null) data.description = patch.description ? String(patch.description) : null;
    if (patch.tags != null) data.tags = String(patch.tags);
    if (patch.deliveryTime != null) data.deliveryTime = patch.deliveryTime ? String(patch.deliveryTime) : null;
    if (patch.color !== undefined) data.color = patch.color ? String(patch.color) : null;
    if (patch.width !== undefined) data.width = patch.width == null || patch.width === '' ? null : asInt(patch.width);
    if (patch.height !== undefined) data.height = patch.height == null || patch.height === '' ? null : asInt(patch.height);
	    if (patch.isActive != null) data.isActive = Boolean(patch.isActive);
	    if (patch.isUpsell != null) data.isUpsell = Boolean(patch.isUpsell);
	    if (patch.upsellSort != null) data.upsellSort = Math.max(0, asInt(patch.upsellSort) || 0);
	    if (patch.sort != null) data.sort = Math.max(0, asInt(patch.sort) || 0);

    const compositionItems = Array.isArray(patch.compositionItems) ? patch.compositionItems : null;
    const collectionIdsRaw = Array.isArray(patch.collectionIds) ? patch.collectionIds : null;
    const collectionIds = collectionIdsRaw ? collectionIdsRaw.map(asInt).filter((x) => Number.isFinite(x)) : null;
  const images = Array.isArray(patch.images) ? patch.images.map((u) => String(u || '').trim()).filter(Boolean) : null;

    try {
      console.info('[admin] update product', {
        productId: id,
        adminId: req.admin?.id,
        hasImages: images ? images.length : null,
        hasComposition: Array.isArray(compositionItems) ? compositionItems.length : null,
      });
    } catch {
      // ignore
    }

    const product = await prisma.$transaction(async (tx) => {
      await lockProductMedia(tx, id);
      const current = await tx.product.findUnique({
        where: { id },
        select: { image: true, isActive: true, tags: true, images: { select: { url: true } } },
      });
      if (!current) return null;
      assertStablePremiumPairTags(current.tags, data.tags);
      assertPublishableProductMedia({
        isActive: data.isActive ?? current.isActive,
        image: data.image ?? current.image,
        images: images ?? current.images,
      });

      await tx.product.update({
        where: { id },
        data,
        include: PRODUCT_INCLUDE,
      });

      if (images) {
        await tx.productImage.deleteMany({ where: { productId: id } });
        if (images.length) {
          await tx.productImage.createMany({
            data: images.map((url, idx) => ({ productId: id, url, sort: idx + 1 })),
          });
        }
      }

      if (compositionItems) {
        await tx.productCompositionItem.deleteMany({ where: { productId: id } });
        const rows = compositionItems
          .map((it, idx) => ({
            productId: id,
            name: String(it?.name || '').trim(),
            quantity: String(it?.quantity || '').trim(),
            sort: idx + 1,
          }))
          .filter((it) => it.name && it.quantity);
        if (rows.length) await tx.productCompositionItem.createMany({ data: rows });
      }

      if (collectionIds) {
        const existing = await tx.collectionItem.findMany({ where: { productId: id } });
        const existingIds = new Set(existing.map((x) => x.collectionId));

        // remove
        await tx.collectionItem.deleteMany({
          where: {
            productId: id,
            collectionId: { notIn: collectionIds },
          },
        });

        // add new at end
        for (const collectionId of collectionIds) {
          if (existingIds.has(collectionId)) continue;
          const last = await tx.collectionItem.findFirst({
            where: { collectionId },
            orderBy: [{ sort: 'desc' }, { id: 'desc' }],
          });
          const sort = Number(last?.sort || 0) + 1;
          await tx.collectionItem.create({ data: { collectionId, productId: id, sort } });
        }

        // keep existing sorts unchanged
      }

      return tx.product.findUnique({ where: { id }, include: PRODUCT_INCLUDE });
    });

    if (!product) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });

    await writeAudit({
      actorId: req.admin.id,
      action: 'PRODUCT_UPDATED',
      entity: 'product',
      entityId: product.id,
      payload: { patch: { ...data, images: images ?? undefined } },
    });

    return res.json({ ok: true, product });
  } catch (e) {
    if (e?.code === PRODUCT_MEDIA_BRANDING_CODE) return res.status(422).json({ ok: false, error: PRODUCT_MEDIA_BRANDING_CODE, message: PRODUCT_MEDIA_BRANDING_MESSAGE });
    if (e?.code === 'PREMIUM_PAIR_TAG_IMMUTABLE') return res.status(409).json({ ok: false, error: e.code, message: e.message });
    return res.status(500).json({ ok: false, error: e?.message || 'PRODUCT_UPDATE_FAILED' });
  }
});

router.delete('/products/:id', requireAdmin, requireRoles(['admin', 'moderator']), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: 'BAD_ID' });

    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });

    const linked = await prisma.orderItem.count({ where: { productId: id } });
    if (linked > 0) return res.status(409).json({ ok: false, error: 'PRODUCT_HAS_ORDERS' });

    await prisma.product.delete({ where: { id } });

    await writeAudit({
      actorId: req.admin.id,
      action: 'PRODUCT_DELETED',
      entity: 'product',
      entityId: id,
      payload: { name: product.name, price: product.price, isActive: product.isActive },
    });

    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || 'PRODUCT_DELETE_FAILED' });
  }
});

router.post('/products/:id/images', requireAdmin, requireRoles(['admin', 'moderator']), async (req, res) => {
  try {
    const productId = Number(req.params.id);
    if (!Number.isFinite(productId)) return res.status(400).json({ ok: false, error: 'BAD_ID' });

    const url = String(req.body?.url || '').trim();
    if (!url) return res.status(400).json({ ok: false, error: 'NO_URL' });

    try {
      console.info('[admin] add product image', { productId, url, adminId: req.admin?.id, ip: req.ip });
    } catch {
      // ignore logging errors
    }

    const image = await prisma.$transaction(async (tx) => {
      await lockProductMedia(tx, productId);
      const product = await tx.product.findUnique({
        where: { id: productId },
        select: { image: true, isActive: true, images: { select: { url: true } } },
      });
      if (!product) return null;
      assertPublishableProductMedia({ isActive: product.isActive, image: product.image, images: [...product.images, url] });
      const last = await tx.productImage.findFirst({
        where: { productId },
        orderBy: [{ sort: 'desc' }, { createdAt: 'desc' }],
      });
      const sort = Number(last?.sort || 0) + 1;
      return tx.productImage.create({
        data: { productId, url, sort },
      });
    });
    if (!image) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });

    await writeAudit({
      actorId: req.admin.id,
      action: 'PRODUCT_IMAGE_ADDED',
      entity: 'product',
      entityId: productId,
      payload: { imageId: image.id, url },
    });

    return res.json({ ok: true, image });
  } catch (e) {
    if (e?.code === PRODUCT_MEDIA_BRANDING_CODE) return res.status(422).json({ ok: false, error: PRODUCT_MEDIA_BRANDING_CODE, message: PRODUCT_MEDIA_BRANDING_MESSAGE });
    return res.status(500).json({ ok: false, error: e?.message || 'IMAGE_ADD_FAILED' });
  }
});

router.patch('/products/:id/images/reorder', requireAdmin, requireRoles(['admin', 'moderator']), async (req, res) => {
  try {
    const productId = Number(req.params.id);
    if (!Number.isFinite(productId)) return res.status(400).json({ ok: false, error: 'BAD_ID' });

    const imageIds = Array.isArray(req.body?.imageIds) ? req.body.imageIds : null;
    if (!imageIds?.length) return res.status(400).json({ ok: false, error: 'NO_IMAGE_IDS' });

    try {
      console.info('[admin] reorder product images', { productId, imageIds, adminId: req.admin?.id, ip: req.ip });
    } catch {
      // ignore
    }

    // Ensure all images belong to this product.
    const imgs = await prisma.productImage.findMany({ where: { productId } });
    const allowed = new Set(imgs.map((i) => i.id));
    for (const id of imageIds) {
      if (!allowed.has(Number(id))) return res.status(400).json({ ok: false, error: 'IMAGE_NOT_IN_PRODUCT' });
    }

    await prisma.$transaction(
      imageIds.map((id, idx) =>
        prisma.productImage.update({
          where: { id: Number(id) },
          data: { sort: idx + 1 },
        }),
      ),
    );

    await writeAudit({
      actorId: req.admin.id,
      action: 'PRODUCT_IMAGES_REORDERED',
      entity: 'product',
      entityId: productId,
      payload: { imageIds: imageIds.map((x) => Number(x)) },
    });

    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || 'REORDER_FAILED' });
  }
});

// Collections (aka "Подборки" / Scenarios)
router.get('/collections', requireAdmin, requireRoles(['admin', 'moderator']), async (req, res) => {
  try {
    const collections = await prisma.collection.findMany({
      include: {
        items: {
          orderBy: [{ sort: 'asc' }, { id: 'asc' }],
          include: { product: true },
        },
      },
      orderBy: [{ sort: 'asc' }, { updatedAt: 'desc' }, { id: 'desc' }],
    });
    return res.json({ ok: true, collections });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || 'COLLECTIONS_FAILED' });
  }
});

router.get('/collections/:id', requireAdmin, requireRoles(['admin', 'moderator']), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: 'BAD_ID' });

    const collection = await prisma.collection.findUnique({
      where: { id },
      include: {
        items: {
          orderBy: [{ sort: 'asc' }, { id: 'asc' }],
          include: { product: true },
        },
      },
    });
    if (!collection) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });

    return res.json({ ok: true, collection });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || 'COLLECTION_FAILED' });
  }
});

router.post('/collections', requireAdmin, requireRoles(['admin', 'moderator']), async (req, res) => {
  try {
    const title = String(req.body?.title || '').trim();
    const type = String(req.body?.type || 'thematic');
    const slugRaw = req.body?.slug != null ? String(req.body.slug) : '';
    const slug = slugify(slugRaw || title);
    const description = req.body?.description ? String(req.body.description) : null;
    const isActive = req.body?.isActive == null ? true : Boolean(req.body.isActive);

    if (!title) return res.status(400).json({ ok: false, error: 'TITLE_REQUIRED' });
    if (!slug) return res.status(400).json({ ok: false, error: 'SLUG_REQUIRED' });
    if (!['thematic', 'scenario'].includes(type)) return res.status(400).json({ ok: false, error: 'BAD_TYPE' });

    const last = await prisma.collection.findFirst({
      orderBy: [{ sort: 'desc' }, { id: 'desc' }],
    });
    const sort = Number(last?.sort || 0) + 1;

    const collection = await prisma.collection.create({
      data: { title, type, slug, description, isActive, sort },
      include: { items: { orderBy: [{ sort: 'asc' }, { id: 'asc' }], include: { product: true } } },
    });

    await writeAudit({
      actorId: req.admin.id,
      action: 'COLLECTION_CREATED',
      entity: 'collection',
      entityId: collection.id,
      payload: { title: collection.title, type: collection.type, isActive: collection.isActive },
    });

    return res.json({ ok: true, collection });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || 'COLLECTION_CREATE_FAILED' });
  }
});

router.patch('/collections/:id', requireAdmin, requireRoles(['admin', 'moderator']), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: 'BAD_ID' });

    const patch = req.body || {};
    const data = {};
    if (patch.title != null) data.title = String(patch.title);
    if (patch.slug != null) data.slug = slugify(String(patch.slug));
    if (patch.type != null) {
      const type = String(patch.type);
      if (!['thematic', 'scenario'].includes(type)) return res.status(400).json({ ok: false, error: 'BAD_TYPE' });
      data.type = type;
    }
    if (patch.description !== undefined) data.description = patch.description ? String(patch.description) : null;
    if (patch.isActive != null) data.isActive = Boolean(patch.isActive);
    if (patch.sort != null) data.sort = asInt(patch.sort) || 0;

    const collection = await prisma.collection.update({
      where: { id },
      data,
      include: { items: { orderBy: [{ sort: 'asc' }, { id: 'asc' }], include: { product: true } } },
    });

    await writeAudit({
      actorId: req.admin.id,
      action: 'COLLECTION_UPDATED',
      entity: 'collection',
      entityId: collection.id,
      payload: { patch: data },
    });

    return res.json({ ok: true, collection });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || 'COLLECTION_UPDATE_FAILED' });
  }
});

router.patch('/collections/:id/items', requireAdmin, requireRoles(['admin', 'moderator']), async (req, res) => {
  try {
    const collectionId = Number(req.params.id);
    if (!Number.isFinite(collectionId)) return res.status(400).json({ ok: false, error: 'BAD_ID' });

    const productIds = Array.isArray(req.body?.productIds) ? req.body.productIds : null;
    if (!productIds) return res.status(400).json({ ok: false, error: 'NO_PRODUCT_IDS' });

    const ids = productIds.map(asInt).filter((x) => Number.isFinite(x));

    await prisma.$transaction(async (tx) => {
      await tx.collectionItem.deleteMany({ where: { collectionId } });
      if (ids.length) {
        await tx.collectionItem.createMany({
          data: ids.map((productId, idx) => ({ collectionId, productId, sort: idx + 1 })),
          skipDuplicates: true,
        });
      }
    });

    await writeAudit({
      actorId: req.admin.id,
      action: 'COLLECTION_ITEMS_SET',
      entity: 'collection',
      entityId: collectionId,
      payload: { productIds: ids },
    });

    const collection = await prisma.collection.findUnique({
      where: { id: collectionId },
      include: { items: { orderBy: [{ sort: 'asc' }, { id: 'asc' }], include: { product: true } } },
    });
    return res.json({ ok: true, collection });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || 'COLLECTION_ITEMS_FAILED' });
  }
});

// Orders
async function expireStaleOrders() {
  try {
    const now = new Date();
    await prisma.order.updateMany({
      where: {
        paymentStatus: 'PENDING',
        paymentExpiresAt: { lt: now },
      },
      data: {
        status: 'CANCELLED',
        paymentStatus: 'EXPIRED',
      },
    });
  } catch {
    // ignore
  }
}

router.get('/orders', requireAdmin, requireRoles(['admin', 'moderator', 'florist', 'courier']), async (req, res) => {
  try {
    const { status, date } = req.query;
    const where = {};

    await expireStaleOrders();

    if (status) where.status = String(status);
    if (req.admin.role === 'courier') where.courierId = req.admin.id;

    if (date === 'today' || date === 'tomorrow') {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      if (date === 'tomorrow') d.setDate(d.getDate() + 1);
      const start = new Date(d);
      const end = new Date(d);
      end.setDate(end.getDate() + 1);
      where.createdAt = { gte: start, lt: end };
    }

    const orders = await prisma.order.findMany({
      where: {
        ...where,
        // The operational queue starts only after the acquiring bank confirms capture.
        paymentStatus: 'CONFIRMED',
        paidAt: { not: null },
      },
      include: { items: { include: { product: true } }, user: true, deliveryInvoice: true },
      orderBy: { createdAt: 'desc' },
    });

    return res.json({
      ok: true,
      orders: orders.map(orderWithPublicDelivery),
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || 'ORDERS_FAILED' });
  }
});

router.get('/orders/:id', requireAdmin, requireRoles(['admin', 'moderator', 'florist', 'courier']), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: 'BAD_ID' });

    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        items: { include: { product: true } },
        user: true,
        photos: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
        statusHistory: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] },
        promoCodes: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] },
        chats: { orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }] },
        deliveryInvoice: true,
      },
    });
    if (!order || !isMerchantConfirmedOrder(order)) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
    if (!canAccessOrder(req.admin, order)) return res.status(403).json({ ok: false, error: 'FORBIDDEN' });

    return res.json({ ok: true, order: orderWithPublicDelivery(order) });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || 'ORDER_FAILED' });
  }
});

router.post('/orders/:id/delivery-quote', requireAdmin, requireRoles(['admin', 'moderator', 'florist']), async (req, res) => {
  try {
    const result = await issueDeliveryQuote({
      prisma,
      orderId: req.params.id,
      staffUserId: req.admin.id,
      body: req.body,
    });
    return res.status(result.replayed ? 200 : 201).json({
      ok: true,
      replayed: result.replayed,
      order: {
        id: result.order.id,
        deliveryAddress: result.order.deliveryAddress,
        deliveryTime: result.order.deliveryTime,
        deliveryCost: result.order.deliveryCost,
        deliveryStatus: result.order.deliveryStatus,
      },
      invoice: publicDeliveryInvoice(result.invoice),
    });
  } catch (error) {
    if (error instanceof DeliveryPaymentError) {
      return res.status(error.status).json({ ok: false, error: error.code });
    }
    return res.status(500).json({ ok: false, error: 'DELIVERY_QUOTE_FAILED' });
  }
});

router.post('/orders/:id/manual-surcharge', requireAdmin, requireRoles(['admin', 'moderator']), async (req, res) => {
  try {
    const orderId = Number(req.params.id);
    const amount = Number(req.body?.amount);
    const reason = String(req.body?.reason || '').trim();
    if (!Number.isSafeInteger(orderId) || orderId <= 0) return res.status(400).json({ ok: false, error: 'BAD_ID' });
    if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 100000) return res.status(400).json({ ok: false, error: 'BAD_SURCHARGE_AMOUNT' });
    if (reason.length < 3 || reason.length > 200) return res.status(400).json({ ok: false, error: 'BAD_SURCHARGE_REASON' });

    const invoice = await prisma.$transaction(async (tx) => {
      await tx.$queryRawUnsafe('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))::text AS lock', `manual-surcharge:${orderId}`);
      const order = await tx.order.findUnique({ where: { id: orderId }, include: { deliveryInvoice: true } });
      if (!order) throw Object.assign(new Error('NOT_FOUND'), { statusCode: 404 });
      if (String(order.paymentStatus || '').toUpperCase() !== 'CONFIRMED') throw Object.assign(new Error('MAIN_PAYMENT_REQUIRED'), { statusCode: 409 });
      if (!order.deliveryQuoteKey) throw Object.assign(new Error('DELIVERY_DETAILS_REQUIRED'), { statusCode: 409 });

      const existing = order.deliveryInvoice;
      if (existing) {
        if (existing.status !== 'PAYMENT_PENDING' || existing.paymentChargeId) {
          throw Object.assign(new Error('SURCHARGE_INVOICE_LOCKED'), { statusCode: 409 });
        }
        let meta = {};
        try { meta = existing.paymentMeta ? JSON.parse(existing.paymentMeta) : {}; } catch {}
        const manual = Array.isArray(meta.manualSurcharges) ? meta.manualSurcharges : [];
        return tx.deliveryInvoice.update({
          where: { id: existing.id },
          data: {
            amount: existing.amount + amount,
            paymentMeta: JSON.stringify({ ...meta, manualSurcharges: [...manual, { amount, reason, createdAt: new Date().toISOString(), createdById: req.admin.id }] }),
          },
        });
      }
      return tx.deliveryInvoice.create({
        data: {
          orderId,
          amount,
          currency: '643',
          status: 'PAYMENT_PENDING',
          paymentExpiresAt: new Date(Date.now() + invoiceTtlMs()),
          paymentMeta: JSON.stringify({ manualSurcharges: [{ amount, reason, createdAt: new Date().toISOString(), createdById: req.admin.id }] }),
        },
      });
    });
    return res.status(201).json({ ok: true, invoice: publicDeliveryInvoice(invoice) });
  } catch (error) {
    return res.status(error?.statusCode || 500).json({ ok: false, error: error?.message || 'SURCHARGE_FAILED' });
  }
});

router.post('/orders/:id/confirm-payment', requireAdmin, requireRoles(['admin', 'moderator']), async (req, res) => {
  return res.status(410).json({ ok: false, error: 'MANUAL_PAYMENT_CONFIRMATION_DISABLED' });
});

async function setOrderStatus(req, res, nextStatus) {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: 'BAD_ID' });

    const order = await prisma.$transaction(async (tx) => {
      const current = await tx.order.findUnique({ where: { id } });
      if (!current) {
        const error = new Error('NOT_FOUND');
        error.statusCode = 404;
        throw error;
      }
      if (!canAccessOrder(req.admin, current)) {
        const error = new Error('FORBIDDEN');
        error.statusCode = 403;
        throw error;
      }
      if (!isAllowedTransition(current.status, nextStatus)) {
        const error = new Error('INVALID_STATUS_TRANSITION');
        error.statusCode = 409;
        throw error;
      }
      if (nextStatus === 'ACCEPTED' && String(current.paymentStatus || '').toUpperCase() !== 'CONFIRMED') {
        const error = new Error('PAYMENT_NOT_CONFIRMED');
        error.statusCode = 409;
        throw error;
      }

      let courierId;
      if (nextStatus === 'IN_DELIVERY') {
        const deliveryError = deliveryDispatchError(current);
        if (deliveryError) {
          const error = new Error(deliveryError);
          error.statusCode = 409;
          throw error;
        }
        const requestedCourierId = req.body?.courierId;
        courierId = Number(requestedCourierId || req.admin.id);
        if (requestedCourierId != null) {
          const courier = await tx.user.findFirst({ where: { id: courierId, staffRole: 'courier', staffActive: true } });
          if (!courier) {
            const error = new Error('COURIER_NOT_FOUND');
            error.statusCode = 404;
            throw error;
          }
        }
      }
      const changed = await tx.order.updateMany({
        where: { id, status: current.status },
        data: {
          status: nextStatus,
          courierId,
          deliveredAt: nextStatus === 'DELIVERED' ? new Date() : undefined,
        },
      });
      if (changed.count !== 1) {
        const error = new Error('ORDER_CHANGED');
        error.statusCode = 409;
        throw error;
      }
      await tx.orderStatusHistory.create({
        data: { orderId: id, status: nextStatus, actorId: req.admin.id },
      });
      const updated = await tx.order.findUnique({ where: { id }, include: { items: true, user: true } });
      return updated;
    });

    await writeAudit({
      actorId: req.admin.id,
      action: 'ORDER_STATUS_CHANGED',
      entity: 'order',
      entityId: order.id,
      payload: { status: nextStatus },
    });

    return res.json({ ok: true, order });
  } catch (e) {
    return res.status(e?.statusCode || 500).json({ ok: false, error: e?.message || 'ORDER_STATUS_FAILED' });
  }
}

router.post('/orders/:id/accept', requireAdmin, requireRoles(['admin', 'moderator', 'florist']), (req, res) =>
  setOrderStatus(req, res, 'ACCEPTED'),
);

router.post('/orders/:id/dispatch', requireAdmin, requireRoles(['admin', 'moderator', 'florist']), (req, res) =>
  setOrderStatus(req, res, 'IN_DELIVERY'),
);

router.post('/orders/:id/complete', requireAdmin, requireRoles(['admin', 'moderator', 'courier']), (req, res) =>
  setOrderStatus(req, res, 'DELIVERED'),
);

// List active couriers
router.get('/couriers', requireAdmin, requireRoles(['admin', 'moderator']), async (req, res) => {
  try {
    const couriers = await prisma.user.findMany({
      where: { staffRole: 'courier', staffActive: true },
      select: { id: true, name: true, username: true, phone: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
    return res.json({ ok: true, couriers });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || 'COURIERS_FAILED' });
  }
});

// Assign courier explicitly
router.post('/orders/:id/assign-courier', requireAdmin, requireRoles(['admin', 'moderator']), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const courierId = Number(req.body?.courierId);
    if (!Number.isFinite(id) || !Number.isFinite(courierId)) return res.status(400).json({ ok: false, error: 'BAD_ID' });

    const courier = await prisma.user.findFirst({ where: { id: courierId, staffRole: 'courier', staffActive: true } });
    if (!courier) return res.status(404).json({ ok: false, error: 'COURIER_NOT_FOUND' });

    const order = await prisma.$transaction(async (tx) => {
      const current = await tx.order.findUnique({ where: { id } });
      if (!current) {
        const error = new Error('NOT_FOUND');
        error.statusCode = 404;
        throw error;
      }
      if (!isAllowedTransition(current.status, 'IN_DELIVERY')) {
        const error = new Error('INVALID_STATUS_TRANSITION');
        error.statusCode = 409;
        throw error;
      }
      const deliveryError = deliveryDispatchError(current);
      if (deliveryError) {
        const error = new Error(deliveryError);
        error.statusCode = 409;
        throw error;
      }
      const changed = await tx.order.updateMany({
        where: { id, status: current.status },
        data: { courierId, status: 'IN_DELIVERY' },
      });
      if (changed.count !== 1) {
        const error = new Error('ORDER_CHANGED');
        error.statusCode = 409;
        throw error;
      }
      await tx.orderStatusHistory.create({ data: { orderId: id, status: 'IN_DELIVERY', actorId: req.admin.id } });
      return tx.order.findUnique({ where: { id } });
    });

    await writeAudit({
      actorId: req.admin.id,
      action: 'ORDER_COURIER_ASSIGNED',
      entity: 'order',
      entityId: id,
      payload: { courierId },
    });
    return res.json({ ok: true, order });
  } catch (e) {
    return res.status(e?.statusCode || 500).json({ ok: false, error: e?.message || 'ASSIGN_COURIER_FAILED' });
  }
});

router.post('/orders/:id/cancel', requireAdmin, requireRoles(['admin', 'moderator']), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: 'BAD_ID' });

    const reason = String(req.body?.reason || '').trim();
    const order = await prisma.$transaction(async (tx) => {
      const current = await tx.order.findUnique({ where: { id } });
      if (!current) {
        const error = new Error('NOT_FOUND');
        error.statusCode = 404;
        throw error;
      }
      if (!isAllowedTransition(current.status, 'CANCELLED')) {
        const error = new Error('INVALID_STATUS_TRANSITION');
        error.statusCode = 409;
        throw error;
      }
      const changed = await tx.order.updateMany({
        where: { id, status: current.status },
        data: { status: 'CANCELLED', cancelReason: reason || null },
      });
      if (changed.count !== 1) {
        const error = new Error('ORDER_CHANGED');
        error.statusCode = 409;
        throw error;
      }
      await tx.orderStatusHistory.create({
        data: { orderId: id, status: 'CANCELLED', actorId: req.admin.id },
      });
      return tx.order.findUnique({ where: { id }, include: { items: true, user: true } });
    });

    await writeAudit({
      actorId: req.admin.id,
      action: 'ORDER_CANCELLED',
      entity: 'order',
      entityId: order.id,
      payload: { reason: reason || null },
    });

    return res.json({ ok: true, order });
  } catch (e) {
    return res.status(e?.statusCode || 500).json({ ok: false, error: e?.message || 'ORDER_CANCEL_FAILED' });
  }
});

// Order photos (pre-delivery)
router.post('/orders/:id/photos', requireAdmin, requireRoles(['admin', 'moderator', 'florist']), async (req, res) => {
  try {
    const orderId = Number(req.params.id);
    if (!Number.isFinite(orderId)) return res.status(400).json({ ok: false, error: 'BAD_ID' });

    const url = String(req.body?.url || '').trim();
    if (!url) return res.status(400).json({ ok: false, error: 'NO_URL' });

    const photo = await prisma.$transaction(async (tx) => {
      const created = await tx.orderPhoto.create({
        data: { orderId, url, uploadedById: req.admin.id },
      });

      const current = await tx.order.findUnique({ where: { id: orderId }, include: { user: true } });
      if (!current) throw new Error('ORDER_NOT_FOUND');
      const curStatus = normalizeOrderStatus(current.status);
      if (!['ACCEPTED', 'ASSEMBLED'].includes(curStatus)) throw new Error('INVALID_STATUS_TRANSITION');
      const nextStatus = 'ASSEMBLED';
      if (nextStatus !== curStatus) {
        const changed = await tx.order.updateMany({
          where: { id: orderId, status: current.status },
          data: { status: nextStatus },
        });
        if (changed.count !== 1) throw new Error('ORDER_CHANGED');
        await tx.orderStatusHistory.create({ data: { orderId, status: nextStatus, actorId: req.admin.id } });
      }

      return created;
    });

    await writeAudit({
      actorId: req.admin.id,
      action: 'ORDER_PHOTO_UPLOADED',
      entity: 'order',
      entityId: orderId,
      payload: { photoId: photo.id, url },
    });

    return res.json({ ok: true, photo });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || 'ORDER_PHOTO_FAILED' });
  }
});

router.post('/orders/:id/photos/:photoId/send', requireAdmin, requireRoles(['admin', 'moderator', 'florist']), async (req, res) => {
  try {
    const orderId = Number(req.params.id);
    const photoId = Number(req.params.photoId);
    if (!Number.isFinite(orderId) || !Number.isFinite(photoId)) return res.status(400).json({ ok: false, error: 'BAD_ID' });

    const now = new Date();
    const order = await prisma.$transaction(async (tx) => {
      const photo = await tx.orderPhoto.findUnique({ where: { id: photoId } });
      if (!photo || photo.orderId !== orderId) throw new Error('PHOTO_NOT_FOUND');

      await tx.orderPhoto.update({
        where: { id: photoId },
        data: { sentToClientAt: photo.sentToClientAt || now },
      });

      const current = await tx.order.findUnique({ where: { id: orderId } });
      if (!current) throw new Error('ORDER_NOT_FOUND');
      const curStatus = normalizeOrderStatus(current.status);
      if (!['ACCEPTED', 'ASSEMBLED'].includes(curStatus)) throw new Error('INVALID_STATUS_TRANSITION');
      const nextStatus = 'ASSEMBLED';

      if (nextStatus !== curStatus) {
        const changed = await tx.order.updateMany({
          where: { id: orderId, status: current.status },
          data: { status: nextStatus },
        });
        if (changed.count !== 1) throw new Error('ORDER_CHANGED');
        await tx.orderStatusHistory.create({ data: { orderId, status: nextStatus, actorId: req.admin.id } });
      }

      return tx.order.findUnique({ where: { id: orderId }, include: { user: true } });
    });

    await writeAudit({
      actorId: req.admin.id,
      action: 'ORDER_PHOTO_SENT',
      entity: 'order',
      entityId: orderId,
      payload: { photoId },
    });

    return res.json({ ok: true, order });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || 'ORDER_PHOTO_SEND_FAILED' });
  }
});

// Promo codes
function randomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 8; i += 1) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `FLOWIE-${out}`;
}

router.post('/orders/:id/promo', requireAdmin, requireRoles(['admin', 'moderator']), async (req, res) => {
  try {
    const orderId = Number(req.params.id);
    if (!Number.isFinite(orderId)) return res.status(400).json({ ok: false, error: 'BAD_ID' });

    const amount = asInt(req.body?.amount);
    if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ ok: false, error: 'BAD_AMOUNT' });

    const expiresAt = req.body?.expiresAt ? new Date(String(req.body.expiresAt)) : null;
    if (expiresAt && Number.isNaN(expiresAt.getTime())) return res.status(400).json({ ok: false, error: 'BAD_EXPIRES_AT' });

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
    if (!canAccessOrder(req.admin, order)) return res.status(403).json({ ok: false, error: 'FORBIDDEN' });

    const requestedCode = String(req.body?.code || '').trim().toUpperCase();
    let code = requestedCode || randomCode();

    // Ensure unique code.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const exists = await prisma.promoCode.findUnique({ where: { code } });
      if (!exists) break;
      code = randomCode();
    }

    const promo = await prisma.promoCode.create({
      data: {
        code,
        amount,
        expiresAt,
        sentAt: new Date(),
        createdById: req.admin.id,
        userId: order.userId,
        orderId: order.id,
      },
    });

    await writeAudit({
      actorId: req.admin.id,
      action: 'PROMO_SENT',
      entity: 'order',
      entityId: orderId,
      payload: { code: promo.code, amount: promo.amount, expiresAt: promo.expiresAt },
    });

    return res.json({ ok: true, promo });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || 'PROMO_FAILED' });
  }
});

// Chats
router.post('/orders/:id/chat', requireAdmin, requireRoles(['admin', 'moderator', 'florist', 'courier']), async (req, res) => {
  try {
    const orderId = Number(req.params.id);
    if (!Number.isFinite(orderId)) return res.status(400).json({ ok: false, error: 'BAD_ID' });

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
    if (!canAccessOrder(req.admin, order)) return res.status(403).json({ ok: false, error: 'FORBIDDEN' });

    const existing = await prisma.chat.findFirst({ where: { orderId: order.id } });
    if (existing) return res.json({ ok: true, chat: existing });

    const chat = await prisma.chat.create({
      data: { userId: order.userId, orderId: order.id },
    });

    await writeAudit({
      actorId: req.admin.id,
      action: 'CHAT_CREATED',
      entity: 'chat',
      entityId: chat.id,
      payload: { orderId: order.id, userId: order.userId },
    });

    return res.json({ ok: true, chat });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || 'CHAT_CREATE_FAILED' });
  }
});

router.get('/chats', requireAdmin, requireRoles(['admin', 'moderator', 'florist', 'courier']), async (req, res) => {
  try {
    const chats = await prisma.chat.findMany({
      where: req.admin.role === 'courier' ? { order: { courierId: req.admin.id } } : undefined,
      include: {
        user: true,
        order: true,
        messages: { take: 1, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] },
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    });
    return res.json({ ok: true, chats });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || 'CHATS_FAILED' });
  }
});

router.get('/chats/:id', requireAdmin, requireRoles(['admin', 'moderator', 'florist', 'courier']), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: 'BAD_ID' });

    const chat = await prisma.chat.findUnique({
      where: { id },
      include: { user: true, order: true },
    });
    if (!chat) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
    if (req.admin.role === 'courier' && Number(chat.order?.courierId) !== Number(req.admin.id)) {
      return res.status(403).json({ ok: false, error: 'FORBIDDEN' });
    }
    return res.json({ ok: true, chat });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || 'CHAT_FAILED' });
  }
});

router.get('/chats/:id/messages', requireAdmin, requireRoles(['admin', 'moderator', 'florist', 'courier']), async (req, res) => {
  try {
    const chatId = Number(req.params.id);
    if (!Number.isFinite(chatId)) return res.status(400).json({ ok: false, error: 'BAD_ID' });

    const chat = await prisma.chat.findUnique({ where: { id: chatId }, include: { order: true } });
    if (!chat) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
    if (req.admin.role === 'courier' && Number(chat.order?.courierId) !== Number(req.admin.id)) {
      return res.status(403).json({ ok: false, error: 'FORBIDDEN' });
    }

    const messages = await prisma.message.findMany({
      where: { chatId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: 200,
    });

    return res.json({ ok: true, messages });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || 'MESSAGES_FAILED' });
  }
});

router.post('/chats/:id/messages', requireAdmin, requireRoles(['admin', 'moderator', 'florist', 'courier']), async (req, res) => {
  try {
    const chatId = Number(req.params.id);
    if (!Number.isFinite(chatId)) return res.status(400).json({ ok: false, error: 'BAD_ID' });

    const chat = await prisma.chat.findUnique({ where: { id: chatId }, include: { order: true } });
    if (!chat) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
    if (req.admin.role === 'courier' && Number(chat.order?.courierId) !== Number(req.admin.id)) {
      return res.status(403).json({ ok: false, error: 'FORBIDDEN' });
    }

    const text = req.body?.text == null ? null : String(req.body.text);
    const attachmentUrl = req.body?.attachmentUrl == null ? null : String(req.body.attachmentUrl);
    if (!text && !attachmentUrl) return res.status(400).json({ ok: false, error: 'EMPTY_MESSAGE' });

    const message = await prisma.$transaction(async (tx) => {
      // Touch chat to update `updatedAt`
      await tx.chat.update({ where: { id: chatId }, data: { updatedAt: new Date() } });
      return tx.message.create({
        data: {
          chatId,
          senderRole: 'staff',
          senderUserId: req.admin.id,
          text,
          attachmentUrl,
        },
      });
    });

    await writeAudit({
      actorId: req.admin.id,
      action: 'CHAT_MESSAGE_SENT',
      entity: 'chat',
      entityId: chatId,
      payload: { messageId: message.id, hasAttachment: Boolean(attachmentUrl) },
    });

    return res.json({ ok: true, message });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || 'MESSAGE_SEND_FAILED' });
  }
});

// Analytics / Cash
function parseYmdDate(value) {
  const s = String(value || '').trim();
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  d.setHours(0, 0, 0, 0);
  return d;
}

function normalizeRefTag(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  return raw
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 64);
}

// Referral links
router.post('/referrals', requireAdmin, requireRoles(['admin']), async (req, res) => {
  try {
    const tag = normalizeRefTag(req.body?.tag || '');
    if (!tag) return res.status(400).json({ ok: false, error: 'BAD_TAG' });

    const title = req.body?.title == null ? null : String(req.body.title).trim() || null;
    const note = req.body?.note == null ? null : String(req.body.note).trim() || null;

    const existing = await prisma.referralLink.findUnique({ where: { tag } });
    if (existing) {
      const patch = {
        autoCreated: false,
        isActive: true,
      };
      if (title !== null) patch.title = title;
      if (note !== null) patch.note = note;
      if (!existing.createdById) patch.createdById = req.admin.id;

      const link = await prisma.referralLink.update({ where: { id: existing.id }, data: patch });
      return res.json({ ok: true, link, existed: true });
    }

    const link = await prisma.referralLink.create({
      data: {
        tag,
        title,
        note,
        autoCreated: false,
        isActive: true,
        createdById: req.admin.id,
      },
    });

    return res.json({ ok: true, link, existed: false });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || 'REFERRAL_CREATE_FAILED' });
  }
});

router.get('/referrals', requireAdmin, requireRoles(['admin']), async (req, res) => {
  try {
    const from = parseYmdDate(req.query?.from) || (() => {
      const d = new Date();
      d.setDate(d.getDate() - 6);
      d.setHours(0, 0, 0, 0);
      return d;
    })();
    const to = parseYmdDate(req.query?.to) || new Date();
    const end = new Date(to);
    end.setDate(end.getDate() + 1);

    const links = await prisma.referralLink.findMany({
      select: {
        id: true,
        tag: true,
        title: true,
        note: true,
        isActive: true,
        autoCreated: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });

    if (!links.length) return res.json({ ok: true, range: { from, to }, links: [] });

    const ids = links.map((l) => l.id);

    const openGroups = await prisma.referralOpen.groupBy({
      by: ['referralLinkId'],
      where: { referralLinkId: { in: ids }, createdAt: { gte: from, lt: end } },
      _count: { _all: true },
      _max: { createdAt: true },
    });

    const openDistinct = await prisma.referralOpen.findMany({
      where: { referralLinkId: { in: ids }, createdAt: { gte: from, lt: end }, userId: { not: null } },
      distinct: ['referralLinkId', 'userId'],
      select: { referralLinkId: true, userId: true },
    });

    const orders = await prisma.order.findMany({
      where: { referralLinkId: { in: ids }, createdAt: { gte: from, lt: end } },
      select: { referralLinkId: true, totalPrice: true, status: true, paymentStatus: true },
    });

    const stats = new Map();
    for (const id of ids) {
      stats.set(id, {
        opens: 0,
        uniqueUsers: 0,
        orders: 0,
        paidOrders: 0,
        paidRevenue: 0,
        deliveredOrders: 0,
        deliveredRevenue: 0,
        lastOpenAt: null,
      });
    }

    for (const row of openGroups) {
      const s = stats.get(row.referralLinkId);
      if (!s) continue;
      s.opens = row._count?._all || 0;
      s.lastOpenAt = row._max?.createdAt || null;
    }

    for (const row of openDistinct) {
      const s = stats.get(row.referralLinkId);
      if (s) s.uniqueUsers += 1;
    }

    for (const o of orders) {
      const s = stats.get(o.referralLinkId);
      if (!s) continue;
      s.orders += 1;
      const paymentStatus = String(o.paymentStatus || '').toUpperCase();
      const status = String(o.status || '').toUpperCase();
      const isPaid = paymentStatus === 'CONFIRMED';
      const isDelivered = status === 'DELIVERED';
      if (isPaid) {
        s.paidOrders += 1;
        s.paidRevenue += Number(o.totalPrice || 0);
      }
      if (isDelivered) {
        s.deliveredOrders += 1;
        s.deliveredRevenue += Number(o.totalPrice || 0);
      }
    }

    const enriched = links.map((link) => ({
      ...link,
      stats: stats.get(link.id) || {
        opens: 0,
        uniqueUsers: 0,
        orders: 0,
        paidOrders: 0,
        paidRevenue: 0,
        deliveredOrders: 0,
        deliveredRevenue: 0,
        lastOpenAt: null,
      },
    }));

    return res.json({ ok: true, range: { from, to }, links: enriched });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || 'REFERRAL_STATS_FAILED' });
  }
});

router.get('/analytics/summary', requireAdmin, requireRoles(['admin']), async (req, res) => {
  try {
    const from = parseYmdDate(req.query?.from) || (() => {
      const d = new Date();
      d.setDate(d.getDate() - 6);
      d.setHours(0, 0, 0, 0);
      return d;
    })();
    const to = parseYmdDate(req.query?.to) || new Date();
    const end = new Date(to);
    end.setDate(end.getDate() + 1);

    const grouped = await prisma.analyticsEvent.groupBy({
      by: ['event'],
      where: { createdAt: { gte: from, lt: end } },
      _count: { _all: true },
    });

    const counts = {};
    for (const row of grouped) counts[row.event] = row._count?._all || 0;

    const orders = await prisma.order.count({ where: { createdAt: { gte: from, lt: end } } });
    return res.json({ ok: true, range: { from, to }, counts, orders });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || 'ANALYTICS_FAILED' });
  }
});

router.get('/analytics/report', requireAdmin, requireRoles(['admin']), async (req, res) => {
  try {
    const report = await loadAnalyticsReport(prisma, { days: req.query?.days });
    return res.json(report);
  } catch (e) {
    return res.status(e?.statusCode || 500).json({ ok: false, error: e?.message || 'ANALYTICS_REPORT_FAILED' });
  }
});

router.get('/analytics/finance', requireAdmin, requireRoles(['admin']), async (req, res) => {
  try {
    const from = parseYmdDate(req.query?.from) || (() => {
      const d = new Date();
      d.setDate(d.getDate() - 6);
      d.setHours(0, 0, 0, 0);
      return d;
    })();
    const to = parseYmdDate(req.query?.to) || new Date();
    const end = new Date(to);
    end.setDate(end.getDate() + 1);

    const orders = await prisma.order.findMany({
      where: { createdAt: { gte: from, lt: end } },
      select: { id: true, status: true, totalPrice: true, createdAt: true, preDeliveryRating: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    const confirmedMainPayments = await prisma.order.findMany({
      where: {
        paymentStatus: 'CONFIRMED',
        paidAt: { gte: from, lt: end },
        user: { staffRole: null },
      },
      select: { totalPrice: true, paidAt: true },
      orderBy: [{ paidAt: 'asc' }, { id: 'asc' }],
    });
    const paidDeliveryInvoices = await prisma.deliveryInvoice.findMany({
      where: {
        status: 'PAID',
        paidAt: { gte: from, lt: end },
        order: { user: { staffRole: null } },
      },
      select: { amount: true, paidAt: true },
      orderBy: [{ paidAt: 'asc' }, { id: 'asc' }],
    });

    const days = new Map(); // key=YYYY-MM-DD => { revenue, delivered, cancelled, orders }
    let deliveredRevenue = 0;
    let deliveredCount = 0;
    let paidDeliveryRevenue = 0;
    let paidDeliveryCount = 0;
    let confirmedMainRevenue = 0;
    let cancelledCount = 0;
    let ratedSum = 0;
    let ratedCount = 0;

    function keyOf(d) {
      return d.toISOString().slice(0, 10);
    }

    for (const o of orders) {
      const s = normalizeOrderStatus(o.status);
      const key = keyOf(new Date(o.createdAt));
      if (!days.has(key)) days.set(key, { day: key, revenue: 0, delivered: 0, cancelled: 0, orders: 0 });
      const row = days.get(key);
      row.orders += 1;
      if (s === 'DELIVERED') {
        row.delivered += 1;
        row.revenue += o.totalPrice || 0;
        deliveredRevenue += o.totalPrice || 0;
        deliveredCount += 1;
      } else if (s === 'CANCELLED') {
        row.cancelled += 1;
        cancelledCount += 1;
      }

      if (o.preDeliveryRating === 'UP') {
        ratedSum += 1;
        ratedCount += 1;
      } else if (o.preDeliveryRating === 'DOWN') {
        ratedSum += 0;
        ratedCount += 1;
      }
    }

    for (const payment of confirmedMainPayments) {
      const key = keyOf(new Date(payment.paidAt));
      if (!days.has(key)) days.set(key, { day: key, revenue: 0, mainPaidRevenue: 0, deliveryRevenue: 0, delivered: 0, cancelled: 0, orders: 0 });
      const row = days.get(key);
      row.mainPaidRevenue = Number(row.mainPaidRevenue || 0) + Number(payment.totalPrice || 0);
      confirmedMainRevenue += Number(payment.totalPrice || 0);
    }

    for (const invoice of paidDeliveryInvoices) {
      const key = keyOf(new Date(invoice.paidAt));
      if (!days.has(key)) days.set(key, { day: key, revenue: 0, deliveryRevenue: 0, delivered: 0, cancelled: 0, orders: 0 });
      const row = days.get(key);
      row.deliveryRevenue = Number(row.deliveryRevenue || 0) + Number(invoice.amount || 0);
      paidDeliveryRevenue += Number(invoice.amount || 0);
      paidDeliveryCount += 1;
    }

    const revenueByDay = Array.from(days.values())
      .map((row) => ({
        ...row,
        mainPaidRevenue: Number(row.mainPaidRevenue || 0),
        deliveryRevenue: Number(row.deliveryRevenue || 0),
        totalReceipts: Number(row.mainPaidRevenue || 0) + Number(row.deliveryRevenue || 0),
      }))
      .sort((a, b) => a.day.localeCompare(b.day));
    const avgCheck = deliveredCount ? Math.round(deliveredRevenue / deliveredCount) : 0;
    const avgRating = ratedCount ? ratedSum / ratedCount : null;

    // Client segments (simple)
    const totalClients = await prisma.user.count({ where: { staffRole: null } });
    const newClients = await prisma.user.count({ where: { staffRole: null, createdAt: { gte: from, lt: end } } });

    return res.json({
      ok: true,
      range: { from, to },
      totals: {
        deliveredRevenue,
        deliveredCount,
        paidDeliveryRevenue,
        paidDeliveryCount,
        confirmedMainRevenue,
        confirmedMainCount: confirmedMainPayments.length,
        totalReceipts: confirmedMainRevenue + paidDeliveryRevenue,
        cancelledCount,
        avgCheck,
        avgRating,
        totalClients,
        newClients,
      },
      revenueByDay,
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || 'FINANCE_FAILED' });
  }
});

// Working hours / staff
router.get('/working-hours', requireAdmin, requireRoles(['admin']), async (req, res) => {
  try {
    const days = await prisma.workingHours.findMany({ orderBy: { weekday: 'asc' } });
    const exceptions = await prisma.workingHoursException.findMany({ orderBy: { date: 'asc' } });
    return res.json({ ok: true, days, exceptions });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || 'WORKING_HOURS_FAILED' });
  }
});

router.patch('/working-hours', requireAdmin, requireRoles(['admin']), async (req, res) => {
  try {
    const days = Array.isArray(req.body?.days) ? req.body.days : null;
    const exceptions = Array.isArray(req.body?.exceptions) ? req.body.exceptions : null;
    if (!days) return res.status(400).json({ ok: false, error: 'NO_DAYS' });

    await prisma.$transaction(async (tx) => {
      for (const d of days) {
        const weekday = asInt(d?.weekday);
        if (!Number.isFinite(weekday) || weekday < 0 || weekday > 6) continue;
        await tx.workingHours.upsert({
          where: { weekday },
          update: {
            startTime: d?.startTime ? String(d.startTime) : null,
            endTime: d?.endTime ? String(d.endTime) : null,
            isClosed: Boolean(d?.isClosed),
          },
          create: {
            weekday,
            startTime: d?.startTime ? String(d.startTime) : null,
            endTime: d?.endTime ? String(d.endTime) : null,
            isClosed: Boolean(d?.isClosed),
          },
        });
      }

      if (exceptions) {
        await tx.workingHoursException.deleteMany({});
        for (const ex of exceptions) {
          const date = ex?.date ? new Date(String(ex.date)) : null;
          if (!date || Number.isNaN(date.getTime())) continue;
          date.setHours(0, 0, 0, 0);
          await tx.workingHoursException.create({
            data: {
              date,
              startTime: ex?.startTime ? String(ex.startTime) : null,
              endTime: ex?.endTime ? String(ex.endTime) : null,
              isClosed: Boolean(ex?.isClosed),
            },
          });
        }
      }
    });

    await writeAudit({
      actorId: req.admin.id,
      action: 'WORKING_HOURS_UPDATED',
      entity: 'working_hours',
      entityId: null,
      payload: { daysCount: days.length, exceptionsCount: exceptions ? exceptions.length : undefined },
    });

    const nextDays = await prisma.workingHours.findMany({ orderBy: { weekday: 'asc' } });
    const nextEx = await prisma.workingHoursException.findMany({ orderBy: { date: 'asc' } });
    return res.json({ ok: true, days: nextDays, exceptions: nextEx });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || 'WORKING_HOURS_UPDATE_FAILED' });
  }
});

router.get('/staff', requireAdmin, requireRoles(['admin']), async (req, res) => {
  try {
    const staff = await prisma.user.findMany({
      where: { staffRole: { not: null } },
      orderBy: [{ staffActive: 'desc' }, { id: 'asc' }],
    });
    return res.json({ ok: true, staff });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || 'STAFF_FAILED' });
  }
});

router.post('/staff', requireAdmin, requireRoles(['admin']), async (req, res) => {
  try {
    const staffRole = String(req.body?.staffRole || '').trim();
    const staffActive = req.body?.staffActive == null ? true : Boolean(req.body.staffActive);
    const name = req.body?.name ? String(req.body.name) : null;
    const phone = normalizePhone(req.body?.phone);

    if (!phone) return res.status(400).json({ ok: false, error: 'BAD_PHONE' });
    if (!['admin', 'moderator', 'florist', 'courier'].includes(staffRole)) return res.status(400).json({ ok: false, error: 'BAD_ROLE' });

    const user = await prisma.user.upsert({
      where: { verifiedPhone: phone },
      update: { name, phone, staffRole, staffActive },
      create: { verifiedPhone: phone, phone, phoneVerifiedAt: new Date(), name, staffRole, staffActive },
    });

    await writeAudit({
      actorId: req.admin.id,
      action: 'USER_CREATED',
      entity: 'user',
      entityId: user.id,
      payload: { phone, staffRole, staffActive },
    });

    return res.json({ ok: true, user });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || 'STAFF_CREATE_FAILED' });
  }
});

router.patch('/staff/:id', requireAdmin, requireRoles(['admin']), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: 'BAD_ID' });

    const patch = req.body || {};
    const data = {};
    if (patch.staffRole != null) {
      const staffRole = String(patch.staffRole);
      if (!['admin', 'moderator', 'florist', 'courier'].includes(staffRole)) return res.status(400).json({ ok: false, error: 'BAD_ROLE' });
      data.staffRole = staffRole;
    }
    if (patch.staffActive != null) data.staffActive = Boolean(patch.staffActive);
    if (patch.name !== undefined) data.name = patch.name ? String(patch.name) : null;
    if (patch.username !== undefined) data.username = patch.username ? String(patch.username).replace(/^@/, '') : null;
    if (patch.phone !== undefined) data.phone = patch.phone ? String(patch.phone) : null;

    const current = await prisma.user.findUnique({ where: { id } });
    if (!current) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
    const removesActiveAdmin =
      current.staffRole === 'admin' &&
      current.staffActive &&
      (data.staffRole != null && data.staffRole !== 'admin' || data.staffActive === false);
    if (removesActiveAdmin) {
      const activeAdmins = await prisma.user.count({ where: { staffRole: 'admin', staffActive: true } });
      if (activeAdmins <= 1) return res.status(409).json({ ok: false, error: 'LAST_ACTIVE_ADMIN' });
    }

    const user = await prisma.user.update({ where: { id }, data });

    await writeAudit({
      actorId: req.admin.id,
      action: 'USER_ROLE_CHANGED',
      entity: 'user',
      entityId: user.id,
      payload: { patch: data },
    });

    return res.json({ ok: true, user });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || 'STAFF_UPDATE_FAILED' });
  }
});

router.put('/staff/:id/credential', requireAdmin, requireRoles(['admin']), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const login = normalizedLogin(req.body?.login);
    const password = req.body?.password;
    if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ ok: false, error: 'BAD_ID' });
    if (!validLogin(login)) return res.status(400).json({ ok: false, error: 'BAD_ADMIN_LOGIN' });

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user?.staffRole || !user.staffActive) return res.status(409).json({ ok: false, error: 'STAFF_ACCESS_DISABLED' });
    const encodedPasswordHash = passwordHash(password);

    const credential = await prisma.staffCredential.upsert({
      where: { userId: id },
      update: { login, passwordHash: encodedPasswordHash },
      create: { userId: id, login, passwordHash: encodedPasswordHash },
      select: { id: true, userId: true, login: true, updatedAt: true },
    });
    await writeAudit({
      actorId: req.admin.id,
      action: 'STAFF_CREDENTIAL_CHANGED',
      entity: 'user',
      entityId: id,
      payload: { login },
    });
    return res.json({ ok: true, credential });
  } catch (e) {
    if (e?.code === 'P2002') return res.status(409).json({ ok: false, error: 'ADMIN_LOGIN_TAKEN' });
    if (e?.message === 'BAD_ADMIN_PASSWORD') return res.status(400).json({ ok: false, error: 'BAD_ADMIN_PASSWORD' });
    return res.status(500).json({ ok: false, error: 'STAFF_CREDENTIAL_UPDATE_FAILED' });
  }
});

// Home banners are persisted in PostgreSQL, not editable Docker files.
router.get('/home-banners', requireAdmin, requireRoles(['admin']), async (_req, res) => {
  try {
    const banners = await prisma.homeBanner.findMany({ orderBy: [{sort:'asc'}, {id:'asc'}] });
    return res.json({ok:true, banners});
  } catch (error) {
    console.error('[admin] banner list failed',error?.message);
    return res.status(500).json({ok:false,error:'BANNERS_FAILED'});
  }
});

router.put('/home-banners/:id', requireAdmin, requireRoles(['admin']), requireSameOrigin, async (req, res) => {
  const id = String(req.params.id || '');
  if (!BANNER_IDS.includes(id)) return res.status(404).json({ok:false,error:'BANNER_NOT_FOUND'});
  let data;
  try { data = normalizeBanner(req.body); }
  catch (error) { return res.status(400).json({ok:false,error:error.code || 'BANNER_INVALID'}); }
  try {
    if (!data.isActive) {
      const others = await prisma.homeBanner.count({where:{isActive:true,id:{not:id}}});
      if (!others) return res.status(409).json({ok:false,error:'LAST_BANNER_REQUIRED'});
    }
    const banner = await prisma.homeBanner.update({where:{id},data});
    await writeAudit({actorId:req.admin.id,action:'HOME_BANNER_UPDATED',
      entity:'homeBanner',entityId:id,
      payload:{href:banner.href,isActive:banner.isActive,sort:banner.sort}});
    return res.json({ok:true,banner});
  } catch (error) {
    if (error?.code === 'P2025') return res.status(404).json({ok:false,error:'BANNER_NOT_FOUND'});
    console.error('[admin] banner update failed',error?.message);
    return res.status(500).json({ok:false,error:'BANNER_SAVE_FAILED'});
  }
});

router.use('/delivery-zones', requireAdmin, requireRoles(['admin']), require('./adminDeliveryZones')({ prisma, writeAudit }));

module.exports = router;
module.exports._test = {
  normalizeOrderStatus,
  isAllowedTransition,
  canAccessOrder,
  deliveryDispatchError,
  isMerchantConfirmedOrder,
};
