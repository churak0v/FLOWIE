import { useEffect, useMemo, useState } from 'react';
import { ArrowUpDown, ChevronLeft, Grid2X2, ListFilter, Rows3, Search, X } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AppShell } from './layout/AppShell';
import { Text } from './ui/Text';
import { IconButton } from './ui/IconButton';
import { Surface } from './ui/Surface';
import { BottomSheet } from './ui/BottomSheet';
import { FrequentlyOrderedSection } from './domain/FrequentlyOrderedSection';
import { useAppState } from '../state/AppState';
import { trackAnalytics } from '../lib/analytics';
import { useCatalogSearch } from '../lib/useCatalogSearch';
import { buildFlowerOptions, filterCatalogProducts, normalizePriceBoundary, PRICE_PRESETS, selectCatalogScopeProducts } from '../lib/catalogFilters';

const SORT_OPTIONS = [
  { value: 'default', label: 'По умолчанию' },
  { value: 'price_asc', label: 'Сначала дешевле' },
  { value: 'price_desc', label: 'Сначала дороже' },
];

function findBySlugOrId(list, raw) {
  if (!raw) return null;
  const text = String(raw);
  const asNumber = Number(text);
  if (Number.isFinite(asNumber)) return list.find((item) => Number(item?.id) === asNumber) || null;
  return list.find((item) => String(item?.slug || '') === text) || null;
}

function toInputValue(value) {
  const normalized = normalizePriceBoundary(value);
  return normalized == null ? '' : String(normalized);
}

export function Catalog() {
  const navigate = useNavigate();
  const location = useLocation();
  const { state } = useAppState();
  const query = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draftFlowers, setDraftFlowers] = useState([]);
  const [draftMin, setDraftMin] = useState('');
  const [draftMax, setDraftMax] = useState('');
  const [draftSort, setDraftSort] = useState('default');
  const [draftView, setDraftView] = useState('grid');

  const collectionId = query.get('collection');
  const scenarioId = query.get('scenario');
  const searchQuery = query.get('search') || '';
  const selectedFlowers = useMemo(() => query.getAll('flower').filter(Boolean), [query]);
  const minPrice = query.get('min');
  const maxPrice = query.get('max');
  const requestedSort = query.get('sort') || 'default';
  const sort = SORT_OPTIONS.some((option) => option.value === requestedSort) ? requestedSort : 'default';
  const view = ['list', 'large'].includes(query.get('view')) ? 'list' : 'grid';

  const collections = state.collections.items || [];
  const scenarios = state.collections.scenarios || [];
  const activeCollection = findBySlugOrId(collections, collectionId);
  const activeScenario = findBySlugOrId(scenarios, scenarioId);
  const title = activeCollection?.title || activeScenario?.title || 'Каталог цветов';

  const baseProducts = useMemo(() => {
    const allProducts = state.products.items || [];
    const ids = collectionId
      ? (activeCollection?.productIds || [])
      : scenarioId
        ? (activeScenario?.productIds || [])
        : null;
    return selectCatalogScopeProducts(allProducts, ids);
  }, [activeCollection, activeScenario, collectionId, scenarioId, state.products.items]);

  const flowerOptions = useMemo(() => buildFlowerOptions(state.products.items || []), [state.products.items]);
  const searchResult = useCatalogSearch({
    query: searchQuery,
    minPrice: filtersOpen ? draftMin : minPrice,
    maxPrice: filtersOpen ? draftMax : maxPrice,
    collection: collectionId,
    scenario: scenarioId,
  });
  const rankedProducts = useMemo(() => {
    if (!searchResult.data) return baseProducts;
    const byId = new Map(baseProducts.map((product) => [String(product.id), product]));
    return [...new Set(searchResult.data.productIds.map(String))].map((id) => byId.get(id)).filter(Boolean);
  }, [baseProducts, searchResult.data]);
  const localSearch = searchResult.data ? '' : searchQuery;
  const shown = useMemo(() => filterCatalogProducts(rankedProducts, {
    search: localSearch,
    flowers: selectedFlowers,
    min: minPrice,
    max: maxPrice,
    sort,
  }), [rankedProducts, maxPrice, minPrice, localSearch, selectedFlowers, sort]);

  const draftResultCount = useMemo(() => filterCatalogProducts(rankedProducts, {
    search: localSearch,
    flowers: draftFlowers,
    min: draftMin,
    max: draftMax,
    sort,
  }).length, [rankedProducts, draftFlowers, draftMax, draftMin, localSearch, sort]);

  const activeFilterCount = selectedFlowers.length + (normalizePriceBoundary(minPrice) != null || normalizePriceBoundary(maxPrice) != null ? 1 : 0);
  const hasCartItems = state.cart.items.some((item) => Number(item?.qty || 0) > 0);

  useEffect(() => {
    if (!searchQuery.trim() || searchResult.loading || filtersOpen) return undefined;
    const timer = window.setTimeout(() => {
      trackAnalytics('search', { meta: { query: searchQuery.trim(), resultCount: shown.length } });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [searchQuery, shown.length, searchResult.loading, filtersOpen]);

  function navigateWithParams(params, { replace = false } = {}) {
    const search = params.toString();
    navigate({ pathname: location.pathname, search: search ? `?${search}` : '' }, { replace });
  }

  function updateParam(name, value, { replace = false } = {}) {
    const params = new URLSearchParams(location.search);
    if (value == null || value === '' || value === 'default' || (name === 'view' && value === 'grid')) params.delete(name);
    else params.set(name, value);
    navigateWithParams(params, { replace });
  }

  function switchScope(type, value) {
    const params = new URLSearchParams(location.search);
    params.delete('collection');
    params.delete('scenario');
    if (type && value != null) params.set(type, String(value));
    trackAnalytics('filter_change', { meta: { filter: type || 'scope', value: String(value || 'all') } });
    navigateWithParams(params);
  }

  function openFilters() {
    setDraftFlowers(selectedFlowers);
    setDraftMin(toInputValue(minPrice));
    setDraftMax(toInputValue(maxPrice));
    setDraftSort(sort);
    setDraftView(view);
    setFiltersOpen(true);
  }

  function applyFilters() {
    const params = new URLSearchParams(location.search);
    params.delete('flower');
    draftFlowers.forEach((flower) => params.append('flower', flower));
    let min = normalizePriceBoundary(draftMin);
    let max = normalizePriceBoundary(draftMax);
    if (min != null && max != null && min > max) [min, max] = [max, min];
    if (min == null) params.delete('min'); else params.set('min', String(min));
    if (max == null) params.delete('max'); else params.set('max', String(max));
    if (draftSort === 'default') params.delete('sort'); else params.set('sort', draftSort);
    if (draftView === 'grid') params.delete('view'); else params.set('view', 'list');
    trackAnalytics('filter_change', { meta: { filter: 'catalog', value: `f:${draftFlowers.length}:p:${min ?? 'any'}-${max ?? 'any'}:s:${draftSort}:v:${draftView}` } });
    navigateWithParams(params);
    setFiltersOpen(false);
  }

  function resetDraft() {
    setDraftFlowers([]);
    setDraftMin('');
    setDraftMax('');
    setDraftSort('default');
    setDraftView('grid');
  }

  function resetAll() {
    trackAnalytics('filter_change', { meta: { filter: 'catalog', value: 'reset' } });
    navigate({ pathname: location.pathname, search: '' });
  }

  const filterChips = [
    { key: 'all', label: 'Все цветы', active: !collectionId && !scenarioId, onClick: () => switchScope(null, null) },
    ...collections.map((collection) => ({ key: `collection:${collection.id}`, label: collection.title || 'Подборка', active: activeCollection?.id === collection.id, onClick: () => switchScope('collection', collection.slug || collection.id) })),
    ...scenarios.map((scenario) => ({ key: `scenario:${scenario.id}`, label: scenario.title || 'Сценарий', active: activeScenario?.id === scenario.id, onClick: () => switchScope('scenario', scenario.slug || scenario.id) })),
  ];

  return (
    <>
      <AppShell style={{ '--app-content-inset-bottom': '0px', '--app-shell-extra-bottom': '80px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <IconButton onClick={() => navigate(-1)} aria-label="Назад"><ChevronLeft size={22} /></IconButton>
          <div style={{ minWidth: 0 }}>
            <Text variant="title">{title}</Text>
            <Text variant="caption" muted style={{ marginTop: 2 }}>{searchResult.loading ? 'Ищем букеты…' : `${shown.length} вариантов`}</Text>
          </div>
        </div>

        <div style={{ position: 'relative', marginTop: 18 }}>
          <Search aria-hidden="true" size={18} color="var(--muted)" style={{ position: 'absolute', left: 14, top: 13 }} />
          <input type="search" maxLength={160} value={searchQuery} onChange={(event) => updateParam('search', event.target.value, { replace: true })} placeholder="Название или пожелание к букету" aria-label="Поиск по каталогу" autoComplete="off" style={{ width: '100%', height: 44, padding: searchQuery ? '0 44px 0 42px' : '0 14px 0 42px', borderRadius: 14, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 16, boxSizing: 'border-box' }} />
          {searchQuery ? <button type="button" onClick={() => updateParam('search', '', { replace: true })} aria-label="Очистить поиск" style={{ position: 'absolute', right: 5, top: 4, width: 36, height: 36, border: 0, borderRadius: 10, background: 'transparent', color: 'var(--muted)', display: 'grid', placeItems: 'center', cursor: 'pointer' }}><X size={18} /></button> : null}
        </div>

        <div className="hide-scrollbar" style={{ marginTop: 12, display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
          {filterChips.map((chip) => <button key={chip.key} type="button" onClick={chip.onClick} aria-pressed={chip.active} style={{ minHeight: 38, padding: '0 13px', borderRadius: 999, border: chip.active ? '1px solid var(--accent)' : '1px solid var(--border)', background: chip.active ? 'var(--accent)' : 'var(--surface)', color: chip.active ? 'var(--c-accent-contrast)' : 'var(--text)', fontWeight: 850, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>{chip.label}</button>)}
        </div>

        <div style={{ marginTop: 18 }}>
          {shown.length ? <FrequentlyOrderedSection products={shown} view={view} /> : <Surface variant="soft" style={{ padding: '28px 18px', borderRadius: 'var(--r-lg)', border: '1px solid var(--border)', textAlign: 'center' }}><Text variant="title">Ничего не найдено</Text><Text variant="body" muted style={{ marginTop: 7 }}>Измените цветы, цену или подборку.</Text><button type="button" onClick={resetAll} style={{ marginTop: 16, minHeight: 44, padding: '0 18px', border: 0, borderRadius: 14, background: 'var(--accent)', color: 'var(--c-accent-contrast)', fontWeight: 900, cursor: 'pointer' }}>Сбросить всё</button></Surface>}
        </div>
      </AppShell>

      <div style={{ position: 'fixed', left: '50%', transform: 'translateX(-50%) translateY(var(--app-keyboard-offset))', bottom: `calc(${hasCartItems ? 140 : 96}px + var(--app-nav-inset-bottom))`, width: 'min(100%, var(--app-max))', padding: '0 16px', zIndex: 69, pointerEvents: 'none', boxSizing: 'border-box', display: 'flex', justifyContent: 'flex-end' }}>
        <button type="button" onClick={openFilters} aria-label={`Открыть фильтры${activeFilterCount ? `, активно ${activeFilterCount}` : ''}`} style={{ minWidth: 126, height: 52, padding: '0 17px', border: '1px solid var(--c-accent-border)', borderRadius: 999, background: 'var(--surface)', color: 'var(--text)', boxShadow: '0 16px 38px rgba(13,13,13,0.16)', fontWeight: 1000, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 9, cursor: 'pointer', pointerEvents: 'auto' }}>
          <ListFilter size={19} color="var(--accent)" />
          Фильтры
          {activeFilterCount ? <span style={{ minWidth: 23, height: 23, padding: '0 6px', borderRadius: 999, background: 'var(--accent)', color: 'var(--c-accent-contrast)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>{activeFilterCount}</span> : null}
        </button>
      </div>

      <BottomSheet open={filtersOpen} onClose={() => setFiltersOpen(false)} ariaLabel="Фильтры каталога">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}><Text variant="title">Фильтры</Text><button type="button" onClick={() => setFiltersOpen(false)} aria-label="Закрыть фильтры" style={{ width: 44, height: 44, borderRadius: 14, border: '1px solid var(--border)', background: 'var(--surface)', display: 'grid', placeItems: 'center', cursor: 'pointer' }}><X size={20} /></button></div>

        <section aria-labelledby="flower-filter-title" style={{ marginTop: 12 }}>
          <Text id="flower-filter-title" variant="subtitle">Какие цветы</Text>
          {flowerOptions.length ? <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>{flowerOptions.map((option) => { const checked = draftFlowers.includes(option.key); return <label key={option.key} style={{ minHeight: 48, padding: '8px 10px', borderRadius: 13, border: checked ? '1px solid var(--accent)' : '1px solid var(--border)', background: checked ? 'var(--c-accent-10)' : 'var(--surface)', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', minWidth: 0 }}><input type="checkbox" checked={checked} onChange={() => setDraftFlowers((current) => checked ? current.filter((key) => key !== option.key) : [...current, option.key])} /><span style={{ minWidth: 0, fontSize: 14, fontWeight: 850, lineHeight: 1.15 }}>{option.label} <span style={{ color: 'var(--muted)', fontWeight: 700 }}>· {option.count}</span></span></label>; })}</div> : <Text variant="body" muted style={{ marginTop: 8 }}>Составы цветов пока не заполнены.</Text>}
        </section>

        <section aria-labelledby="price-filter-title" style={{ marginTop: 22 }}>
          <Text id="price-filter-title" variant="subtitle">Какая цена</Text>
          <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>{PRICE_PRESETS.map((preset) => { const active = toInputValue(preset.min) === draftMin && toInputValue(preset.max) === draftMax; return <button key={preset.key} type="button" aria-pressed={active} onClick={() => { setDraftMin(toInputValue(preset.min)); setDraftMax(toInputValue(preset.max)); }} style={{ minHeight: 44, padding: '0 10px', borderRadius: 13, border: active ? '1px solid var(--accent)' : '1px solid var(--border)', background: active ? 'var(--c-accent-10)' : 'var(--surface)', color: 'var(--text)', fontWeight: 850, cursor: 'pointer' }}>{preset.label}</button>; })}</div>
          <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}><input type="number" inputMode="numeric" min="0" value={draftMin} onChange={(event) => setDraftMin(event.target.value)} placeholder="От, ₽" aria-label="Минимальная цена" style={{ height: 46, minWidth: 0, padding: '0 12px', borderRadius: 13, border: '1px solid var(--border)', background: 'var(--surface)', fontSize: 16 }} /><input type="number" inputMode="numeric" min="0" value={draftMax} onChange={(event) => setDraftMax(event.target.value)} placeholder="До, ₽" aria-label="Максимальная цена" style={{ height: 46, minWidth: 0, padding: '0 12px', borderRadius: 13, border: '1px solid var(--border)', background: 'var(--surface)', fontSize: 16 }} /></div>
        </section>

        <section aria-labelledby="display-filter-title" style={{ marginTop: 22 }}>
          <Text id="display-filter-title" variant="subtitle">Как отображать</Text>
          <label style={{ position: 'relative', display: 'block', marginTop: 10 }}>
            <ArrowUpDown aria-hidden="true" size={17} style={{ position: 'absolute', left: 13, top: 15, pointerEvents: 'none' }} />
            <select value={draftSort} onChange={(event) => setDraftSort(event.target.value)} aria-label="Сортировка" style={{ width: '100%', height: 48, padding: '0 12px 0 39px', borderRadius: 13, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontWeight: 850 }}>
              {SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <div role="group" aria-label="Размер карточек" style={{ marginTop: 8, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <button type="button" aria-pressed={draftView === 'grid'} onClick={() => setDraftView('grid')} style={{ minHeight: 46, borderRadius: 13, border: draftView === 'grid' ? '1px solid var(--accent)' : '1px solid var(--border)', background: draftView === 'grid' ? 'var(--c-accent-10)' : 'var(--surface)', color: 'var(--text)', fontWeight: 850, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}><Grid2X2 size={18} />Две колонки</button>
            <button type="button" aria-pressed={draftView === 'list'} onClick={() => setDraftView('list')} style={{ minHeight: 46, borderRadius: 13, border: draftView === 'list' ? '1px solid var(--accent)' : '1px solid var(--border)', background: draftView === 'list' ? 'var(--c-accent-10)' : 'var(--surface)', color: 'var(--text)', fontWeight: 850, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}><Rows3 size={18} />Списком</button>
          </div>
        </section>

        <div style={{ position: 'sticky', bottom: 0, margin: '22px -2px -2px', padding: '10px 2px 2px', background: 'var(--bg)', display: 'grid', gridTemplateColumns: '0.7fr 1.3fr', gap: 8 }}><button type="button" onClick={resetDraft} style={{ minHeight: 50, borderRadius: 14, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontWeight: 900, cursor: 'pointer' }}>Сбросить</button><button type="button" onClick={applyFilters} style={{ minHeight: 50, borderRadius: 14, border: 0, background: 'var(--accent)', color: 'var(--c-accent-contrast)', fontWeight: 1000, cursor: 'pointer' }}>{searchResult.loading ? 'Ищем…' : `Показать ${draftResultCount}`}</button></div>
      </BottomSheet>
    </>
  );
}
