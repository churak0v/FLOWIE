import { createAnalyticsUuid, getAnalyticsSessionId } from './lib/analytics.js';
import { buildOrderPayload } from './lib/orderPayload.js';

const API_URL = import.meta.env?.VITE_API_URL || '/api';

const MEM_CACHE = new Map();

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

    const headers = {
        ...(options.headers || {}),
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
        // Auth is session-critical because the cookie can change after login. Avoid caching.
        return fetchJson(`${API_URL}/auth/me`, { cache: 'no-store' });
    },
    updateMe: async (patch) => {
        return fetchJson(`${API_URL}/auth/me`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(patch || {}),
        });
    },
    guestLogin: async () => {
        return fetchJson(`${API_URL}/auth/guest`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
        });
    },
    requestPhoneOtp: async (phone) => {
        return fetchJson(`${API_URL}/auth/phone/request`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone }),
        });
    },
    verifyPhoneOtp: async ({ challengeId, code }) => {
        return fetchJson(`${API_URL}/auth/phone/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ challengeId, code }),
        });
    },
    logout: async () => {
        return fetchJson(`${API_URL}/auth/logout`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
        });
    },

    // Analytics (best-effort)
    trackEvent: async (event, meta = {}) => {
        const headers = { 'Content-Type': 'application/json' };
        return fetchJson(`${API_URL}/events`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                event,
                eventId: createAnalyticsUuid(),
                sessionId: getAnalyticsSessionId(),
                meta,
            }),
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
            throw new Error('File is too large (max 25 MB)');
        }
        if (!res.ok || !data?.url) {
            throw new Error(data?.error || text || 'UPLOAD_FAILED');
        }
        return data.url;
    },

    // Products
    searchCatalog: async (payload, { signal } = {}) => {
        return fetchJson(`${API_URL}/search/catalog`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            cache: 'no-store',
            signal,
        });
    },
    getProducts: async () => {
        return fetchJson(`${API_URL}/products`, { cache: 'no-store', cacheTtlMs: 15_000 });
    },
    getUpsells: async () => {
        return fetchJson(`${API_URL}/products?kind=upsell`, { cache: 'no-store', cacheTtlMs: 15_000, cacheKey: 'GET:/products?kind=upsell' });
    },
    getProduct: async (id, { fresh = false } = {}) => {
        return fetchJson(`${API_URL}/products/${encodeURIComponent(id)}`, { cache: 'no-store', cacheTtlMs: fresh ? 0 : 15_000 });
    },
    createProduct: async (productData) => {
        return fetchJson(`${API_URL}/products`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(productData)
        });
    },

    getHomeBanners: async () => fetchJson(API_URL + '/home-banners', { cache: 'no-store' }),

    // Registration gift. The server is the source of truth; campaigns default to disabled.
    getRegistrationGiftStatus: async () => fetchJson(`${API_URL}/registration-gift/status`, { cache: 'no-store' }),
    exposeRegistrationGift: async (payload = {}) => fetchJson(`${API_URL}/registration-gift/exposure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    }),

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
            body: JSON.stringify(buildOrderPayload(orderData))
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
    createAlfaPayment: async (orderId) => {
        return fetchJson(`${API_URL}/payments/alfa-register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orderId }),
        });
    },
    syncAlfaPayment: async (orderId) => {
        const qs = new URLSearchParams();
        qs.set('orderId', String(orderId));
        return fetchJson(`${API_URL}/payments/alfa-status?${qs.toString()}`, { cache: 'no-store' });
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
    },
    getDeliveryMapConfig: async () => {
        return fetchJson(`${API_URL}/delivery/map-config`, { cache: 'no-store', cacheTtlMs: 5 * 60_000 });
    },
    suggestDeliveryAddresses: async (query) => {
        const params = new URLSearchParams({ q: String(query || '') });
        return fetchJson(`${API_URL}/delivery/suggest?${params.toString()}`, { cache: 'no-store' });
    },
    geocodeDeliveryAddress: async (address) => {
        const params = new URLSearchParams({ address: String(address || '') });
        return fetchJson(`${API_URL}/delivery/geocode?${params.toString()}`, { cache: 'no-store' });
    },
    getDeliveryPaymentInfo: async (orderId) => {
        const params = new URLSearchParams({ orderId: String(orderId) });
        return fetchJson(`${API_URL}/payments/delivery?${params.toString()}`, { cache: 'no-store' });
    },
    createDeliveryAlfaPayment: async (orderId) => {
        return fetchJson(`${API_URL}/payments/delivery/alfa-register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orderId }),
        });
    },
    syncDeliveryAlfaPayment: async (orderId) => {
        const params = new URLSearchParams({ orderId: String(orderId) });
        return fetchJson(`${API_URL}/payments/delivery/alfa-status?${params.toString()}`, { cache: 'no-store' });
    },
};
