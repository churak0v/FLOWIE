import { getTelegramInitData } from '../../src/telegram';

const API_URL = import.meta.env.VITE_API_URL || '/api';

const MEM_CACHE = new Map();

async function fetchJson(path, options = {}) {
  const {
    cacheTtlMs = 0,
    cacheKey,
    force = false,
    // Strip our internal options so they don't get passed to `fetch`.
    ...fetchOptions
  } = options || {};

  const initData = getTelegramInitData();
  const headers = new Headers(fetchOptions.headers || {});
  if (initData) headers.set('X-TG-InitData', initData);

  const method = String(fetchOptions.method || 'GET').toUpperCase();
  const key = cacheKey || `${method}:${path}`;
  const ttl = Number(cacheTtlMs || 0);

  if (!force && method === 'GET' && ttl > 0) {
    const hit = MEM_CACHE.get(key);
    if (hit && Date.now() - hit.ts < ttl) return hit.data;
  }

  const res = await fetch(`${API_URL}${path}`, {
    ...fetchOptions,
    headers,
    // cookies are optional here, but keeping it allows local/dev testing too.
    credentials: 'include',
  });

  const contentType = res.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  const data = isJson ? await res.json().catch(() => null) : await res.text().catch(() => null);

  if (!res.ok) {
    const error = new Error(data?.error || `HTTP_${res.status}`);
    error.status = res.status;
    error.data = data;
    throw error;
  }

  if (method === 'GET' && ttl > 0) {
    MEM_CACHE.set(key, { ts: Date.now(), data });
  }

  return data;
}

export const adminApi = {
  me: async (opts = {}) => fetchJson('/admin/me', { cache: 'no-store', cacheTtlMs: 10_000, ...(opts || {}) }),

  // Uploads (shared endpoint)
  uploadFile: async (file) => {
    const initData = getTelegramInitData();
    const formData = new FormData();
    formData.append('file', file);

    const headers = new Headers();
    if (initData) headers.set('X-TG-InitData', initData);

    const res = await fetch(`${API_URL}/upload`, {
      method: 'POST',
      body: formData,
      headers,
      credentials: 'include',
    });
    const contentType = res.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');
    const data = isJson ? await res.json().catch(() => null) : null;
    const text = !isJson ? await res.text().catch(() => '') : '';

    if (res.status === 413) throw new Error('Файл слишком большой (макс 25 МБ)');
    if (res.status === 401 || res.status === 403) throw new Error('Нет прав (initData/сессия)');
    if (!res.ok || !data?.url) throw new Error(data?.error || text || 'UPLOAD_FAILED');
    return data.url;
  },

  // Products
  getProducts: async (opts = {}) => {
    const kind = opts?.kind ? String(opts.kind) : '';
    const qs = new URLSearchParams();
    if (kind) qs.set('kind', kind);
    const tail = qs.toString() ? `?${qs.toString()}` : '';
    return fetchJson(`/admin/products${tail}`, { cache: 'no-store', cacheTtlMs: 15_000, cacheKey: `GET:/admin/products${tail}`, ...(opts || {}) });
  },
  getProduct: async (id, opts = {}) =>
    fetchJson(`/admin/products/${encodeURIComponent(id)}`, { cache: 'no-store', cacheTtlMs: 15_000, ...(opts || {}) }),
  createProduct: async (payload) =>
    fetchJson('/admin/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  updateProduct: async (id, patch) =>
    fetchJson(`/admin/products/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }),
  deleteProduct: async (id) =>
    fetchJson(`/admin/products/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),
  reorderProducts: async (kind, productIds) =>
    fetchJson('/admin/products/reorder', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, productIds }),
    }),
  addProductImage: async (id, url) =>
    fetchJson(`/admin/products/${encodeURIComponent(id)}/images`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    }),
  reorderProductImages: async (id, imageIds) =>
    fetchJson(`/admin/products/${encodeURIComponent(id)}/images/reorder`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageIds }),
    }),

  // Orders
  getOrders: async (query = {}, opts = {}) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(query || {})) {
      if (v == null || v === '') continue;
      qs.set(k, String(v));
    }
    const tail = qs.toString() ? `?${qs.toString()}` : '';
    return fetchJson(`/admin/orders${tail}`, { cache: 'no-store', cacheTtlMs: 10_000, cacheKey: `GET:/admin/orders${tail}`, ...(opts || {}) });
  },
  getOrder: async (id, opts = {}) =>
    fetchJson(`/admin/orders/${encodeURIComponent(id)}`, { cache: 'no-store', cacheTtlMs: 10_000, ...(opts || {}) }),
  acceptOrder: async (id) => fetchJson(`/admin/orders/${encodeURIComponent(id)}/accept`, { method: 'POST' }),
  dispatchOrder: async (id, courierId) =>
    fetchJson(`/admin/orders/${encodeURIComponent(id)}/dispatch`, {
      method: 'POST',
      headers: courierId ? { 'Content-Type': 'application/json' } : undefined,
      body: courierId ? JSON.stringify({ courierId }) : undefined,
    }),
  completeOrder: async (id) => fetchJson(`/admin/orders/${encodeURIComponent(id)}/complete`, { method: 'POST' }),
  cancelOrder: async (id, reason) =>
    fetchJson(`/admin/orders/${encodeURIComponent(id)}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    }),

  addOrderPhoto: async (orderId, url) =>
    fetchJson(`/admin/orders/${encodeURIComponent(orderId)}/photos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    }),
  sendOrderPhoto: async (orderId, photoId) => fetchJson(`/admin/orders/${encodeURIComponent(orderId)}/photos/${encodeURIComponent(photoId)}/send`, { method: 'POST' }),
  sendOrderPromo: async (orderId, payload) =>
    fetchJson(`/admin/orders/${encodeURIComponent(orderId)}/promo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload || {}),
    }),
  ensureOrderChat: async (orderId) => fetchJson(`/admin/orders/${encodeURIComponent(orderId)}/chat`, { method: 'POST' }),
  confirmOrderPayment: async (orderId) => fetchJson(`/admin/orders/${encodeURIComponent(orderId)}/confirm-payment`, { method: 'POST' }),
  getCouriers: async () => fetchJson('/admin/couriers', { cache: 'no-store', cacheTtlMs: 5_000 }),

  // Collections
  getCollections: async (opts = {}) => fetchJson('/admin/collections', { cache: 'no-store', cacheTtlMs: 10_000, ...(opts || {}) }),
  getCollection: async (id, opts = {}) =>
    fetchJson(`/admin/collections/${encodeURIComponent(id)}`, { cache: 'no-store', cacheTtlMs: 10_000, ...(opts || {}) }),
  createCollection: async (payload) =>
    fetchJson('/admin/collections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload || {}),
    }),
  updateCollection: async (id, patch) =>
    fetchJson(`/admin/collections/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch || {}),
    }),
  setCollectionItems: async (id, productIds) =>
    fetchJson(`/admin/collections/${encodeURIComponent(id)}/items`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productIds: productIds || [] }),
    }),

  // Chats
  getChats: async (opts = {}) => fetchJson('/admin/chats', { cache: 'no-store', cacheTtlMs: 5_000, ...(opts || {}) }),
  getChat: async (id, opts = {}) => fetchJson(`/admin/chats/${encodeURIComponent(id)}`, { cache: 'no-store', cacheTtlMs: 5_000, ...(opts || {}) }),
  getChatMessages: async (id, opts = {}) =>
    fetchJson(`/admin/chats/${encodeURIComponent(id)}/messages`, { cache: 'no-store', cacheTtlMs: 3_000, ...(opts || {}) }),
  sendChatMessage: async (chatId, payload) =>
    fetchJson(`/admin/chats/${encodeURIComponent(chatId)}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload || {}),
    }),

  // Cash / Analytics
  getAnalyticsSummary: async (query = {}, opts = {}) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(query || {})) {
      if (v == null || v === '') continue;
      qs.set(k, String(v));
    }
    const tail = qs.toString() ? `?${qs.toString()}` : '';
    return fetchJson(`/admin/analytics/summary${tail}`, { cache: 'no-store', cacheTtlMs: 10_000, cacheKey: `GET:/admin/analytics/summary${tail}`, ...(opts || {}) });
  },
  getFinance: async (query = {}, opts = {}) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(query || {})) {
      if (v == null || v === '') continue;
      qs.set(k, String(v));
    }
    const tail = qs.toString() ? `?${qs.toString()}` : '';
    return fetchJson(`/admin/analytics/finance${tail}`, { cache: 'no-store', cacheTtlMs: 10_000, cacheKey: `GET:/admin/analytics/finance${tail}`, ...(opts || {}) });
  },
  getReferrals: async (query = {}, opts = {}) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(query || {})) {
      if (v == null || v === '') continue;
      qs.set(k, String(v));
    }
    const tail = qs.toString() ? `?${qs.toString()}` : '';
    return fetchJson(`/admin/referrals${tail}`, { cache: 'no-store', cacheTtlMs: 10_000, cacheKey: `GET:/admin/referrals${tail}`, ...(opts || {}) });
  },
  createReferral: async (payload) =>
    fetchJson('/admin/referrals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload || {}),
    }),

  // Working hours / Staff
  getWorkingHours: async (opts = {}) => fetchJson('/admin/working-hours', { cache: 'no-store', cacheTtlMs: 10_000, ...(opts || {}) }),
  updateWorkingHours: async (payload) =>
    fetchJson('/admin/working-hours', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload || {}),
    }),
  getStaff: async (opts = {}) => fetchJson('/admin/staff', { cache: 'no-store', cacheTtlMs: 10_000, ...(opts || {}) }),
  createStaff: async (payload) =>
    fetchJson('/admin/staff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload || {}),
    }),
  updateStaff: async (id, patch) =>
    fetchJson(`/admin/staff/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch || {}),
    }),
};
