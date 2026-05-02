import { getTelegramInitData } from './telegram';

const API_URL = import.meta.env.VITE_API_URL || '/api';

const MEM_CACHE = new Map();

const SESSION_TOKEN_KEY = 'flowie_session_token';

function getSessionToken() {
    try {
        const t = localStorage.getItem(SESSION_TOKEN_KEY);
        return t ? String(t) : '';
    } catch {
        return '';
    }
}

function setSessionToken(token) {
    try {
        const t = String(token || '').trim();
        if (!t) return;
        localStorage.setItem(SESSION_TOKEN_KEY, t);
    } catch {
        // ignore
    }
}

function clearSessionToken() {
    try {
        localStorage.removeItem(SESSION_TOKEN_KEY);
    } catch {
        // ignore
    }
}

async function fetchJson(path, options = {}) {
    const method = String(options.method || 'GET').toUpperCase();
    const cacheTtlMs = Number(options.cacheTtlMs || 0);
    const cacheKey = options.cacheKey || `${method}:${path}`;

    if (method === 'GET' && cacheTtlMs > 0) {
        const hit = MEM_CACHE.get(cacheKey);
        if (hit && Date.now() - hit.ts < cacheTtlMs) {
            return hit.data;
        }
    }

    const token = getSessionToken();
    const headers = {
        ...(options.headers || {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };

    const res = await fetch(path, {
        credentials: 'include',
        ...options,
        headers,
    });

    const contentType = res.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');
    const data = isJson ? await res.json().catch(() => null) : await res.text().catch(() => null);

    if (!res.ok) {
        const error = new Error(data?.error || `HTTP_${res.status}`);
        error.status = res.status;
        error.data = data;
        // If our local token is invalid/expired, clear it so bootstrap can re-auth.
        if (res.status === 401) clearSessionToken();
        throw error;
    }

    if (method === 'GET' && cacheTtlMs > 0) {
        MEM_CACHE.set(cacheKey, { ts: Date.now(), data });
    }

    return data;
}

export const api = {
    // Auth
    getMe: async () => {
        // Auth is session-critical (cookie can change after telegramLogin). Avoid caching.
        return fetchJson(`${API_URL}/auth/me`, { cache: 'no-store' });
    },
    updateMe: async (patch) => {
        return fetchJson(`${API_URL}/auth/me`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(patch || {}),
        });
    },
    telegramLogin: async (initData) => {
        const res = await fetchJson(`${API_URL}/auth/telegram`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ initData }),
        });
        if (res?.token) setSessionToken(res.token);
        return res;
    },
    guestLogin: async () => {
        const res = await fetchJson(`${API_URL}/auth/guest`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
        });
        if (res?.token) setSessionToken(res.token);
        return res;
    },
    logout: async () => {
        const res = await fetchJson(`${API_URL}/auth/logout`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
        });
        clearSessionToken();
        return res;
    },

    // Analytics (best-effort)
    trackEvent: async (event, meta = {}) => {
        const initData = getTelegramInitData();
        const headers = { 'Content-Type': 'application/json' };
        if (initData) headers['X-TG-InitData'] = initData;
        return fetchJson(`${API_URL}/events`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ event, meta }),
        });
    },

    // Uploads
    uploadFile: async (file) => {
        const formData = new FormData();
        formData.append('file', file);

        const res = await fetch(`${API_URL}/upload`, {
            method: 'POST',
            body: formData,
            credentials: 'include',
        });
        const contentType = res.headers.get('content-type') || '';
        const isJson = contentType.includes('application/json');
        const data = isJson ? await res.json().catch(() => null) : null;
        const text = !isJson ? await res.text().catch(() => '') : '';

        if (res.status === 413) {
            throw new Error('Файл слишком большой (макс 25 МБ)');
        }
        if (!res.ok || !data?.url) {
            throw new Error(data?.error || text || 'UPLOAD_FAILED');
        }
        return data.url;
    },

    // Products
    getProducts: async () => {
        return fetchJson(`${API_URL}/products`, { cache: 'no-store', cacheTtlMs: 15_000 });
    },
    getUpsells: async () => {
        return fetchJson(`${API_URL}/products?kind=upsell`, { cache: 'no-store', cacheTtlMs: 15_000, cacheKey: 'GET:/products?kind=upsell' });
    },
    getProduct: async (id) => {
        return fetchJson(`${API_URL}/products/${encodeURIComponent(id)}`, { cache: 'no-store', cacheTtlMs: 15_000 });
    },
    createProduct: async (productData) => {
        return fetchJson(`${API_URL}/products`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(productData)
        });
    },

    // Collections (thematic + scenarios)
    getCollections: async () => {
        return fetchJson(`${API_URL}/collections`, { cache: 'no-store', cacheTtlMs: 60_000 });
    },

    // Recipients
    getRecipients: async () => {
        return fetchJson(`${API_URL}/recipients`, { cache: 'no-store' });
    },
    createRecipient: async (payload) => {
        return fetchJson(`${API_URL}/recipients`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload || {}),
        });
    },
    updateRecipient: async (id, patch) => {
        return fetchJson(`${API_URL}/recipients/${encodeURIComponent(id)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(patch || {}),
        });
    },
    deleteRecipient: async (id) => {
        return fetchJson(`${API_URL}/recipients/${encodeURIComponent(id)}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
        });
    },

    // Orders
    getOrders: async (filters = {}) => {
        const params = new URLSearchParams(filters);
        return fetchJson(`${API_URL}/orders?${params}`);
    },
    getOrder: async (id) => {
        return fetchJson(`${API_URL}/orders/${encodeURIComponent(id)}`, { cache: 'no-store' });
    },
    createOrder: async (orderData) => {
        return fetchJson(`${API_URL}/orders`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(orderData)
        });
    },

    // Payments
    getManualPaymentInfo: async (orderId) => {
        const qs = new URLSearchParams();
        if (orderId != null) qs.set('orderId', String(orderId));
        const tail = qs.toString() ? `?${qs.toString()}` : '';
        return fetchJson(`${API_URL}/payments/manual${tail}`, { cache: 'no-store' });
    },
    confirmPaymentClient: async (orderId) => {
        return fetchJson(`${API_URL}/payments/confirm-client`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orderId }),
        });
    },
    rateOrderPhoto: async (orderId, rating) => {
        return fetchJson(`${API_URL}/orders/${encodeURIComponent(orderId)}/photo-rating`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rating }),
        });
    },
    cancelOrderClient: async (orderId) => {
        return fetchJson(`${API_URL}/orders/${encodeURIComponent(orderId)}/cancel`, {
            method: 'POST',
        });
    },

    // Chats (client)
    getChats: async () => {
        return fetchJson(`${API_URL}/chats`, { cacheTtlMs: 10_000 });
    },
    getChatMessages: async (chatId) => {
        return fetchJson(`${API_URL}/chats/${encodeURIComponent(chatId)}/messages`, { cacheTtlMs: 5_000 });
    },
    sendChatMessage: async (chatId, payload) => {
        return fetchJson(`${API_URL}/chats/${encodeURIComponent(chatId)}/messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload || {}),
        });
    },

    // Delivery
    estimateDelivery: async (addressData) => {
        return fetchJson(`${API_URL}/delivery/estimate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(addressData)
        });
    }
};
