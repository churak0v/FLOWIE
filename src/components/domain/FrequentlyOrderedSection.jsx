import { useNavigate } from 'react-router-dom';
import { useAppState } from '../../state/AppState';
import { Grid } from '../layout/Grid';
import { ProductCard } from './ProductCard';

export function FrequentlyOrderedSection({ products, limit, showMoreHref, showMoreLabel = 'Показать ещё', view = 'grid', trailingCard = null, placement }) {
  const navigate = useNavigate();
  const { actions } = useAppState();
  const shownProducts = typeof limit === 'number' ? (products || []).slice(0, limit) : (products || []);
  const hasMore = typeof limit === 'number' && (products || []).length > shownProducts.length;

  return (
    <>
      <Grid style={view === 'list' ? { gridTemplateColumns: 'minmax(0, 1fr)', gap: 10 } : undefined}>
        {shownProducts.map((p) => (
          <ProductCard
            key={p.id}
            id={p.id}
            title={p.title}
            subtitle={p.subtitle}
            price={p.price}
            image={p.image}
            images={p.images}
            view={view}
            placement={placement}
            onOpen={() => navigate(`/product/${p.id}`)}
            onAdd={() => actions.addToCart(p.id, 1)}
          />
        ))}
        {trailingCard}
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
            color: 'var(--c-accent-contrast)',
            fontSize: 18,
            fontWeight: 1000,
            boxShadow: 'var(--shadow-accent)',
            cursor: 'pointer',
          }}
        >
          {showMoreLabel}
        </button>
      ) : null}
    </>
  );
}
