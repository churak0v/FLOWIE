import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, Save } from 'lucide-react';
import { adminApi } from '../lib/adminApi';
import { Surface } from '../../src/components/ui/Surface';
import { Text } from '../../src/components/ui/Text';

const inputStyle = {
  width: '100%',
  border: '1px solid var(--border)',
  borderRadius: 16,
  padding: 12,
  background: 'var(--c-white)',
};

function Field({ label, children }) {
  return (
    <div>
      <Text variant="caption">{label}</Text>
      <div style={{ marginTop: 6 }}>{children}</div>
    </div>
  );
}

function ProductRow({ product, onRemove, draggable, onDragStart, onDragOver, onDrop }) {
  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: 10,
        borderRadius: 18,
        border: '1px solid var(--border)',
        background: 'var(--surface)',
        cursor: draggable ? 'grab' : 'default',
      }}
      title={draggable ? 'Перетащите, чтобы изменить порядок' : undefined}
    >
      <img
        src={product.image}
        alt=""
        style={{ width: 54, height: 54, borderRadius: 18, objectFit: 'cover', border: '1px solid var(--border)' }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <Text variant="subtitle" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {product.name}
        </Text>
        <div style={{ marginTop: 4, display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
          <Text variant="caption">{product.id}</Text>
          <div style={{ fontWeight: 1000, color: 'var(--text)', whiteSpace: 'nowrap' }}>{product.price} ₽</div>
        </div>
      </div>
      <button
        type="button"
        onClick={onRemove}
        style={{
          height: 34,
          padding: '0 12px',
          borderRadius: 'var(--r-pill)',
          border: '1px solid var(--border)',
          background: 'transparent',
          cursor: 'pointer',
          fontWeight: 900,
          color: 'var(--muted)',
        }}
      >
        Убрать
      </button>
    </div>
  );
}

function CollectionForm({ mode, id }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [products, setProducts] = useState([]);
  const productsById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const [form, setForm] = useState({
    slug: '',
    title: '',
    type: 'thematic',
    description: '',
    isActive: true,
  });

  const [selectedIds, setSelectedIds] = useState([]);
  const [q, setQ] = useState('');
  const dragId = useRef(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    Promise.all([adminApi.getProducts(), mode === 'edit' ? adminApi.getCollection(id) : Promise.resolve(null)])
      .then(([pRes, cRes]) => {
        if (!alive) return;
        setProducts(pRes?.products || []);
        if (mode === 'edit') {
          const c = cRes?.collection;
          if (!c) throw new Error('NO_COLLECTION');
          setForm({
            slug: c.slug || '',
            title: c.title || '',
            type: c.type || 'thematic',
            description: c.description || '',
            isActive: Boolean(c.isActive),
          });
          const ids = (c.items || []).map((it) => it.productId).filter(Boolean);
          setSelectedIds(ids);
        } else {
          setLoading(false);
        }
      })
      .catch((e) => {
        if (!alive) return;
        setError(e?.data?.error || e?.message || 'Не удалось загрузить данные');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [id, mode]);

  const selectedProducts = useMemo(() => selectedIds.map((pid) => productsById.get(pid)).filter(Boolean), [productsById, selectedIds]);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const available = useMemo(() => {
    const s = q.trim().toLowerCase();
    return products
      .filter((p) => !selectedSet.has(p.id))
      .filter((p) => {
        if (!s) return true;
        return String(p.name || '').toLowerCase().includes(s) || String(p.id).includes(s);
      })
      .slice(0, 40);
  }, [products, q, selectedSet]);

  async function save() {
    setBusy(true);
    setError('');
    try {
      const title = form.title.trim();
      const slug = form.slug.trim();
      if (!title) throw new Error('Введите название');
      if (!['thematic', 'scenario'].includes(form.type)) throw new Error('Неверный тип');

      if (mode === 'new') {
        const created = await adminApi.createCollection({
          slug: slug || null,
          title,
          type: form.type,
          description: form.description || null,
          isActive: Boolean(form.isActive),
        });
        const newId = created?.collection?.id;
        if (!newId) throw new Error('Не удалось создать');
        await adminApi.setCollectionItems(newId, selectedIds);
        navigate('/collections');
        return;
      }

      await adminApi.updateCollection(id, {
        slug: slug || null,
        title,
        type: form.type,
        description: form.description || null,
        isActive: Boolean(form.isActive),
      });
      await adminApi.setCollectionItems(id, selectedIds);
      navigate('/collections');
    } catch (e) {
      setError(e?.data?.error || e?.message || 'Не удалось сохранить');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ paddingBottom: 0 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '36px 1fr 36px', alignItems: 'center', gap: 10 }}>
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label="Назад"
          className="ui-iconButton"
          style={{ background: 'var(--surface)' }}
        >
          <ChevronLeft size={22} />
        </button>
        <div style={{ textAlign: 'center', fontWeight: 1000, fontSize: 16 }}>
          {mode === 'new' ? 'Новая подборка' : `Подборка #${id}`}
        </div>
        <div />
      </div>

      {loading ? (
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
        <>
          <div style={{ marginTop: 16, display: 'grid', gap: 12 }}>
            <Surface variant="soft" style={{ padding: 14, borderRadius: 'var(--r-lg)' }}>
              <div style={{ display: 'grid', gap: 12 }}>
                <Field label="Slug (для ссылок)">
                  <input
                    value={form.slug}
                    onChange={(e) => setForm((p) => ({ ...p, slug: e.target.value }))}
                    placeholder="Например, bright"
                    style={inputStyle}
                  />
                </Field>

                <Field label="Название">
                  <input
                    value={form.title}
                    onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                    placeholder="Например, Композиции"
                    style={inputStyle}
                  />
                </Field>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <Field label="Тип">
                    <select value={form.type} onChange={(e) => setForm((p) => ({ ...p, type: e.target.value }))} style={inputStyle}>
                      <option value="thematic">Подборка</option>
                      <option value="scenario">Сценарий</option>
                    </select>
                  </Field>
                  <Field label="Активна">
                    <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 900 }}>
                      <input
                        type="checkbox"
                        checked={Boolean(form.isActive)}
                        onChange={(e) => setForm((p) => ({ ...p, isActive: e.target.checked }))}
                      />
                      Показана клиентам
                    </label>
                  </Field>
                </div>

                <Field label="Описание (опц.)">
                  <textarea
                    value={form.description}
                    onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                    placeholder="Коротко и по делу"
                    style={{ ...inputStyle, minHeight: 88, resize: 'vertical' }}
                  />
                </Field>
              </div>
            </Surface>

            <Surface variant="soft" style={{ padding: 14, borderRadius: 'var(--r-lg)' }}>
              <Text variant="subtitle">Товары в подборке</Text>
              <div style={{ marginTop: 10 }}>
                <Text variant="caption">Можно менять порядок drag-and-drop. Этот порядок увидит клиент.</Text>
              </div>

              <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
                {selectedProducts.length ? (
                  selectedProducts.map((p) => (
                    <ProductRow
                      key={p.id}
                      product={p}
                      draggable
                      onDragStart={() => {
                        dragId.current = p.id;
                      }}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => {
                        const from = dragId.current;
                        const to = p.id;
                        dragId.current = null;
                        if (!from || from === to) return;
                        setSelectedIds((prev) => {
                          const a = [...prev];
                          const fromIdx = a.findIndex((x) => x === from);
                          const toIdx = a.findIndex((x) => x === to);
                          if (fromIdx === -1 || toIdx === -1) return prev;
                          const [moved] = a.splice(fromIdx, 1);
                          a.splice(toIdx, 0, moved);
                          return a;
                        });
                      }}
                      onRemove={() => setSelectedIds((prev) => prev.filter((x) => x !== p.id))}
                    />
                  ))
                ) : (
                  <Surface variant="soft" style={{ padding: 14, borderRadius: 'var(--r-lg)' }}>
                    <Text variant="body" muted>
                      Пока нет товаров. Добавьте ниже.
                    </Text>
                  </Surface>
                )}
              </div>

              <div style={{ marginTop: 16 }}>
                <Text variant="subtitle">Добавить товары</Text>
                <div style={{ marginTop: 10 }}>
                  <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск по названию или ID…" style={inputStyle} />
                </div>
                <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
                  {available.map((p) => (
                    <div
                      key={p.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: 10,
                        borderRadius: 18,
                        border: '1px solid var(--border)',
                        background: 'transparent',
                      }}
                    >
                      <img
                        src={p.image}
                        alt=""
                        style={{ width: 46, height: 46, borderRadius: 16, objectFit: 'cover', border: '1px solid var(--border)' }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <Text variant="subtitle" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {p.name}
                        </Text>
                        <div style={{ marginTop: 4, display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                          <Text variant="caption">#{p.id}</Text>
                          <div style={{ fontWeight: 1000, color: 'var(--text)', whiteSpace: 'nowrap' }}>{p.price} ₽</div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedIds((prev) => [...prev, p.id])}
                        style={{
                          height: 34,
                          padding: '0 12px',
                          borderRadius: 'var(--r-pill)',
                          border: 0,
                          background: 'var(--text)',
                          color: 'var(--c-white)',
                          cursor: 'pointer',
                          fontWeight: 900,
                        }}
                      >
                        +
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </Surface>
          </div>

          <button
            type="button"
            onClick={busy ? undefined : save}
            disabled={busy}
            style={{
              position: 'fixed',
              right: 'calc(var(--sp-4) + var(--app-inset-right))',
              bottom: 'calc(var(--app-bottom-nav-space) + var(--app-nav-inset-bottom) - var(--app-keyboard-offset))',
              height: 54,
              padding: '0 18px',
              borderRadius: 'var(--r-pill)',
              border: 0,
              background: busy ? 'var(--c-ink-14)' : 'var(--text)',
              color: 'var(--c-white)',
              boxShadow: 'var(--shadow-2)',
              fontWeight: 900,
              cursor: busy ? 'default' : 'pointer',
              zIndex: 70,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 10,
              whiteSpace: 'nowrap',
              maxWidth: 'min(calc(100vw - 32px), 240px)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            <Save size={18} />
            {busy ? 'Сохраняем…' : 'Сохранить'}
          </button>
        </>
      )}
    </div>
  );
}

export function CollectionNewPage() {
  return <CollectionForm mode="new" />;
}

export function CollectionEditPage() {
  const params = useParams();
  const id = params.id;
  return <CollectionForm mode="edit" id={id} />;
}
