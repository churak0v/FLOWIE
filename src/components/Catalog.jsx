import React, { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { AppShell } from './layout/AppShell';
import { Text } from './ui/Text';
import { IconButton } from './ui/IconButton';
import { FrequentlyOrderedSection } from './domain/FrequentlyOrderedSection';
import { useAppState } from '../state/AppState';

function useQuery() {
  const { search } = useLocation();
  return useMemo(() => new URLSearchParams(search), [search]);
}

export function Catalog() {
  const navigate = useNavigate();
  const q = useQuery();
  const { state } = useAppState();

  const collectionId = q.get('collection');
  const scenarioId = q.get('scenario');

  const collections = state.collections.items || [];
  const scenarios = state.collections.scenarios || [];

  const findBySlugOrId = (list, raw) => {
    if (!raw) return null;
    const s = String(raw);
    const asNum = Number(s);
    if (Number.isFinite(asNum)) return list.find((x) => Number(x?.id) === asNum) || null;
    return list.find((x) => String(x?.slug || '') === s) || null;
  };

  const activeCollection = findBySlugOrId(collections, collectionId);
  const activeScenario = findBySlugOrId(scenarios, scenarioId);

  const title = activeCollection
    ? activeCollection.title || 'Подборка'
    : activeScenario
      ? activeScenario.title || 'Сценарий'
      : 'Каталог';

  const productIds = activeCollection
    ? activeCollection.productIds || []
    : activeScenario
      ? activeScenario.productIds || []
      : state.products.items.map((p) => p.id);

  const products = productIds.map((id) => state.products.items.find((p) => p.id === id)).filter(Boolean);
  const fallback = state.products.items;
  const shown = products.length ? products : fallback;

  return (
    <>
      <AppShell style={{ '--app-content-inset-bottom': '0px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <IconButton onClick={() => navigate(-1)} aria-label="Назад">
            <ChevronLeft size={22} />
          </IconButton>
          <Text variant="title">{title}</Text>
        </div>

        <div style={{ marginTop: 'var(--sp-6)' }}>
          <FrequentlyOrderedSection products={shown} />
        </div>
      </AppShell>
    </>
  );
}
