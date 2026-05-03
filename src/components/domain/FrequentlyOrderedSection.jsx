import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppState } from '../../state/AppState';
import { Grid } from '../layout/Grid';
import { ProductCard } from './ProductCard';

export function FrequentlyOrderedSection({ products, limit, showMoreHref, showMoreLabel = 'Show more' }) {
  const navigate = useNavigate();
  const { actions } = useAppState();
  const shownProducts = typeof limit === 'number' ? (products || []).slice(0, limit) : (products || []);
  const hasMore = typeof limit === 'number' && (products || []).length > shownProducts.length;

  return (
    <>
      <Grid>
        {shownProducts.map((p) => (
          <ProductCard
            key={p.id}
            id={p.id}
            title={p.title}
            subtitle={p.subtitle}
            price={p.price}
            image={p.image}
            onOpen={() => navigate(`/product/${p.id}`)}
            onAdd={() => actions.addToCart(p.id, 1)}
          />
        ))}
      </Grid>

      {hasMore && showMoreHref ? (
        <button
          type="button"
          onClick={() => navigate(showMoreHref)}
          style={{
            width: '100%',
            marginTop: 18,
            minHeight: 58,
            borderRadius: 'var(--r-pill)',
            border: '1px solid var(--c-ink-12)',
            background: 'var(--accent)',
            color: 'var(--c-white)',
            fontSize: 18,
            fontWeight: 1000,
            boxShadow: '0 14px 34px rgba(198, 78, 113, 0.22)',
            cursor: 'pointer',
          }}
        >
          {showMoreLabel}
        </button>
      ) : null}
    </>
  );
}
