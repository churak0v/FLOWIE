import React, { createContext, useContext, useEffect, useMemo, useReducer, useRef } from 'react';
import { getTelegramUserSafe } from '../telegram';
import { api } from '../api';
import { isCacheFresh, readCacheEntry, writeCacheEntry } from '../lib/persistedCache';
import { prefetchImages } from '../lib/prefetch';
import { toUiComposition, toUiSize } from '../lib/productUi';
import { COLLECTIONS, PRODUCTS, SCENARIOS, UPSELLS } from '../data/mock';

const STORAGE_KEY = 'flowie_state_v1';
const storageKeyForUser = (me) => {
  const id = me?.id ? String(me.id) : 'guest';
  return `${STORAGE_KEY}_u_${id}`;
};

function safeJsonParse(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

const initialState = {
  auth: {
    telegramUser: null,
    bonusBalance: 0,
    me: null, // { id, telegramId?, name?, username?, phone? }
    meLoading: false,
  },

  products: {
    items: [],
    loading: false,
    error: '',
  },

  upsells: {
    items: [],
    loading: false,
    error: '',
  },

  collections: {
    items: [], // thematic
    scenarios: [],
    loading: false,
    error: '',
  },

  delivery: {
    locationRequested: false,
    coords: null, // { lat, lon }
    address: {
      street: '',
      house: '',
    },
  },

  recipients: {
    items: [],
    selectedId: null,
  },

  favorites: {
    productIds: [],
  },

  orders: {
    activeOrderId: null,
    activeOrderExpiresAt: null,
    activeOrderPreview: null,
  },

  cart: {
    items: [],
    floristComment: '',
    upsells: {}, // { [upsellId]: qty }
    useBonuses: false,
  },

  checkout: {
    recipientId: null,

    askRecipientAddress: false,
    address: {
      street: '',
      house: '',
      flat: '',
      floor: '',
      entrance: '',
      comment: '',
    },

    askRecipientTime: false,
    deliveryDate: '',
    deliveryTime: '',

    paymentMethod: 'stars',
  },
};

function reducer(state, action) {
  switch (action.type) {
    case 'HYDRATE': {
      const savedDelivery = action.payload?.delivery || {};
      // Older builds stored delivery `zone` in localStorage. Ignore it.
      // eslint-disable-next-line no-unused-vars
      const { zone, ...deliveryRest } = savedDelivery || {};
      return {
        ...state,
        delivery: {
          ...state.delivery,
          ...(deliveryRest || {}),
        },
        favorites: {
          ...state.favorites,
          ...(action.payload?.favorites || {}),
        },
        cart: {
          ...state.cart,
          ...(action.payload?.cart || {}),
        },
        orders: {
          ...state.orders,
          ...(action.payload?.orders || {}),
        },
      };
    }

    case 'AUTH_SET_TG_USER': {
      return {
        ...state,
        auth: { ...state.auth, telegramUser: action.user || null },
      };
    }

    case 'AUTH_ME_LOADING': {
      return { ...state, auth: { ...state.auth, meLoading: true } };
    }

    case 'AUTH_ME_SET': {
      return { ...state, auth: { ...state.auth, me: action.me || null, meLoading: false } };
    }

    case 'PRODUCTS_LOADING': {
      return { ...state, products: { ...state.products, loading: true, error: '' } };
    }

    case 'PRODUCTS_SET': {
      return { ...state, products: { items: action.items || [], loading: false, error: '' } };
    }

    case 'PRODUCTS_ERROR': {
      return { ...state, products: { ...state.products, loading: false, error: action.error || 'LOAD_FAILED' } };
    }

    case 'UPSELLS_LOADING': {
      return { ...state, upsells: { ...state.upsells, loading: true, error: '' } };
    }

    case 'UPSELLS_SET': {
      return { ...state, upsells: { items: action.items || [], loading: false, error: '' } };
    }

    case 'UPSELLS_ERROR': {
      return { ...state, upsells: { ...state.upsells, loading: false, error: action.error || 'LOAD_FAILED' } };
    }

    case 'COLLECTIONS_LOADING': {
      return { ...state, collections: { ...state.collections, loading: true, error: '' } };
    }

    case 'COLLECTIONS_SET': {
      return {
        ...state,
        collections: {
          items: action.items || [],
          scenarios: action.scenarios || [],
          loading: false,
          error: '',
        },
      };
    }

    case 'COLLECTIONS_ERROR': {
      return { ...state, collections: { ...state.collections, loading: false, error: action.error || 'LOAD_FAILED' } };
    }

    case 'DELIVERY_SET_ADDRESS': {
      const patch = action.patch || {};
      const nextAddress = {
        ...state.delivery.address,
        ...(patch.address || patch),
      };

      // Keep checkout pre-filled for convenience.
      const nextCheckoutAddress = {
        ...state.checkout.address,
        street: nextAddress.street ?? state.checkout.address.street,
        house: nextAddress.house ?? state.checkout.address.house,
      };

      return {
        ...state,
        delivery: { ...state.delivery, address: nextAddress },
        checkout: { ...state.checkout, address: nextCheckoutAddress },
      };
    }

    case 'DELIVERY_SET_COORDS': {
      const coords = action.coords || null;
      return {
        ...state,
        delivery: {
          ...state.delivery,
          locationRequested: true,
          coords,
        },
      };
    }

    case 'DELIVERY_MARK_LOCATION_REQUESTED': {
      return { ...state, delivery: { ...state.delivery, locationRequested: true } };
    }

    case 'RECIPIENTS_SET': {
      const items = Array.isArray(action.items) ? action.items : [];
      const hasId = (id) => items.some((r) => Number(r?.id) === Number(id));
      const selectedId = hasId(state.recipients.selectedId) ? state.recipients.selectedId : (items[0]?.id ?? null);
      const checkoutRecipientId = hasId(state.checkout.recipientId) ? state.checkout.recipientId : selectedId;
      return {
        ...state,
        recipients: { items, selectedId },
        checkout: { ...state.checkout, recipientId: checkoutRecipientId },
      };
    }

    case 'RECIPIENT_ADD': {
      const id = action.id ?? Date.now();
      const next = {
        id,
        name: action.name?.trim() || 'Recipient',
        handle: action.handle?.trim() || '',
        phone: action.phone?.trim() || '',
        relation: action.relation?.trim() || '',
        address: action.address?.trim() || '',
        birthDate: action.birthDate?.trim() || '',
        image: action.image?.trim() || '',
        isFavorite: true,
      };
      const items = [next, ...state.recipients.items];
      return {
        ...state,
        recipients: {
          ...state.recipients,
          items,
          selectedId: id,
        },
        checkout: {
          ...state.checkout,
          recipientId: id,
        },
      };
    }

    case 'RECIPIENT_UPDATE': {
      const items = state.recipients.items.map((r) => (r.id === action.id ? { ...r, ...action.patch } : r));
      return { ...state, recipients: { ...state.recipients, items } };
    }

    case 'RECIPIENT_REMOVE': {
      const items = state.recipients.items.filter((r) => r.id !== action.id);
      const selectedId = state.recipients.selectedId === action.id ? (items[0]?.id ?? null) : state.recipients.selectedId;
      const checkoutRecipientId =
        state.checkout.recipientId === action.id ? (items[0]?.id ?? null) : state.checkout.recipientId;
      return {
        ...state,
        recipients: { ...state.recipients, items, selectedId },
        checkout: { ...state.checkout, recipientId: checkoutRecipientId },
        cart: {
          ...state.cart,
          // cart items are product-based; keep as-is
          items: state.cart.items,
        },
      };
    }

    case 'RECIPIENT_SELECT': {
      return {
        ...state,
        recipients: { ...state.recipients, selectedId: action.id },
        checkout: { ...state.checkout, recipientId: action.id },
      };
    }

    case 'FAVORITES_TOGGLE_PRODUCT': {
      const has = state.favorites.productIds.includes(action.productId);
      const productIds = has
        ? state.favorites.productIds.filter((id) => id !== action.productId)
        : [action.productId, ...state.favorites.productIds];
      return { ...state, favorites: { ...state.favorites, productIds } };
    }

    case 'CART_ADD_ITEM': {
      const productId = action.productId;
      const qty = clamp(Number(action.qty ?? 1), 1, 99);
      const idx = state.cart.items.findIndex((i) => String(i.productId) === String(productId));
      const items = idx === -1
        ? [...state.cart.items, { productId, qty }]
        : state.cart.items.map((i, j) => (j === idx ? { ...i, qty: clamp(i.qty + qty, 1, 99) } : i));
      return { ...state, cart: { ...state.cart, items } };
    }

    case 'CART_SET_QTY': {
      const items = state.cart.items
        .map((i) => (String(i.productId) === String(action.productId) ? { ...i, qty: clamp(action.qty, 1, 99) } : i))
        .filter((i) => i.qty > 0);
      return { ...state, cart: { ...state.cart, items } };
    }

    case 'CART_REMOVE_ITEM': {
      const items = state.cart.items.filter((i) => String(i.productId) !== String(action.productId));
      return { ...state, cart: { ...state.cart, items } };
    }

    case 'CART_PRUNE_ITEMS': {
      const canonicalByKey = new Map((action.productIds || []).map((id) => [String(id), id]));
      const byProduct = new Map();

      for (const item of state.cart.items || []) {
        const canonicalId = canonicalByKey.get(String(item.productId));
        if (canonicalId == null) continue;
        const prev = byProduct.get(String(canonicalId)) || { productId: canonicalId, qty: 0 };
        byProduct.set(String(canonicalId), {
          productId: canonicalId,
          qty: clamp(Number(prev.qty || 0) + Number(item.qty || 0), 1, 99),
        });
      }

      const items = [...byProduct.values()];
      if (items.length === state.cart.items.length && items.every((it, idx) => (
        String(it.productId) === String(state.cart.items[idx]?.productId) && Number(it.qty) === Number(state.cart.items[idx]?.qty)
      ))) {
        return state;
      }
      return { ...state, cart: { ...state.cart, items } };
    }

    case 'CART_SET_FLORIST_COMMENT': {
      return { ...state, cart: { ...state.cart, floristComment: String(action.value ?? '') } };
    }

    case 'CART_SET_UPSELL_QTY': {
      const upsells = { ...state.cart.upsells };
      const qty = clamp(Number(action.qty ?? 0), 0, 99);
      if (qty <= 0) delete upsells[action.upsellId];
      else upsells[action.upsellId] = qty;
      return { ...state, cart: { ...state.cart, upsells } };
    }

    case 'CART_TOGGLE_BONUSES': {
      return { ...state, cart: { ...state.cart, useBonuses: !state.cart.useBonuses } };
    }

    case 'CART_CLEAR': {
      return {
        ...state,
        cart: { ...initialState.cart },
      };
    }

    case 'CHECKOUT_TOGGLE_ASK_ADDRESS': {
      return { ...state, checkout: { ...state.checkout, askRecipientAddress: !state.checkout.askRecipientAddress } };
    }

    case 'CHECKOUT_SET_ADDRESS': {
      return {
        ...state,
        checkout: { ...state.checkout, address: { ...state.checkout.address, ...action.patch } },
      };
    }

    case 'CHECKOUT_TOGGLE_ASK_TIME': {
      return { ...state, checkout: { ...state.checkout, askRecipientTime: !state.checkout.askRecipientTime } };
    }

    case 'CHECKOUT_SET_TIME': {
      return { ...state, checkout: { ...state.checkout, deliveryDate: action.date, deliveryTime: action.time } };
    }

    case 'CHECKOUT_SET_PAYMENT_METHOD': {
      return { ...state, checkout: { ...state.checkout, paymentMethod: action.method } };
    }

    case 'RESET_PERSISTED': {
      return {
        ...state,
        delivery: { ...initialState.delivery },
        favorites: { ...initialState.favorites },
        cart: { ...initialState.cart },
        orders: { ...initialState.orders },
      };
    }

    case 'ORDER_SET_ACTIVE': {
      const nextId = action.id ?? null;
      const prevPreview = state.orders.activeOrderPreview;
      const nextPreview =
        action.preview != null
          ? action.preview
          : (prevPreview && nextId != null && String(prevPreview.id) === String(nextId) ? prevPreview : null);

      return {
        ...state,
        orders: {
          ...state.orders,
          activeOrderId: nextId,
          activeOrderExpiresAt: action.expiresAt ?? null,
          activeOrderPreview: nextId == null ? null : nextPreview,
        },
      };
    }

    case 'ORDER_CLEAR_ACTIVE': {
      return { ...state, orders: { ...state.orders, activeOrderId: null, activeOrderExpiresAt: null, activeOrderPreview: null } };
    }

    default:
      return state;
  }
}

const AppStateContext = createContext(null);

export function AppStateProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const storageKeyRef = useRef(STORAGE_KEY);

  // Hydrate persisted slices
  useEffect(() => {
    const raw = localStorage.getItem(storageKeyRef.current);
    const saved = raw ? safeJsonParse(raw) : null;
    if (saved) {
      dispatch({ type: 'HYDRATE', payload: saved });
    }
  }, []);

  // Persist cart + favorites + delivery (recipients are DB-backed).
  useEffect(() => {
    const payload = {
      delivery: state.delivery,
      favorites: { productIds: state.favorites.productIds },
      cart: {
        items: state.cart.items,
        floristComment: state.cart.floristComment,
        upsells: state.cart.upsells,
        useBonuses: state.cart.useBonuses,
      },
      orders: {
        activeOrderId: state.orders.activeOrderId,
        activeOrderExpiresAt: state.orders.activeOrderExpiresAt,
        activeOrderPreview: state.orders.activeOrderPreview,
      },
    };
    localStorage.setItem(storageKeyRef.current, JSON.stringify(payload));
  }, [state.cart, state.delivery, state.favorites, state.orders]);

  // When authenticated user changes, switch persisted namespace to avoid mixing profiles.
  useEffect(() => {
    const key = storageKeyForUser(state.auth.me);
    if (key === storageKeyRef.current) return;
    storageKeyRef.current = key;
    const saved = safeJsonParse(localStorage.getItem(key) || '');
    if (saved) {
      dispatch({ type: 'HYDRATE', payload: saved });
    } else {
      dispatch({ type: 'RESET_PERSISTED' });
    }
  }, [state.auth.me]);

  // Telegram user for display (doesn't block UI)
  useEffect(() => {
    const tgUser = getTelegramUserSafe();
    if (tgUser) dispatch({ type: 'AUTH_SET_TG_USER', user: tgUser });
  }, []);

  const actions = useMemo(() => {
    const toUiProduct = (p) => {
      const basePrice = Number(p.price || 0);
      const discount = Number(p.discount || 0);
      const finalPrice = Math.max(0, basePrice - discount);
      const cover = String(p.image || '').trim();
      const gallery = Array.isArray(p.images) ? p.images.map((x) => x?.url).filter(Boolean) : [];
      const images = [];
      const seen = new Set();
      for (const url of [cover, ...gallery]) {
        const u = String(url || '').trim();
        if (!u || seen.has(u)) continue;
        seen.add(u);
        images.push(u);
      }

      return {
        id: Number(p.id),
        title: String(p.name || ''),
        subtitle: '',
        price: finalPrice,
        basePrice,
        discount,
        image: cover || images[0] || '',
        images,
        description: p.description || '',
        composition: toUiComposition(p.composition),
        size: toUiSize(p.width, p.height),
        categoryId: p.categoryId ?? null,
      };
    };

    const loadRecipients = async () => {
      try {
        const res = await api.getRecipients();
        const items = Array.isArray(res?.recipients) ? res.recipients : [];
        dispatch({ type: 'RECIPIENTS_SET', items });
        prefetchImages(items.map((r) => r?.image).filter(Boolean), { max: 10 });
        return items;
      } catch {
        // Non-fatal (guest mode or not logged in yet).
        return [];
      }
    };

    return {
      // auth
      setTelegramUser: (user) => dispatch({ type: 'AUTH_SET_TG_USER', user }),
      loadMe: async () => {
        dispatch({ type: 'AUTH_ME_LOADING' });
        try {
          const res = await api.getMe();
          dispatch({ type: 'AUTH_ME_SET', me: res?.user || null });
          // Recipients are user-scoped on the server, so load them after auth is known.
          await loadRecipients();
          return res?.user || null;
        } catch (e) {
          // Keep it non-fatal: the app can run in "guest" mode as well.
          dispatch({ type: 'AUTH_ME_SET', me: null });
          return null;
        }
      },
      setActiveOrder: (id, expiresAt, preview) => dispatch({ type: 'ORDER_SET_ACTIVE', id, expiresAt, preview }),
      clearActiveOrder: () => dispatch({ type: 'ORDER_CLEAR_ACTIVE' }),
      updateMyPhone: async (phone) => {
        const res = await api.updateMe({ phone });
        dispatch({ type: 'AUTH_ME_SET', me: res?.user || null });
        return res?.user || null;
      },
      setMyPhone: async (phone) => {
        try {
          const res = await api.updateMe({ phone });
          dispatch({ type: 'AUTH_ME_SET', me: res?.user || null });
          return res?.user || null;
        } catch {
          return null;
        }
      },
      setConsent: async (consent) => {
        try {
          const res = await api.updateMe({ consentPersonal: Boolean(consent) });
          dispatch({ type: 'AUTH_ME_SET', me: res?.user || null });
          return res?.user || null;
        } catch {
          return null;
        }
      },

      // products
      loadProducts: async () => {
        const cacheKey = 'products_ui_v10';
        const cached = readCacheEntry(cacheKey);
        const cachedItems = Array.isArray(cached?.data) ? cached.data : null;
        if (cachedItems?.length) {
          dispatch({ type: 'PRODUCTS_SET', items: cachedItems });
          prefetchImages(cachedItems.map((p) => p?.image).filter(Boolean), { max: 10 });
        }

        if (cachedItems?.length && isCacheFresh(cached, 60_000)) return;

        dispatch({ type: 'PRODUCTS_LOADING' });
        try {
          const raw = await api.getProducts();
          const items = Array.isArray(raw)
            ? raw.map(toUiProduct)
            : [];
          const normalized = items.filter((x) => Number.isFinite(x.id));
          dispatch({ type: 'PRODUCTS_SET', items: normalized });
          writeCacheEntry(cacheKey, normalized);
          prefetchImages(normalized.map((p) => p?.image).filter(Boolean), { max: 10 });
        } catch (e) {
          dispatch({ type: 'PRODUCTS_SET', items: PRODUCTS });
          prefetchImages(PRODUCTS.map((p) => p?.image).filter(Boolean), { max: 10 });
        }
      },

      // upsells (additional products in cart)
      loadUpsells: async () => {
        const cacheKey = 'upsells_ui_v5';
        const cached = readCacheEntry(cacheKey);
        const cachedItems = Array.isArray(cached?.data) ? cached.data : null;
        if (cachedItems?.length) dispatch({ type: 'UPSELLS_SET', items: cachedItems });
        if (cachedItems?.length && isCacheFresh(cached, 60_000)) return;

        dispatch({ type: 'UPSELLS_LOADING' });
        try {
          const raw = await api.getUpsells();
          const items = Array.isArray(raw) ? raw.map(toUiProduct) : [];
          const normalized = items.filter((x) => Number.isFinite(x.id));
          dispatch({ type: 'UPSELLS_SET', items: normalized });
          writeCacheEntry(cacheKey, normalized);
        } catch (e) {
          dispatch({ type: 'UPSELLS_SET', items: UPSELLS.map((u) => ({
            id: u.id,
            title: u.title,
            subtitle: u.isFree ? 'Included' : 'Add-on',
            price: u.price,
            image: u.imageUrl,
            images: [u.imageUrl].filter(Boolean),
            description: '',
            composition: [],
            size: '',
          })) });
        }
      },

      // collections + scenarios
      loadCollections: async () => {
        const cacheKey = 'collections_v6';
        const cached = readCacheEntry(cacheKey);
        const cachedData = cached?.data || null;
        if (cachedData && typeof cachedData === 'object') {
          const items = Array.isArray(cachedData.items) ? cachedData.items : [];
          const scenarios = Array.isArray(cachedData.scenarios) ? cachedData.scenarios : [];
          if (items.length || scenarios.length) dispatch({ type: 'COLLECTIONS_SET', items, scenarios });
        }
        if (cachedData && isCacheFresh(cached, 60_000)) return;

        dispatch({ type: 'COLLECTIONS_LOADING' });
        try {
          const res = await api.getCollections();
          const items = Array.isArray(res?.collections) ? res.collections : [];
          const scenarios = Array.isArray(res?.scenarios) ? res.scenarios : [];
          dispatch({ type: 'COLLECTIONS_SET', items, scenarios });
          writeCacheEntry(cacheKey, { items, scenarios });
        } catch (e) {
          dispatch({ type: 'COLLECTIONS_SET', items: COLLECTIONS, scenarios: SCENARIOS });
        }
      },

      // recipients
      loadRecipients,
      addLocalRecipient: (payload) => dispatch({
        type: 'RECIPIENT_ADD',
        id: payload?.id,
        name: payload?.name,
        handle: payload?.handle,
        phone: payload?.phone,
        relation: payload?.relation,
        address: payload?.address,
        birthDate: payload?.birthDate,
        image: payload?.image,
      }),
      addRecipient: async (payload) => {
        const res = await api.createRecipient(payload || {});
        await loadRecipients();
        if (res?.recipient?.id != null) dispatch({ type: 'RECIPIENT_SELECT', id: res.recipient.id });
        return res?.recipient || null;
      },
      updateRecipient: async (id, patch) => {
        const res = await api.updateRecipient(id, patch || {});
        await loadRecipients();
        return res?.recipient || null;
      },
      removeRecipient: async (id) => {
        const res = await api.deleteRecipient(id);
        await loadRecipients();
        return res || null;
      },
      selectRecipient: (id) => dispatch({ type: 'RECIPIENT_SELECT', id }),

      // delivery
      setDeliveryAddress: (patch) => dispatch({ type: 'DELIVERY_SET_ADDRESS', patch }),
      setDeliveryCoords: (coords) => dispatch({ type: 'DELIVERY_SET_COORDS', coords }),
      markLocationRequested: () => dispatch({ type: 'DELIVERY_MARK_LOCATION_REQUESTED' }),

      // favorites
      toggleFavoriteProduct: (productId) => dispatch({ type: 'FAVORITES_TOGGLE_PRODUCT', productId }),

      // cart
      addToCart: (productId, qty = 1) => dispatch({ type: 'CART_ADD_ITEM', productId, qty }),
      setCartQty: (productId, qty) => dispatch({ type: 'CART_SET_QTY', productId, qty }),
      removeFromCart: (productId) => dispatch({ type: 'CART_REMOVE_ITEM', productId }),
      pruneCartItems: (productIds) => dispatch({ type: 'CART_PRUNE_ITEMS', productIds }),
      setFloristComment: (value) => dispatch({ type: 'CART_SET_FLORIST_COMMENT', value }),
      setUpsellQty: (upsellId, qty) => dispatch({ type: 'CART_SET_UPSELL_QTY', upsellId, qty }),
      toggleBonuses: () => dispatch({ type: 'CART_TOGGLE_BONUSES' }),
      clearCart: () => dispatch({ type: 'CART_CLEAR' }),

      // checkout
      toggleAskAddress: () => dispatch({ type: 'CHECKOUT_TOGGLE_ASK_ADDRESS' }),
      setAddress: (patch) => dispatch({ type: 'CHECKOUT_SET_ADDRESS', patch }),
      toggleAskTime: () => dispatch({ type: 'CHECKOUT_TOGGLE_ASK_TIME' }),
      setDeliveryTime: ({ date, time }) => dispatch({ type: 'CHECKOUT_SET_TIME', date, time }),
      setPaymentMethod: (method) => dispatch({ type: 'CHECKOUT_SET_PAYMENT_METHOD', method }),
    };
  }, []);

  const selectors = useMemo(() => {
    const cartCount = state.cart.items.reduce((sum, i) => sum + i.qty, 0);
    return { cartCount };
  }, [state.cart.items]);

  const value = useMemo(() => ({ state, actions, selectors }), [actions, selectors, state]);

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState() {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error('useAppState must be used within AppStateProvider');
  return ctx;
}
