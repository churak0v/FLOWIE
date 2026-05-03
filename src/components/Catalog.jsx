import React, { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { AppShell } from './layout/AppShell';
import { Text } from './ui/Text';
import { IconButton } from './ui/IconButton';
import { Surface } from './ui/Surface';
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
    ? activeCollection.title || 'Collection'
    : activeScenario
      ? activeScenario.title || 'Gift scenario'
      : 'Marketplace';

  const productIds = activeCollection
    ? activeCollection.productIds || []
    : activeScenario
      ? activeScenario.productIds || []
      : state.products.items.map((p) => p.id);

  const products = productIds.map((id) => state.products.items.find((p) => p.id === id)).filter(Boolean);
  const fallback = state.products.items;
  const shown = products.length ? products : fallback;
  const isAll = !activeCollection && !activeScenario;

  const filterChips = [
    { key: 'all', label: 'All gifts', href: '/catalog', active: isAll },
    ...collections.map((c) => ({
      key: `c:${c.id}`,
      label: c.title || 'Collection',
      href: `/catalog?collection=${encodeURIComponent(String(c.slug || c.id))}`,
      active: activeCollection?.id === c.id,
    })),
    ...scenarios.map((s) => ({
      key: `s:${s.id}`,
      label: s.title || 'Scenario',
      href: `/catalog?scenario=${encodeURIComponent(String(s.slug || s.id))}`,
      active: activeScenario?.id === s.id,
    })),
  ];

  return (
    <>
      <AppShell style={{ '--app-content-inset-bottom': '0px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <IconButton onClick={() => navigate(-1)} aria-label="Back">
            <ChevronLeft size={22} />
          </IconButton>
          <Text variant="title">{title}</Text>
        </div>

        <Surface
          variant="soft"
          style={{
            marginTop: 'var(--sp-6)',
            padding: '18px 16px',
            borderRadius: 'var(--r-lg)',
            border: '1px solid var(--border)',
            background: 'linear-gradient(135deg, rgba(198,83,109,0.10), rgba(255,255,255,0.86))',
          }}
        >
          <Text variant="subtitle">What would make her smile?</Text>
          <Text variant="body" muted style={{ marginTop: 4 }}>
            Choose from real wishlist gifts, then checkout with safe delivery.
          </Text>
        </Surface>

        <div
          className="hide-scrollbar"
          style={{
            marginTop: 28,
            display: 'flex',
            gap: 12,
            overflowX: 'auto',
            paddingBottom: 8,
            paddingRight: 2,
          }}
        >
          {filterChips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={() => navigate(chip.href)}
              style={{
                height: 42,
                padding: '0 16px',
                borderRadius: 999,
                border: chip.active ? '1px solid var(--accent)' : '1px solid var(--border)',
                background: chip.active ? 'var(--accent)' : 'var(--surface)',
                color: chip.active ? 'var(--c-white)' : 'var(--text)',
                fontWeight: 900,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              {chip.label}
            </button>
          ))}
        </div>

        <div style={{ marginTop: 24 }}>
          <FrequentlyOrderedSection products={shown} />
        </div>
      </AppShell>
    </>
  );
}
