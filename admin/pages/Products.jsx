import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { adminApi } from '../lib/adminApi';
import { prefetchImages } from '../../src/lib/prefetch';
import { Surface } from '../../src/components/ui/Surface';
import { Text } from '../../src/components/ui/Text';
import { AppImage } from '../../src/components/ui/AppImage';

const PRODUCTS_CACHE = {
  items: null,
};

function Toggle({ checked, onChange }) {
  return (
    <button
      type="button"
      onClick={onChange}
      aria-pressed={checked}
      style={{
        width: 44,
        height: 26,
        borderRadius: 'var(--r-pill)',
        border: 0,
        background: checked ? 'var(--text)' : 'var(--c-ink-18)',
        position: 'relative',
        cursor: 'pointer',
        flexShrink: 0,
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 3,
          left: 3,
          width: 20,
          height: 20,
          borderRadius: 'var(--r-pill)',
          background: 'var(--c-white)',
          transform: checked ? 'translateX(18px)' : 'translateX(0)',
          transition: 'transform 120ms ease',
        }}
      />
    </button>
  );
}

export function ProductsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const qs = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const kind = (qs.get('kind') || 'main').toLowerCase() === 'upsell' ? 'upsell' : 'main';

  const [items, setItems] = useState(() => PRODUCTS_CACHE.items || []);
  const [busy, setBusy] = useState(() => !(PRODUCTS_CACHE.items || []).length);
  const [error, setError] = useState('');
  const orderSavingRef = useRef(false);
  const [orderSaving, setOrderSaving] = useState(false);

  const activeCount = useMemo(() => items.filter((p) => p.isActive).length, [items]);

  async function moveProduct(productId, delta) {
    if (orderSavingRef.current) return;

    const fromIndex = items.findIndex((x) => x.id === productId);
    if (fromIndex < 0) return;
    const toIndex = fromIndex + delta;
    if (toIndex < 0 || toIndex >= items.length) return;

    const next = items.slice();
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);

    PRODUCTS_CACHE.items = next;
    setItems(next);

    orderSavingRef.current = true;
    setOrderSaving(true);
    try {
      await adminApi.reorderProducts(kind, next.map((x) => x.id));
    } catch (e) {
      alert(e?.data?.error || e?.message || 'Не удалось сохранить порядок');
      await load({ force: true, silent: true });
    } finally {
      orderSavingRef.current = false;
      setOrderSaving(false);
    }
  }

  async function load(opts = {}) {
    // Keep the list on screen when refreshing, so switching tabs doesn't flash skeletons.
    const { silent = false, ...apiOpts } = opts || {};
    if (!silent) setBusy(items.length === 0);
    if (!silent) setError('');
    try {
      const res = await adminApi.getProducts({ ...apiOpts, kind });
      const next = res?.products || [];
      PRODUCTS_CACHE.items = next;
      setItems(next);
    } catch (e) {
      if (!silent) setError(e?.data?.error || e?.message || 'Не удалось загрузить товары');
    } finally {
      if (!silent) setBusy(false);
    }
  }

  useEffect(() => {
    if ((PRODUCTS_CACHE.items || []).length) {
      setItems(PRODUCTS_CACHE.items || []);
      setBusy(false);
      load({ silent: true });
      return;
    }
    load();
  }, [kind]);

  useEffect(() => {
    if (!items.length) return;
    prefetchImages(items.map((p) => p?.image).filter(Boolean), { max: 12 });
  }, [items]);

  return (
    <div style={{ paddingBottom: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
        <Text variant="title">{kind === 'upsell' ? 'Апсейлы' : 'Товары'}</Text>
        <div style={{ display: 'flex', gap: 12, alignItems: 'baseline' }}>
          <button
            type="button"
            onClick={() => navigate('/collections')}
            style={{ border: 0, background: 'transparent', cursor: 'pointer', color: 'var(--muted)', fontWeight: 900 }}
          >
            Подборки
          </button>
          <button
            type="button"
            onClick={() => load({ force: true })}
            style={{ border: 0, background: 'transparent', cursor: 'pointer', color: 'var(--muted)', fontWeight: 900 }}
          >
            Обновить
          </button>
        </div>
      </div>

      <div style={{ marginTop: 12, display: 'flex', gap: 10 }}>
        <button
          type="button"
          onClick={() => navigate('/products?kind=main')}
          style={{
            height: 38,
            padding: '0 14px',
            borderRadius: 'var(--r-pill)',
            border: '1px solid var(--border)',
            background: kind === 'main' ? 'var(--text)' : 'transparent',
            color: kind === 'main' ? 'var(--c-white)' : 'var(--text)',
            fontWeight: 1000,
            cursor: 'pointer',
          }}
        >
          Товары
        </button>
        <button
          type="button"
          onClick={() => navigate('/products?kind=upsell')}
          style={{
            height: 38,
            padding: '0 14px',
            borderRadius: 'var(--r-pill)',
            border: '1px solid var(--border)',
            background: kind === 'upsell' ? 'var(--text)' : 'transparent',
            color: kind === 'upsell' ? 'var(--c-white)' : 'var(--text)',
            fontWeight: 1000,
            cursor: 'pointer',
          }}
        >
          Апсейлы
        </button>
      </div>

      <div style={{ marginTop: 10 }}>
        <Text variant="caption">
          Активно: {activeCount} из {items.length}
        </Text>
        {orderSaving ? (
          <div style={{ marginTop: 4 }}>
            <Text variant="caption" muted>
              Сохраняем порядок…
            </Text>
          </div>
        ) : null}
      </div>

      {busy ? (
        <div style={{ marginTop: 16 }}>
          <Surface variant="soft" style={{ padding: 16, borderRadius: 'var(--r-lg)' }}>
            <Text variant="subtitle">Загружаем…</Text>
          </Surface>
        </div>
      ) : error ? (
        <div style={{ marginTop: 16 }}>
          <Surface variant="soft" style={{ padding: 16, borderRadius: 'var(--r-lg)' }}>
            <Text variant="subtitle">Ошибка</Text>
            <div style={{ marginTop: 6 }}>
              <Text variant="body" muted>
                {error}
              </Text>
            </div>
          </Surface>
        </div>
      ) : (
        <div style={{ marginTop: 16, display: 'grid', gap: 12 }}>
          {items.map((p, idx) => (
            <Surface
              key={p.id}
              variant="soft"
              onClick={() => navigate(`/products/${p.id}`)}
              style={{
                padding: 12,
                borderRadius: 'var(--r-lg)',
                cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', gap: 12 }}>
                <div
                  style={{
                    width: 86,
                    height: 86,
                    borderRadius: 26,
                    overflow: 'hidden',
                    border: '1px solid var(--border)',
                    background: 'var(--surface)',
                    flexShrink: 0,
                  }}
                >
                  <AppImage src={p.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <Text variant="subtitle" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {p.name}
                  </Text>
                  <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                    <div style={{ fontWeight: 1000, color: 'var(--text)', whiteSpace: 'nowrap' }}>{p.price} ₽</div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <button
                        type="button"
                        aria-label="Переместить вверх"
                        title="Вверх"
                        disabled={orderSaving || idx === 0}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          moveProduct(p.id, -1);
                        }}
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 12,
                          border: '1px solid var(--border)',
                          background: 'var(--c-white)',
                          color: 'var(--text)',
                          display: 'grid',
                          placeItems: 'center',
                          cursor: orderSaving || idx === 0 ? 'default' : 'pointer',
                          opacity: orderSaving || idx === 0 ? 0.35 : 1,
                        }}
                      >
                        <ChevronUp size={16} />
                      </button>
                      <button
                        type="button"
                        aria-label="Переместить вниз"
                        title="Вниз"
                        disabled={orderSaving || idx === items.length - 1}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          moveProduct(p.id, +1);
                        }}
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 12,
                          border: '1px solid var(--border)',
                          background: 'var(--c-white)',
                          color: 'var(--text)',
                          display: 'grid',
                          placeItems: 'center',
                          cursor: orderSaving || idx === items.length - 1 ? 'default' : 'pointer',
                          opacity: orderSaving || idx === items.length - 1 ? 0.35 : 1,
                        }}
                      >
                        <ChevronDown size={16} />
                      </button>
                      <Toggle
                        checked={Boolean(p.isActive)}
                        onChange={async (e) => {
                          e?.stopPropagation?.();
                          const next = !p.isActive;
                          setItems((prev) => prev.map((x) => (x.id === p.id ? { ...x, isActive: next } : x)));
                          try {
                            await adminApi.updateProduct(p.id, { isActive: next });
                          } catch (err) {
                            // rollback
                            setItems((prev) => prev.map((x) => (x.id === p.id ? { ...x, isActive: p.isActive } : x)));
                            alert(err?.data?.error || err?.message || 'Не удалось обновить');
                          }
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </Surface>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => navigate(`/products/new${kind === 'upsell' ? '?kind=upsell' : ''}`)}
        style={{
          position: 'fixed',
          right: 'calc(var(--sp-4) + var(--app-inset-right))',
          bottom: 'calc(var(--app-bottom-nav-space) + var(--app-nav-inset-bottom) - var(--app-keyboard-offset))',
          height: 54,
          padding: '0 18px',
          borderRadius: 'var(--r-pill)',
          border: 0,
          background: 'var(--text)',
          color: 'var(--c-white)',
          boxShadow: 'var(--shadow-2)',
          fontWeight: 900,
          cursor: 'pointer',
          zIndex: 70,
        }}
      >
        + Создать товар
      </button>
    </div>
  );
}
