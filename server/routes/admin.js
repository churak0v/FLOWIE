const express = require('express');
const { validate, parse } = require('@tma.js/init-data-node');
const { PrismaClient } = require('@prisma/client');

const router = express.Router();
const prisma = new PrismaClient();

function parseCsv(value) {
  return String(value || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function getBotToken() {
  const botToken = process.env.ADMIN_BOT_TOKEN || process.env.BOT_TOKEN;
  if (!botToken) throw new Error('ADMIN_BOT_TOKEN_NOT_SET');
  return botToken;
}

function getInitDataFromHeader(req) {
  // Spec: X-TG-InitData
  const raw = req.headers['x-tg-initdata'];
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw)) return raw[0] || '';
  return '';
}

async function upsertUserFromInitData(initData) {
  // Telegram initData may be reused while the Mini App is open; keep a longer TTL to avoid random UNAUTHORIZED.
  validate(initData, getBotToken(), { expiresIn: 86400 });
  const data = parse(initData);
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

async function notifyClientTelegram({ telegramId, text }) {
  try {
    const chatId = String(telegramId || '').trim();
    if (!chatId) return;

    // Prefer the client bot for client notifications.
    const token = process.env.BOT_TOKEN || process.env.ADMIN_BOT_TOKEN;
    if (!token) return;

    const msg = String(text || '').trim();
    if (!msg) return;

    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: msg }),
    });
    await res.json().catch(() => null);
  } catch {
    // ignore
  }
}

async function requireAdmin(req, res, next) {
  try {
    const initData = getInitDataFromHeader(req);
    const initDataLen = initData ? initData.length : 0;
    const hasCookieUser = Boolean(req.user?.id);
    try {
      console.info('[admin] incoming', {
        path: req.originalUrl,
        method: req.method,
        hasInitData: Boolean(initData),
        initDataLen,
        hasCookieUser,
        ip: req.ip,
      });
    } catch {
      // ignore logging failures
    }

    // Auth via initData (preferred for subdomains / TG WebApp)
    let user = null;
    if (initData) {
      user = await upsertUserFromInitData(initData);
    } else if (req.user?.id) {
      // Fallback: cookie/bearer session (useful in local/dev)
      user = await prisma.user.findUnique({ where: { id: req.user.id } });
    }

    if (!user) return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });

    // Bootstrap the very first admin from env allow-list.
    const bootstrapTgIds = parseCsv(process.env.ADMIN_TG_IDS);
    if ((!user.staffRole || !user.staffActive) && user.telegramId && bootstrapTgIds.includes(user.telegramId)) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { staffRole: 'admin', staffActive: true },
      });
      await writeAudit({
        actorId: user.id,
        action: 'STAFF_BOOTSTRAPPED',
        entity: 'user',
        entityId: user.id,
        payload: { staffRole: 'admin' },
      });
    }

    if (!user.staffRole || !user.staffActive) {
      console.warn('[admin] forbidden (no staff role)', { userId: user.id, role: user.staffRole, active: user.staffActive });
      return res.status(403).json({ ok: false, error: 'FORBIDDEN' });
    }

    req.admin = {
      id: user.id,
      telegramId: user.telegramId,
      username: user.username,
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
    return res.status(401).json({ ok: false, error: 'UNAUTHORIZED', message: e?.message || 'INVALID_INIT_DATA' });
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
  if (v === 'DELIVERY') return 'IN_DELIVERY';
  if (v === 'COMPLETED') return 'DELIVERED';
  if (v === 'CANCELLED') return 'CANCELLED';
  if (v === 'ACCEPTED') return 'ACCEPTED';
  if (v === 'ASSEMBLED') return 'ASSEMBLED';
  if (v === 'IN_DELIVERY') return 'IN_DELIVERY';
  if (v === 'DELIVERED') return 'DELIVERED';
  return v || 'NEW';
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
      const updated = await tx.product.update({
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

    const last = await prisma.productImage.findFirst({
      where: { productId },
      orderBy: [{ sort: 'desc' }, { createdAt: 'desc' }],
    });
    const sort = Number(last?.sort || 0) + 1;

    const image = await prisma.productImage.create({
      data: { productId, url, sort },
    });

    await writeAudit({
      actorId: req.admin.id,
      action: 'PRODUCT_IMAGE_ADDED',
      entity: 'product',
      entityId: productId,
      payload: { imageId: image.id, url },
    });

    return res.json({ ok: true, image });
  } catch (e) {
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
        // hide expired unpaid orders from the list
        NOT: [{ paymentStatus: 'EXPIRED' }, { status: 'CANCELLED', paymentStatus: 'EXPIRED' }],
      },
      include: { items: { include: { product: true } }, user: true },
      orderBy: { createdAt: 'desc' },
    });

    return res.json({ ok: true, orders });
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
      },
    });
    if (!order) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });

    return res.json({ ok: true, order });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || 'ORDER_FAILED' });
  }
});

// Confirm payment manually from admin UI
router.post('/orders/:id/confirm-payment', requireAdmin, requireRoles(['admin', 'moderator', 'florist']), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: 'BAD_ID' });

    const now = new Date();
    const order = await prisma.$transaction(async (tx) => {
      const updated = await tx.order.update({
        where: { id },
        data: {
          paymentStatus: 'CONFIRMED',
          paymentClientConfirmed: true,
          status: 'PAID',
          paidAt: now,
        },
      });
      await tx.orderStatusHistory.create({
        data: { orderId: id, status: 'PAID', actorId: req.admin.id },
      });
      return updated;
    });

    return res.json({ ok: true, order });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || 'CONFIRM_PAYMENT_FAILED' });
  }
});

async function setOrderStatus(req, res, nextStatus) {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: 'BAD_ID' });

    const order = await prisma.$transaction(async (tx) => {
      const updated = await tx.order.update({
        where: { id },
        data: {
          status: nextStatus,
          courierId: nextStatus === 'IN_DELIVERY' ? (req.body?.courierId || req.admin.id || null) : undefined,
          deliveredAt: nextStatus === 'DELIVERED' ? new Date() : undefined,
        },
        include: { items: true, user: true },
      });
      await tx.orderStatusHistory.create({
        data: { orderId: id, status: nextStatus, actorId: req.admin.id },
      });
      return updated;
    });

    await writeAudit({
      actorId: req.admin.id,
      action: 'ORDER_STATUS_CHANGED',
      entity: 'order',
      entityId: order.id,
      payload: { status: nextStatus },
    });

    if (nextStatus === 'DELIVERED') {
      notifyClientTelegram({
        telegramId: order.user?.telegramId,
        text: `Заказ №${order.id} доставлен.`,
      });
    }

    return res.json({ ok: true, order });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || 'ORDER_STATUS_FAILED' });
  }
}

router.post('/orders/:id/accept', requireAdmin, requireRoles(['admin', 'moderator', 'florist']), (req, res) =>
  setOrderStatus(req, res, 'ACCEPTED'),
);

router.post('/orders/:id/dispatch', requireAdmin, requireRoles(['admin', 'moderator', 'florist', 'courier']), (req, res) =>
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
      const updated = await tx.order.update({
        where: { id },
        data: { courierId, status: 'IN_DELIVERY' },
      });
      await tx.orderStatusHistory.create({ data: { orderId: id, status: 'IN_DELIVERY', actorId: req.admin.id } });
      return updated;
    });

    return res.json({ ok: true, order });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || 'ASSIGN_COURIER_FAILED' });
  }
});

router.post('/orders/:id/cancel', requireAdmin, requireRoles(['admin', 'moderator']), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: 'BAD_ID' });

    const reason = String(req.body?.reason || '').trim();
    const order = await prisma.$transaction(async (tx) => {
      const updated = await tx.order.update({
        where: { id },
        data: { status: 'CANCELLED', cancelReason: reason || null },
        include: { items: true, user: true },
      });
      await tx.orderStatusHistory.create({
        data: { orderId: id, status: 'CANCELLED', actorId: req.admin.id },
      });
      return updated;
    });

    await writeAudit({
      actorId: req.admin.id,
      action: 'ORDER_CANCELLED',
      entity: 'order',
      entityId: order.id,
      payload: { reason: reason || null },
    });

    // Best-effort notify client in Telegram.
    notifyClientTelegram({
      telegramId: order.user?.telegramId,
      text: `Заказ №${order.id} отменен.${reason ? ` Причина: ${reason}` : ''}`,
    });

    return res.json({ ok: true, order });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || 'ORDER_CANCEL_FAILED' });
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
      const nextStatus = curStatus === 'CANCELLED' || curStatus === 'DELIVERED' ? curStatus : 'ASSEMBLED';
      if (nextStatus !== curStatus) {
        await tx.order.update({ where: { id: orderId }, data: { status: nextStatus } });
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
      const nextStatus = curStatus === 'CANCELLED' || curStatus === 'DELIVERED' ? curStatus : 'ASSEMBLED';

      const updated = await tx.order.update({
        where: { id: orderId },
        data: { status: nextStatus },
        include: { user: true },
      });

      if (nextStatus !== curStatus) {
        await tx.orderStatusHistory.create({ data: { orderId, status: nextStatus, actorId: req.admin.id } });
      }

      return updated;
    });

    await writeAudit({
      actorId: req.admin.id,
      action: 'ORDER_PHOTO_SENT',
      entity: 'order',
      entityId: orderId,
      payload: { photoId },
    });

    // Notify client: photo ready for оценка
    notifyClientTelegram({
      telegramId: order.user?.telegramId,
      text: `Фото вашего заказа #${orderId} готово. Пожалуйста, оцените в приложении.`,
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
    return res.json({ ok: true, chat });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || 'CHAT_FAILED' });
  }
});

router.get('/chats/:id/messages', requireAdmin, requireRoles(['admin', 'moderator', 'florist', 'courier']), async (req, res) => {
  try {
    const chatId = Number(req.params.id);
    if (!Number.isFinite(chatId)) return res.status(400).json({ ok: false, error: 'BAD_ID' });

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

    const days = new Map(); // key=YYYY-MM-DD => { revenue, delivered, cancelled, orders }
    let deliveredRevenue = 0;
    let deliveredCount = 0;
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

    const revenueByDay = Array.from(days.values());
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
    const telegramId = String(req.body?.telegramId || '').trim();
    const staffRole = String(req.body?.staffRole || '').trim();
    const staffActive = req.body?.staffActive == null ? true : Boolean(req.body.staffActive);
    const name = req.body?.name ? String(req.body.name) : null;
    const username = req.body?.username ? String(req.body.username).replace(/^@/, '') : null;
    const phone = req.body?.phone ? String(req.body.phone) : null;

    if (!telegramId) return res.status(400).json({ ok: false, error: 'TG_ID_REQUIRED' });
    if (!['admin', 'moderator', 'florist', 'courier'].includes(staffRole)) return res.status(400).json({ ok: false, error: 'BAD_ROLE' });

    const user = await prisma.user.upsert({
      where: { telegramId },
      update: { name, username, phone, staffRole, staffActive },
      create: { telegramId, name, username, phone, staffRole, staffActive },
    });

    await writeAudit({
      actorId: req.admin.id,
      action: 'USER_CREATED',
      entity: 'user',
      entityId: user.id,
      payload: { telegramId, staffRole, staffActive },
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

module.exports = router;
