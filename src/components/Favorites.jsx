import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppState } from '../state/AppState';
import { AppShell } from './layout/AppShell';
import { Text } from './ui/Text';
import { FrequentlyOrderedSection } from './domain/FrequentlyOrderedSection';
import { Surface } from './ui/Surface';

export function Favorites() {
  const navigate = useNavigate();
  const { state } = useAppState();

  const products = useMemo(() => {
    const ids = new Set(state.favorites.productIds);
    return state.products.items.filter((p) => ids.has(p.id));
  }, [state.favorites.productIds, state.products.items]);

  return (
    <>
      <AppShell style={{ display: 'flex', flexDirection: 'column', '--app-content-inset-bottom': '0px' }}>
        <Text variant="title">Saved items</Text>

        {products.length ? (
          <div style={{ marginTop: 'var(--sp-6)' }}>
            <FrequentlyOrderedSection products={products} />
          </div>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Surface variant="soft" style={{ padding: 16, borderRadius: 'var(--r-lg)', textAlign: 'center' }}>
              <Text variant="subtitle">Nothing saved yet</Text>
              <div style={{ marginTop: 6 }}>
                <Text variant="body" muted>
                  Open an item and save it to compare gifts later.
                </Text>
              </div>
              <button
                type="button"
                onClick={() => navigate('/')}
                style={{
                  marginTop: 12,
                  height: 44,
                  borderRadius: 'var(--r-lg)',
                  border: 0,
                  background: 'var(--accent)',
                  color: 'var(--c-white)',
                  fontWeight: 900,
                  cursor: 'pointer',
                  padding: '0 14px',
                }}
              >
                Go home
              </button>
            </Surface>
          </div>
        )}
      </AppShell>
    </>
  );
}
