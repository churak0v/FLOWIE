import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminApi } from '../lib/adminApi';
import { Surface } from '../../src/components/ui/Surface';
import { Text } from '../../src/components/ui/Text';
import { AppImage } from '../../src/components/ui/AppImage';

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

function typeLabel(t) {
  return String(t) === 'scenario' ? 'Сценарий' : 'Подборка';
}

export function CollectionsPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    setBusy(true);
    setError('');
    try {
      const res = await adminApi.getCollections();
      setItems(res?.collections || []);
    } catch (e) {
      setError(e?.data?.error || e?.message || 'Не удалось загрузить подборки');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const activeCount = useMemo(() => items.filter((c) => c.isActive).length, [items]);

  return (
    <div style={{ paddingBottom: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
        <Text variant="title">Подборки</Text>
        <button
          type="button"
          onClick={load}
          style={{ border: 0, background: 'transparent', cursor: 'pointer', color: 'var(--muted)', fontWeight: 900 }}
        >
          Обновить
        </button>
      </div>

      <div style={{ marginTop: 10 }}>
        <Text variant="caption">
          Активно: {activeCount} из {items.length}
        </Text>
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
      ) : items.length === 0 ? (
        <div style={{ marginTop: 16 }}>
          <Surface variant="soft" style={{ padding: 16, borderRadius: 'var(--r-lg)' }}>
            <Text variant="subtitle">Пока пусто</Text>
            <div style={{ marginTop: 6 }}>
              <Text variant="body" muted>
                Создайте первую подборку и добавьте в нее товары.
              </Text>
            </div>
          </Surface>
        </div>
      ) : (
        <div style={{ marginTop: 16, display: 'grid', gap: 12 }}>
          {items.map((c) => {
            const preview = (c.items || []).slice(0, 3).map((it) => it.product?.image).filter(Boolean);
            return (
              <Surface
                key={c.id}
                variant="soft"
                onClick={() => navigate(`/collections/${c.id}`)}
                style={{ padding: 14, borderRadius: 'var(--r-lg)', cursor: 'pointer' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ minWidth: 0 }}>
                    <Text variant="subtitle" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {c.title}
                    </Text>
                    <div style={{ marginTop: 6, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                      <span className="ui-chip" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                        {typeLabel(c.type)}
                      </span>
                      <Text variant="caption">Товаров: {(c.items || []).length}</Text>
                    </div>
                  </div>

                  <Toggle
                    checked={Boolean(c.isActive)}
                    onChange={async (e) => {
                      e?.stopPropagation?.();
                      const next = !c.isActive;
                      setItems((prev) => prev.map((x) => (x.id === c.id ? { ...x, isActive: next } : x)));
                      try {
                        await adminApi.updateCollection(c.id, { isActive: next });
                      } catch (err) {
                        setItems((prev) => prev.map((x) => (x.id === c.id ? { ...x, isActive: c.isActive } : x)));
                        alert(err?.data?.error || err?.message || 'Не удалось обновить');
                      }
                    }}
                  />
                </div>

                {preview.length ? (
                  <div style={{ marginTop: 12, display: 'flex', gap: 10 }}>
                    {preview.map((url, idx) => (
                      <AppImage
                        key={`${url}-${idx}`}
                        src={url}
                        alt=""
                        style={{ width: 56, height: 56, borderRadius: 18, objectFit: 'cover', border: '1px solid var(--border)' }}
                      />
                    ))}
                  </div>
                ) : null}
              </Surface>
            );
          })}
        </div>
      )}

      <button
        type="button"
        onClick={() => navigate('/collections/new')}
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
        + Создать подборку
      </button>
    </div>
  );
}
